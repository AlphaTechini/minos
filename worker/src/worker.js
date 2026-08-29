import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, getAddress, Interface, isAddress, JsonRpcProvider, Wallet } from "ethers";
import { proofProvider } from "@gluwa/usc-sdk";

const sourceAbi = [
  "event PositionOpened(bytes32 indexed positionId, address indexed borrower, uint256 principal, bytes32 termsHash)",
  "event RepaymentRecorded(bytes32 indexed positionId, bytes32 indexed repaymentId, uint256 amount)",
  "event RepaymentReversed(bytes32 indexed positionId, bytes32 indexed repaymentId, bytes32 indexed reasonHash)"
];

const guardAbi = [
  "error QueryAlreadyProcessed(bytes32 queryId)",
  "function execute(uint8 action, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, tuple(bytes32 hash, bool isLeft)[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots) returns (bool)",
  "function advanceCoverage(bytes32 positionId, uint64 throughSourceBlock)",
  "function markCoverageStale(bytes32 positionId)"
];

const actionForEvent = {
  PositionOpened: 0,
  RepaymentRecorded: 1,
  RepaymentReversed: 2
};

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function numeric(name, fallback) {
  const value = process.env[name] ?? fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer.`);
  return parsed;
}

function requiredAddress(name) {
  const value = required(name);
  if (!isAddress(value)) throw new Error(`${name} must be a checksummed or lowercase EVM address.`);
  return getAddress(value);
}

function isReplayRejection(error) {
  return error instanceof Error && error.message.includes("QueryAlreadyProcessed");
}

function configuration() {
  return {
    sourceRpcUrl: required("SOURCE_CHAIN_RPC_URL"),
    creditcoinRpcUrl: required("CREDITCOIN_RPC_URL"),
    proofBuilderUrl: required("PROOF_BUILDER_URL"),
    sourceChainKey: numeric("SOURCE_CHAIN_KEY"),
    sourceContract: requiredAddress("SOURCE_POSITION_CONTRACT_ADDRESS"),
    guardContract: requiredAddress("PROOF_GUARD_CONTRACT_ADDRESS"),
    workerPrivateKey: required("CREDITCOIN_WORKER_PRIVATE_KEY"),
    startBlock: numeric("WORKER_START_BLOCK"),
    pollIntervalMs: numeric("WORKER_POLL_INTERVAL_MS", "15000"),
    blockBatchSize: numeric("WORKER_BLOCK_BATCH_SIZE", "250"),
    stateFile: resolve(process.env.WORKER_STATE_FILE ?? ".proofguard-worker-state.json")
  };
}

async function loadState(file, startBlock) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { nextBlock: startBlock, positionIds: [] };
  }
}

async function saveState(file, state) {
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
}

async function getLatestProofBuilderHeight(builderUrl, chainKey) {
  const endpoint = new URL(`/api/v1/attested-height/${chainKey}`, builderUrl);
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`Proof Builder attested-height request failed with HTTP ${response.status}.`);
  const body = await response.json();
  if (!Number.isSafeInteger(body.attestedHeight) || body.attestedHeight < 0) {
    throw new Error("Proof Builder returned an invalid attested height.");
  }
  return body.attestedHeight;
}

async function processRange(config, sourceProvider, guard, proofBuilder, state, fromBlock, toBlock) {
  const sourceInterface = new Interface(sourceAbi);
  const logs = await sourceProvider.getLogs({
    address: config.sourceContract,
    fromBlock,
    toBlock,
    topics: [[
      sourceInterface.getEvent("PositionOpened").topicHash,
      sourceInterface.getEvent("RepaymentRecorded").topicHash,
      sourceInterface.getEvent("RepaymentReversed").topicHash
    ]]
  });

  for (const log of logs) {
    const parsed = sourceInterface.parseLog(log);
    const action = actionForEvent[parsed.name];
    const positionId = parsed.args.positionId;
    await proofBuilder.waitUntilHeightAttested(config.sourceChainKey, log.blockNumber);
    const proofResult = await proofBuilder.getProof(log.transactionHash);
    if (!proofResult.success || !proofResult.data) {
      throw new Error(`Proof generation failed for ${log.transactionHash}: ${proofResult.error ?? "unknown error"}`);
    }

    const proof = proofResult.data;
    try {
      const transaction = await guard.execute(
        action,
        proof.chainKey,
        proof.headerNumber,
        proof.txBytes,
        proof.merkleProof.root,
        proof.merkleProof.siblings,
        proof.continuityProof.lowerEndpointDigest,
        proof.continuityProof.roots
      );
      await transaction.wait();
    } catch (error) {
      if (!isReplayRejection(error)) throw error;
      console.warn(`Skipping an already imported transaction ${log.transactionHash}.`);
    }

    if (!state.positionIds.includes(positionId)) state.positionIds.push(positionId);
    console.log(`Imported ${parsed.name} for ${positionId} from ${log.transactionHash}.`);
  }

  for (const positionId of state.positionIds) {
    const transaction = await guard.advanceCoverage(positionId, toBlock);
    await transaction.wait();
  }
}

async function run(config, once) {
  const sourceProvider = new JsonRpcProvider(config.sourceRpcUrl);
  const creditcoinProvider = new JsonRpcProvider(config.creditcoinRpcUrl);
  const guard = new Contract(config.guardContract, guardAbi, new Wallet(config.workerPrivateKey, creditcoinProvider));
  const proofBuilder = new proofProvider.service.ProofBuilder(config.sourceChainKey, config.proofBuilderUrl, 15_000);
  const state = await loadState(config.stateFile, config.startBlock);

  do {
    try {
      const latestBlock = await sourceProvider.getBlockNumber();
      const latestAttestedBlock = await getLatestProofBuilderHeight(config.proofBuilderUrl, config.sourceChainKey);
      const safeLatestBlock = Math.min(latestBlock, latestAttestedBlock);
      while (state.nextBlock <= latestBlock) {
        if (state.nextBlock > safeLatestBlock) break;
        const toBlock = Math.min(state.nextBlock + config.blockBatchSize - 1, safeLatestBlock);
        await processRange(config, sourceProvider, guard, proofBuilder, state, state.nextBlock, toBlock);
        state.nextBlock = toBlock + 1;
        await saveState(config.stateFile, state);
      }
    } catch (error) {
      console.error("Worker cycle failed. Coverage must be treated as stale until the range is retried.", error);
      for (const positionId of state.positionIds) {
        try {
          await (await guard.markCoverageStale(positionId)).wait();
        } catch (markError) {
          console.error(`Could not mark ${positionId} stale.`, markError);
        }
      }
      if (once) throw error;
    }

    if (!once) await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  } while (!once);
}

const config = configuration();
run(config, process.argv.includes("--once")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
