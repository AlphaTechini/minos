import { Contract, JsonRpcProvider, Wallet, isAddress, isHexString, getAddress } from "ethers";

const sourceAbi = [
  "function openPosition(bytes32 positionId, uint256 principal, bytes32 termsHash)",
  "function recordRepayment(bytes32 positionId, bytes32 repaymentId, uint256 amount)",
  "function reverseRepayment(bytes32 positionId, bytes32 repaymentId, bytes32 reasonHash)"
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in .env.`);
  return value;
}

function requiredBytes32(name, value) {
  if (!isHexString(value, 32)) throw new Error(`${name} must be a 32-byte hex value.`);
  return value;
}

function requiredAmount(name, value) {
  if (!value || !/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer string.`);
  return BigInt(value);
}

function parseOptions(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("Options must use --name value format.");
    options.set(key.slice(2), value);
  }
  return options;
}

function option(options, name) {
  const value = options.get(name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

async function send(label, contract, method, args) {
  console.log(`Submitting ${label}.`);
  const transaction = await contract[method](...args);
  const receipt = await transaction.wait();
  console.log(`Transaction: ${receipt.hash}`);
  console.log(`Block: ${receipt.blockNumber}`);
}

async function main() {
  const [command, ...rawOptions] = process.argv.slice(2).filter((argument) => argument !== "--");
  if (!command || !["open", "repay", "reverse"].includes(command)) {
    throw new Error("Usage: source-flow.mjs <open|repay|reverse> --position-id <bytes32> ...");
  }

  const options = parseOptions(rawOptions);
  const sourceAddress = required("SOURCE_POSITION_CONTRACT_ADDRESS");
  if (!isAddress(sourceAddress)) throw new Error("SOURCE_POSITION_CONTRACT_ADDRESS must be an EVM address.");

  const provider = new JsonRpcProvider(required("SOURCE_CHAIN_RPC_URL"));
  const signerKey = command === "reverse"
    ? process.env.SOURCE_OWNER_PRIVATE_KEY ?? required("SOURCE_DEPLOYER_PRIVATE_KEY")
    : process.env.SOURCE_BORROWER_PRIVATE_KEY ?? required("SOURCE_DEPLOYER_PRIVATE_KEY");
  const signer = new Wallet(signerKey, provider);
  if (
    command === "reverse"
      && getAddress(await signer.getAddress()) !== getAddress(required("SOURCE_OWNER_ADDRESS"))
  ) throw new Error("The reversal signer must match SOURCE_OWNER_ADDRESS.");

  const contract = new Contract(sourceAddress, sourceAbi, signer);
  const positionId = requiredBytes32("position-id", option(options, "position-id"));

  if (command === "open") {
    await send("PositionOpened", contract, "openPosition", [
      positionId,
      requiredAmount("principal", option(options, "principal")),
      requiredBytes32("terms-hash", option(options, "terms-hash"))
    ]);
    return;
  }

  const repaymentId = requiredBytes32("repayment-id", option(options, "repayment-id"));
  if (command === "repay") {
    await send("RepaymentRecorded", contract, "recordRepayment", [
      positionId,
      repaymentId,
      requiredAmount("amount", option(options, "amount"))
    ]);
    return;
  }

  await send("RepaymentReversed", contract, "reverseRepayment", [
    positionId,
    repaymentId,
    requiredBytes32("reason-hash", option(options, "reason-hash"))
  ]);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
