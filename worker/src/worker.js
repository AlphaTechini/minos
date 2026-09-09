import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Contract,
  getAddress,
  Interface,
  isAddress,
  isHexString,
  JsonRpcProvider,
  keccak256,
  Wallet,
  ZeroAddress
} from "ethers";
import { proofProvider } from "@gluwa/usc-sdk";

const sourceAbi = [
  "function owner() view returns (address)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event PositionOpened(bytes32 indexed positionId, address indexed borrower, uint256 principal, bytes32 termsHash)",
  "event RepaymentRecorded(bytes32 indexed positionId, bytes32 indexed repaymentId, uint256 amount)",
  "event RepaymentReversed(bytes32 indexed positionId, bytes32 indexed repaymentId, bytes32 indexed reasonHash)"
];

const guardAbi = [
  "error EventAlreadyProcessed(bytes32 eventId)",
  "function execute(bytes32 policyId, uint8 action, uint32 receiptLogIndex, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, tuple(bytes32 hash, bool isLeft)[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots) returns (bytes32 eventId)",
  "event ProofGuardAccepted(bytes32 indexed eventId, bytes32 indexed policyId, bytes32 indexed positionId, uint8 action, uint64 sourceBlock, uint64 transactionIndex, uint32 logIndex)"
];

const fullFileAbi = [
  "function advanceCoverage(bytes32 positionId, uint64 throughSourceBlock)",
  "function markCoverageIncomplete(bytes32 positionId, uint64 observedSourceBlock)",
  "function markCoverageStale(bytes32 positionId)"
];

const registryAbi = [
  "function getPolicy(bytes32 policyId) view returns (tuple(bytes32 policyId, bytes32 compilerVersion, uint64 policyVersion, bytes32 predecessor, uint64 sourceChainKey, uint256 sourceEvmChainId, address sourceContract, bytes32 sourceCodeHash, address sourceOwner, uint64 sourceStartBlock, address destinationApplication, uint64 maxCoverageAgeBlocks, uint16 loanRatioBps, uint256 minPrincipal, uint256 maxPrincipal, bytes32 rulesHash, bool active, bool sourcePaused))",
  "function reportSourceChange(bytes32 policyId, bytes32 observedCodeHash, address observedOwner)",
  "function reportUnsupportedSourceEvent(bytes32 policyId, bytes32 eventSignature, uint64 sourceBlock)"
];

