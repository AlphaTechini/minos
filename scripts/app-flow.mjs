import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, getAddress, Interface, isAddress, isHexString, JsonRpcProvider, Wallet } from "ethers";

const guardAbi = [
  "error PositionIneligible(uint8 reason)",
  "function evaluateLoan(bytes32 policyId, bytes32 positionId, bytes32 candidateEventId) view returns (bool eligible, uint8 reason)",
  "function authorizeLoan(bytes32 policyId, bytes32 positionId, bytes32 candidateEventId) returns (bytes32 decisionId, uint256 amount)",
  "event DecisionRecorded(bytes32 indexed decisionId, bytes32 indexed policyId, bytes32 indexed positionId, bytes32 candidateEventId, bytes32 authorizationNullifier, uint256 amount)"
];

const fullFileAbi = [
  "function getPosition(bytes32 positionId) view returns (tuple(bytes32 policyId, address borrower, uint256 principal, uint256 repaidAmount, bytes32 termsHash, bytes32 qualifyingRepaymentId, bytes32 qualifyingRepaymentEventId, uint8 state, tuple(uint64 blockNumber, uint64 transactionIndex, uint32 logIndex) lastSource, uint64 stateVersion, uint64 enrollmentBlock))",
  "function getCoverage(bytes32 positionId) view returns (tuple(uint64 throughSourceBlock, uint64 updatedAtCreditcoinBlock, uint8 status))"
];

const vaultAbi = [
  "function releasedLoans(bytes32 positionId) view returns (uint256)",
  "event VaultFunded(address indexed sender, uint256 amount)"
];

const guardInterface = new Interface(guardAbi);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredAddress(name) {
  const value = required(name);
  if (!isAddress(value)) throw new Error(`${name} must be an EVM address.`);
  return getAddress(value);
}

function requiredBytes32(name, value) {
  if (!isHexString(value, 32)) throw new Error(`${name} must be bytes32.`);
  return value;
}

function parseOptions(args) {
  const options = new Map();
  const filtered = args.filter((argument) => argument !== "--");
  for (let index = 0; index < filtered.length; index += 2) {
    if (!filtered[index]?.startsWith("--") || filtered[index + 1] === undefined) {
      throw new Error("Options must use --name value format.");
    }
    options.set(filtered[index].slice(2), filtered[index + 1]);
  }
  return options;
}

function option(options, name) {
  const value = options.get(name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function json(value) {
  return JSON.stringify(value, (_, nested) => typeof nested === "bigint" ? nested.toString() : nested, 2);
}

function errorName(error) {
  const data = error.data ?? error.info?.error?.data ?? error.error?.data;
  if (typeof data === "string") {
    try {
      const parsed = guardInterface.parseError(data);
      if (parsed) return `${parsed.name}(${parsed.args.join(",")})`;
    } catch {
      // Keep the provider's message when the revert is not a guard error.
    }
  }
  return error.shortMessage ?? error.message ?? String(error);
}

async function repaymentEventId(options, positionId) {
  const supplied = options.get("event-id");
  if (supplied) return requiredBytes32("event-id", supplied);

  const statePath = resolve(process.env.WORKER_STATE_FILE ?? ".proofguard-worker-state.json");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const match = Object.values(state.events ?? {})
    .filter((event) => event.positionId === positionId && event.eventName === "RepaymentRecorded" && event.eventId)
    .sort((left, right) => right.blockNumber - left.blockNumber)[0];
  if (!match) throw new Error("No imported RepaymentRecorded event was found for this position.");
  return match.eventId;
}

async function main() {
  const [command, ...args] = process.argv.slice(2).filter((argument) => argument !== "--");
  if (!command || !["status", "evaluate", "authorize", "fund"].includes(command)) {
    throw new Error("Usage: app-flow.mjs <status|evaluate|authorize|fund> [options]");
  }

  const options = parseOptions(args);
  const provider = new JsonRpcProvider(required("CREDITCOIN_RPC_URL"));
  const guardAddress = requiredAddress("PROOF_GUARD_CONTRACT_ADDRESS");
  const fullFile = new Contract(requiredAddress("FULLFILE_CONTRACT_ADDRESS"), fullFileAbi, provider);
  const vaultAddress = requiredAddress("LOAN_VAULT_CONTRACT_ADDRESS");

  if (command === "fund") {
    const amount = option(options, "amount");
    if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) throw new Error("--amount must be positive wei.");
    const signer = new Wallet(required("CREDITCOIN_DEPLOYER_PRIVATE_KEY"), provider);
    const receipt = await (await signer.sendTransaction({ to: vaultAddress, value: BigInt(amount) })).wait();
    console.log(`Vault funding transaction: ${receipt.hash}`);
    return;
  }

  const positionId = requiredBytes32("position-id", option(options, "position-id"));
  if (command === "status") {
    const vault = new Contract(vaultAddress, vaultAbi, provider);
    const [position, coverage, releasedLoan] = await Promise.all([
      fullFile.getPosition(positionId),
      fullFile.getCoverage(positionId),
      vault.releasedLoans(positionId)
    ]);
    console.log(json({ position, coverage, releasedLoan }));
    return;
  }

  const policyId = requiredBytes32("POLICY_ID", required("POLICY_ID"));
  const candidateEventId = await repaymentEventId(options, positionId);
  if (command === "evaluate") {
    const guard = new Contract(guardAddress, guardAbi, provider);
    const [eligible, reason] = await guard.evaluateLoan(policyId, positionId, candidateEventId);
    console.log(json({ eligible, reason, candidateEventId }));
    return;
  }

  const borrowerKey = process.env.CREDITCOIN_BORROWER_PRIVATE_KEY
    ?? process.env.SOURCE_BORROWER_PRIVATE_KEY
    ?? required("SOURCE_DEPLOYER_PRIVATE_KEY");
  const guard = new Contract(guardAddress, guardAbi, new Wallet(borrowerKey, provider));
  const receipt = await (await guard.authorizeLoan(policyId, positionId, candidateEventId)).wait();
  console.log(`Loan authorization transaction: ${receipt.hash}`);
}

main().catch((error) => {
  console.error(errorName(error));
  process.exitCode = 1;
});
