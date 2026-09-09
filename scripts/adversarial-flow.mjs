import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, ContractFactory, id, Interface, JsonRpcProvider, Wallet } from "ethers";
import { proofProvider } from "@gluwa/usc-sdk";

const sourceAbi = [
  "function openPosition(bytes32 positionId, uint256 principal, bytes32 termsHash)",
  "event PositionOpened(bytes32 indexed positionId, address indexed borrower, uint256 principal, bytes32 termsHash)"
];

const guardAbi = [
  "error InvalidSourceChain(uint64 chainKey)",
  "error InvalidSourceContract(address emitter)",
  "error EventAlreadyProcessed(bytes32 eventId)",
  "function execute(bytes32 policyId, uint8 action, uint32 receiptLogIndex, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, tuple(bytes32 hash, bool isLeft)[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots) returns (bytes32 eventId)",
  "function evaluateLoan(bytes32 policyId, bytes32 positionId, bytes32 candidateEventId) view returns (bool eligible, uint8 reason)"
];

const fullFileAbi = [
  "function markCoverageStale(bytes32 positionId)"
];

const guardInterface = new Interface(guardAbi);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function loadArtifact(relativePath) {
  const artifact = JSON.parse(await readFile(resolve(relativePath), "utf8"));
  return { abi: artifact.abi, bytecode: artifact.bytecode.object };
}

function revertName(error) {
  const data = error.data ?? error.info?.error?.data ?? error.error?.data;
  if (typeof data === "string") {
    try {
      return guardInterface.parseError(data)?.name ?? "UnknownRevert";
    } catch {
      return "UnknownRevert";
    }
  }
  return error.shortMessage ?? error.message;
}

async function proofArguments(proofBuilder, sourceProvider, transactionHash, topic) {
  const receipt = await sourceProvider.getTransactionReceipt(transactionHash);
  if (!receipt) throw new Error(`Missing source receipt ${transactionHash}.`);
  const receiptLogIndex = receipt.logs.findIndex((log) => log.topics[0] === topic);
  if (receiptLogIndex < 0) throw new Error("The expected source event was not emitted.");

  await proofBuilder.waitUntilHeightAttested(Number(required("SOURCE_CHAIN_KEY")), receipt.blockNumber);
  const result = await proofBuilder.getProof(transactionHash);
  if (!result.success || !result.data) {
    throw new Error(`Proof generation failed: ${result.error ?? "unknown error"}`);
  }
  return { proof: result.data, receiptLogIndex };
}

function executeArguments(proof, receiptLogIndex, chainKey = proof.chainKey) {
  return [
    required("POLICY_ID"),
    0,
    receiptLogIndex,
    chainKey,
    proof.headerNumber,
    proof.txBytes,
    proof.merkleProof.root,
    proof.merkleProof.siblings,
    proof.continuityProof.lowerEndpointDigest,
    proof.continuityProof.roots
  ];
}

async function workerEvent(positionId, eventName) {
  const state = JSON.parse(
    await readFile(resolve(process.env.WORKER_STATE_FILE ?? ".proofguard-worker-state.json"), "utf8")
  );
  const event = Object.values(state.events ?? {})
    .filter((entry) => entry.positionId === positionId && entry.eventName === eventName)
    .sort((left, right) => right.blockNumber - left.blockNumber)[0];
  if (!event) throw new Error(`No worker event ${eventName} exists for ${positionId}.`);
  return event;
}

async function expectRevert(label, expected, action, publicEvidence) {
  let observed = "NoRevert";
  try {
    await action();
  } catch (error) {
    observed = revertName(error);
  }
  return {
    scenario: label,
    passed: observed === expected,
    expected,
    observed,
    ...publicEvidence,
    checkedAt: new Date().toISOString()
  };
}