const sourceInterface = new Interface(sourceAbi);
const guardInterface = new Interface(guardAbi);
const eventActions = new Map([
  [sourceInterface.getEvent("PositionOpened").topicHash, 0],
  [sourceInterface.getEvent("RepaymentRecorded").topicHash, 1],
  [sourceInterface.getEvent("RepaymentReversed").topicHash, 2]
]);
const ownershipTransferredTopic = sourceInterface.getEvent("OwnershipTransferred").topicHash;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function numeric(name, fallback) {
  const value = process.env[name] ?? fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function requiredAddress(name) {
  const value = required(name);
  if (!isAddress(value)) throw new Error(`${name} must be a checksummed or lowercase EVM address.`);
  return getAddress(value);
}

function requiredBytes32(name) {
  const value = required(name);
  if (!isHexString(value, 32)) throw new Error(`${name} must be bytes32.`);
  return value;
}

function isReplayRejection(error) {
  return error instanceof Error && error.message.includes("EventAlreadyProcessed");
}

function configuration() {
  return {
    sourceRpcUrl: required("SOURCE_CHAIN_RPC_URL"),
    creditcoinRpcUrl: required("CREDITCOIN_RPC_URL"),
    proofBuilderUrl: required("PROOF_BUILDER_URL"),
    sourceChainKey: numeric("SOURCE_CHAIN_KEY"),
    sourceContract: requiredAddress("SOURCE_POSITION_CONTRACT_ADDRESS"),
    guardContract: requiredAddress("PROOF_GUARD_CONTRACT_ADDRESS"),
    fullFileContract: requiredAddress("FULLFILE_CONTRACT_ADDRESS"),
    registryContract: requiredAddress("LOAN_POLICY_REGISTRY_ADDRESS"),
    policyId: requiredBytes32("POLICY_ID"),
    workerPrivateKey: required("CREDITCOIN_WORKER_PRIVATE_KEY"),
    startBlock: numeric("WORKER_START_BLOCK"),
    pollIntervalMs: numeric("WORKER_POLL_INTERVAL_MS", "15000"),
    blockBatchSize: numeric("WORKER_BLOCK_BATCH_SIZE", "250"),
    stateFile: resolve(process.env.WORKER_STATE_FILE ?? ".proofguard-worker-state.json")
  };
}

function initialState(config) {
  return {
    sourceContract: config.sourceContract,
    policyId: config.policyId,
    nextBlock: config.startBlock,
    positionIds: [],
    events: {},
    blockedAt: null
  };
}

async function loadState(file, config) {
  try {
    const state = JSON.parse(await readFile(file, "utf8"));
    if (state.sourceContract !== config.sourceContract || state.policyId !== config.policyId) {
      return initialState(config);
    }
    return state;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return initialState(config);
  }
}

async function saveState(file, state) {
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
}

async function getLatestProofBuilderHeight(builderUrl, chainKey) {
  const endpoint = new URL(`/api/v1/attested-height/${chainKey}`, builderUrl);
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Proof Builder attested-height request failed with HTTP ${response.status}.`);
  }
  const body = await response.json();
  if (!Number.isSafeInteger(body.attestedHeight) || body.attestedHeight < 0) {
    throw new Error("Proof Builder returned an invalid attested height.");
  }
  return body.attestedHeight;
}

async function markAllIncomplete(fullFile, state, sourceBlock) {
  for (const positionId of state.positionIds) {
    await (await fullFile.markCoverageIncomplete(positionId, sourceBlock)).wait();
  }
}

async function verifySource(config, sourceProvider, source, registry, fullFile, policy, state) {
  const [code, owner] = await Promise.all([
    sourceProvider.getCode(config.sourceContract),
    source.owner()
  ]);
  const observedCodeHash = keccak256(code);
  const observedOwner = getAddress(owner);
  const sourceMatches = observedCodeHash === policy.sourceCodeHash
    && observedOwner === getAddress(policy.sourceOwner);
  if (sourceMatches && !policy.sourcePaused) return true;

  if (!policy.sourcePaused) {
    await (await registry.reportSourceChange(config.policyId, observedCodeHash, observedOwner)).wait();
  }
  await markAllIncomplete(fullFile, state, state.nextBlock);
  state.blockedAt = state.nextBlock;
  await saveState(config.stateFile, state);
  console.error("Source identity changed or the policy is paused. Coverage was not advanced.");
  return false;
}

function receiptLogIndex(receipt, log) {
  const index = receipt.logs.findIndex((receiptLog) => receiptLog.index === log.index);
  if (index < 0) throw new Error(`Could not locate receipt-local log index for ${log.transactionHash}.`);
  return index;
}

async function processRecognizedLog(config, sourceProvider, guard, proofBuilder, state, log) {
  const parsed = sourceInterface.parseLog(log);
  const action = eventActions.get(log.topics[0]);
  const positionId = parsed.args.positionId;
  const receipt = await sourceProvider.getTransactionReceipt(log.transactionHash);
  if (!receipt) throw new Error(`Missing source receipt ${log.transactionHash}.`);
  const localLogIndex = receiptLogIndex(receipt, log);

  await proofBuilder.waitUntilHeightAttested(config.sourceChainKey, log.blockNumber);
  const proofResult = await proofBuilder.getProof(log.transactionHash);
  if (!proofResult.success || !proofResult.data) {
    throw new Error(
      `Proof generation failed for ${log.transactionHash}: ${proofResult.error ?? "unknown error"}`
    );
  }

  const proof = proofResult.data;
  let eventId;
  try {
    const transaction = await guard.execute(
      config.policyId,
      action,
      localLogIndex,
      proof.chainKey,
      proof.headerNumber,
      proof.txBytes,
      proof.merkleProof.root,
      proof.merkleProof.siblings,
      proof.continuityProof.lowerEndpointDigest,
      proof.continuityProof.roots
    );
    const creditcoinReceipt = await transaction.wait();
    for (const resultLog of creditcoinReceipt.logs) {
      try {
        const accepted = guardInterface.parseLog(resultLog);
        if (accepted?.name === "ProofGuardAccepted") eventId = accepted.args.eventId;
      } catch {
        // Ignore logs emitted by the verifier and FullFile contracts.
      }
    }
    if (!eventId) throw new Error(`ProofGuardAccepted was not emitted for ${log.transactionHash}.`);
  } catch (error) {
    if (!isReplayRejection(error)) throw error;
    console.warn(`Skipping an already imported event in ${log.transactionHash} at log ${localLogIndex}.`);
  }

  if (!state.positionIds.includes(positionId)) state.positionIds.push(positionId);
  state.events[`${log.transactionHash}:${localLogIndex}`] = {
    transactionHash: log.transactionHash,
    receiptLogIndex: localLogIndex,
    blockNumber: log.blockNumber,
    positionId,
    eventName: parsed.name,
    eventId: eventId ?? state.events[`${log.transactionHash}:${localLogIndex}`]?.eventId ?? null
  };
  console.log(`Imported ${parsed.name} for ${positionId} from ${log.transactionHash}.`);
}

async function processRange(
  config,
  sourceProvider,
  guard,
  fullFile,
  registry,
  proofBuilder,
  state,
  fromBlock,
  toBlock
) {
  const logs = await sourceProvider.getLogs({
    address: config.sourceContract,
    fromBlock,
    toBlock
  });
  logs.sort((left, right) =>
    left.blockNumber - right.blockNumber
    || left.transactionIndex - right.transactionIndex
    || left.index - right.index
  );

  for (const log of logs) {
    const topic = log.topics[0];
    if (eventActions.has(topic)) {
      await processRecognizedLog(config, sourceProvider, guard, proofBuilder, state, log);
      continue;
    }

    if (topic === ownershipTransferredTopic) {
      const parsed = sourceInterface.parseLog(log);
      if (parsed.args.previousOwner === ZeroAddress && log.blockNumber === config.startBlock) continue;
    }

    await (await registry.reportUnsupportedSourceEvent(config.policyId, topic, log.blockNumber)).wait();
    await markAllIncomplete(fullFile, state, log.blockNumber);
    state.blockedAt = log.blockNumber;
    await saveState(config.stateFile, state);
    console.error(`Unsupported source event ${topic} observed at block ${log.blockNumber}.`);
    return false;
  }

  for (const positionId of state.positionIds) {
    await (await fullFile.advanceCoverage(positionId, toBlock)).wait();
  }
  return true;
}

async function run(config, once) {
  const sourceProvider = new JsonRpcProvider(config.sourceRpcUrl);
  const creditcoinProvider = new JsonRpcProvider(config.creditcoinRpcUrl);
  const signer = new Wallet(config.workerPrivateKey, creditcoinProvider);
  const source = new Contract(config.sourceContract, sourceAbi, sourceProvider);
  const guard = new Contract(config.guardContract, guardAbi, signer);
  const fullFile = new Contract(config.fullFileContract, fullFileAbi, signer);
  const registry = new Contract(config.registryContract, registryAbi, signer);
  const proofBuilder = new proofProvider.service.ProofBuilder(
    config.sourceChainKey, config.proofBuilderUrl, 15_000
  );
  const state = await loadState(config.stateFile, config);

  do {
    try {
      const policy = await registry.getPolicy(config.policyId);
      if (!await verifySource(config, sourceProvider, source, registry, fullFile, policy, state)) break;

      const latestBlock = await sourceProvider.getBlockNumber();
      const latestAttestedBlock = await getLatestProofBuilderHeight(
        config.proofBuilderUrl, config.sourceChainKey
      );
      const safeLatestBlock = Math.min(latestBlock, latestAttestedBlock);
      while (state.nextBlock <= safeLatestBlock) {
        const toBlock = Math.min(state.nextBlock + config.blockBatchSize - 1, safeLatestBlock);
        const complete = await processRange(
          config,
          sourceProvider,
          guard,
          fullFile,
          registry,
          proofBuilder,
          state,
          state.nextBlock,
          toBlock
        );
        if (!complete) break;
        state.nextBlock = toBlock + 1;
        state.blockedAt = null;
        await saveState(config.stateFile, state);
      }
      if (state.blockedAt !== null) break;
    } catch (error) {
      console.error("Worker cycle failed. Coverage must be treated as stale until the range is retried.", error);
      for (const positionId of state.positionIds) {
        try {
          await (await fullFile.markCoverageStale(positionId)).wait();
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
