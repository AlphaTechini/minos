import { AbiCoder, getAddress, id, isAddress, isHexString, keccak256, toUtf8Bytes, ZeroHash } from "ethers";

export const COMPILER_NAME = "proofguard-loan-policy-compiler/v1";
export const COMPILER_VERSION = keccak256(toUtf8Bytes(COMPILER_NAME));

export const loanRules = Object.freeze({
  sourceContractType: "project-owned-non-upgradeable",
  supportedEvents: Object.freeze([
    Object.freeze({
      name: "PositionOpened",
      signature: id("PositionOpened(bytes32,address,uint256,bytes32)"),
      semantics: "create-one-enrolled-loan-position"
    }),
    Object.freeze({
      name: "RepaymentRecorded",
      signature: id("RepaymentRecorded(bytes32,bytes32,uint256)"),
      semantics: "record-one-full-principal-repayment"
    }),
    Object.freeze({
      name: "RepaymentReversed",
      signature: id("RepaymentReversed(bytes32,bytes32,bytes32)"),
      semantics: "reverse-the-recorded-repayment"
    })
  ]),
  unknownSourceEvents: "fail-closed",
  replayScope: "policy-destination-action-event",
  protectedAction: "RELEASE_TCTC_LOAN"
});

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function positiveInteger(name, value, { maximum } = {}) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`${name} must be an unsigned integer string.`);
  }
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`${name} must be greater than zero.`);
  if (maximum !== undefined && parsed > maximum) throw new Error(`${name} exceeds ${maximum}.`);
  return parsed;
}

function uint64(name, value) {
  return positiveInteger(name, String(value), { maximum: (1n << 64n) - 1n });
}

function address(name, value) {
  if (!isAddress(value)) throw new Error(`${name} must be an EVM address.`);
  return getAddress(value);
}

export function compileLoanPolicy(input) {
  const policyVersion = uint64("policyVersion", input.policyVersion);
  const sourceChainKey = uint64("sourceChainKey", input.sourceChainKey);
  const sourceEvmChainId = positiveInteger("sourceEvmChainId", String(input.sourceEvmChainId));
  const sourceStartBlock = uint64("sourceStartBlock", input.sourceStartBlock);
  const maxCoverageAgeBlocks = uint64("maxCoverageAgeBlocks", input.maxCoverageAgeBlocks);
  const loanRatioBps = positiveInteger("loanRatioBps", String(input.loanRatioBps), { maximum: 10_000n });
  const minPrincipal = positiveInteger("minPrincipal", String(input.minPrincipal));
  const maxPrincipal = positiveInteger("maxPrincipal", String(input.maxPrincipal));
  if (maxPrincipal < minPrincipal) throw new Error("maxPrincipal must be at least minPrincipal.");

  const sourceContract = address("sourceContract", input.sourceContract);
  const sourceOwner = address("sourceOwner", input.sourceOwner);
  const destinationApplication = address("destinationApplication", input.destinationApplication);
  if (!isHexString(input.sourceCodeHash, 32) || input.sourceCodeHash === ZeroHash) {
    throw new Error("sourceCodeHash must be a non-zero bytes32 value.");
  }

  const predecessor = input.predecessor ?? ZeroHash;
  if (!isHexString(predecessor, 32)) throw new Error("predecessor must be bytes32.");
  const rulesHash = keccak256(toUtf8Bytes(canonicalJson(loanRules)));
  const registryInput = {
    compilerVersion: COMPILER_VERSION,
    policyVersion,
    predecessor,
    sourceChainKey,
    sourceEvmChainId,
    sourceContract,
    sourceCodeHash: input.sourceCodeHash,
    sourceOwner,
    sourceStartBlock,
    destinationApplication,
    maxCoverageAgeBlocks,
    loanRatioBps,
    minPrincipal,
    maxPrincipal,
    rulesHash
  };

  const policyId = keccak256(AbiCoder.defaultAbiCoder().encode(
    [
      "bytes32",
      "uint64",
      "bytes32",
      "uint64",
      "uint256",
      "address",
      "bytes32",
      "address",
      "uint64",
      "address",
      "uint64",
      "uint16",
      "uint256",
      "uint256",
      "bytes32"
    ],
    Object.values(registryInput)
  ));

  const manifest = {
    schema: "proofguard.loan-policy/v1",
    compiler: { name: COMPILER_NAME, version: COMPILER_VERSION },
    policyId,
    policyVersion: policyVersion.toString(),
    predecessor,
    source: {
      chainKey: sourceChainKey.toString(),
      evmChainId: sourceEvmChainId.toString(),
      contract: sourceContract,
      codeHash: input.sourceCodeHash,
      owner: sourceOwner,
      startBlock: sourceStartBlock.toString()
    },
    destination: {
      application: destinationApplication,
      action: loanRules.protectedAction
    },
    constraints: {
      maxCoverageAgeBlocks: maxCoverageAgeBlocks.toString(),
      loanRatioBps: loanRatioBps.toString(),
      minPrincipal: minPrincipal.toString(),
      maxPrincipal: maxPrincipal.toString()
    },
    rulesHash,
    rules: loanRules
  };

  return { policyId, manifest, registryInput };
}