async function fakeSource(context) {
  const sourceWallet = new Wallet(required("SOURCE_DEPLOYER_PRIVATE_KEY"), context.sourceProvider);
  const artifact = await loadArtifact("contracts/out/SourceLoanPositions.sol/SourceLoanPositions.json");
  const fake = await new ContractFactory(artifact.abi, artifact.bytecode, sourceWallet)
    .deploy(await sourceWallet.getAddress());
  await fake.waitForDeployment();

  const positionId = id(`proofguard:fake:${crypto.randomUUID()}`);
  const termsHash = id(`proofguard:fake-terms:${crypto.randomUUID()}`);
  const sourceReceipt = await (await fake.openPosition(
    positionId, BigInt(required("POLICY_MIN_PRINCIPAL_WEI")), termsHash
  )).wait();
  const { proof, receiptLogIndex } = await proofArguments(
    context.proofBuilder,
    context.sourceProvider,
    sourceReceipt.hash,
    new Interface(sourceAbi).getEvent("PositionOpened").topicHash
  );

  return expectRevert(
    "fake-source",
    "InvalidSourceContract",
    () => context.guard.execute.staticCall(...executeArguments(proof, receiptLogIndex)),
    { sourceTransactionHash: sourceReceipt.hash, fakeSourceContract: await fake.getAddress() }
  );
}

async function eventProofScenario(context, scenario, expected, positionId, chainKeyOffset = 0) {
  const event = await workerEvent(positionId, "PositionOpened");
  const { proof, receiptLogIndex } = await proofArguments(
    context.proofBuilder,
    context.sourceProvider,
    event.transactionHash,
    new Interface(sourceAbi).getEvent("PositionOpened").topicHash
  );
  return expectRevert(
    scenario,
    expected,
    () => context.guard.execute.staticCall(
      ...executeArguments(proof, receiptLogIndex, Number(proof.chainKey) + chainKeyOffset)
    ),
    { sourceTransactionHash: event.transactionHash, eventId: event.eventId }
  );
}

async function staleCoverage(context, positionId) {
  const repayment = await workerEvent(positionId, "RepaymentRecorded");
  await (await context.fullFile.markCoverageStale(positionId)).wait();
  const [eligible, reason] = await context.guard.evaluateLoan(
    required("POLICY_ID"), positionId, repayment.eventId
  );
  return {
    scenario: "stale-coverage",
    passed: !eligible && Number(reason) === 5,
    expected: "CoverageNotCurrent",
    observed: !eligible && Number(reason) === 5 ? "CoverageNotCurrent" : `EligibilityReason(${reason})`,
    eventId: repayment.eventId,
    checkedAt: new Date().toISOString()
  };
}

async function saveResult(result) {
  const paths = [
    resolve("deployments/adversarial-results.json"),
    resolve("static/adversarial-results.json")
  ];
  let results = [];
  try {
    results = JSON.parse(await readFile(paths[0], "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  results = [...results.filter((entry) => entry.scenario !== result.scenario), result];
  for (const path of paths) await writeFile(path, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}

async function main() {
  const [scenario, positionId] = process.argv.slice(2).filter((argument) => argument !== "--");
  if (!scenario || !["fake-source", "replay", "wrong-chain", "stale-coverage"].includes(scenario)) {
    throw new Error("Usage: adversarial-flow.mjs <fake-source|replay|wrong-chain|stale-coverage> [positionId]");
  }
  if (scenario !== "fake-source" && !positionId) throw new Error("A position ID is required.");

  const sourceProvider = new JsonRpcProvider(required("SOURCE_CHAIN_RPC_URL"));
  const creditcoinProvider = new JsonRpcProvider(required("CREDITCOIN_RPC_URL"));
  const worker = new Wallet(required("CREDITCOIN_WORKER_PRIVATE_KEY"), creditcoinProvider);
  const context = {
    sourceProvider,
    proofBuilder: new proofProvider.service.ProofBuilder(
      Number(required("SOURCE_CHAIN_KEY")), required("PROOF_BUILDER_URL"), 15_000
    ),
    guard: new Contract(required("PROOF_GUARD_CONTRACT_ADDRESS"), guardAbi, worker),
    fullFile: new Contract(required("FULLFILE_CONTRACT_ADDRESS"), fullFileAbi, worker)
  };

  const result = scenario === "fake-source"
    ? await fakeSource(context)
    : scenario === "replay"
      ? await eventProofScenario(context, "replay", "EventAlreadyProcessed", positionId)
      : scenario === "wrong-chain"
        ? await eventProofScenario(context, "wrong-chain", "InvalidSourceChain", positionId, 1)
        : await staleCoverage(context, positionId);
  await saveResult(result);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
