import {
  BrowserProvider,
  Contract,
  getAddress,
  id,
  isHexString,
  JsonRpcProvider,
  keccak256,
  toBeHex,
  ZeroHash
} from "ethers";

const sourceAbi = [
  "function owner() view returns (address)",
  "function openPosition(bytes32 positionId, uint256 principal, bytes32 termsHash)",
  "function recordRepayment(bytes32 positionId, bytes32 repaymentId, uint256 amount)",
  "function reverseRepayment(bytes32 positionId, bytes32 repaymentId, bytes32 reasonHash)"
];

const fullFileAbi = [
  "function getPosition(bytes32 positionId) view returns (tuple(bytes32 policyId, address borrower, uint256 principal, uint256 repaidAmount, bytes32 termsHash, bytes32 qualifyingRepaymentId, bytes32 qualifyingRepaymentEventId, uint8 state, tuple(uint64 blockNumber, uint64 transactionIndex, uint32 logIndex) lastSource, uint64 stateVersion, uint64 enrollmentBlock))",
  "function getCoverage(bytes32 positionId) view returns (tuple(uint64 throughSourceBlock, uint64 updatedAtCreditcoinBlock, uint8 status))",
  "function getStateVersion(bytes32 positionId, uint64 version) view returns (tuple(bool exists, uint64 version, uint64 predecessor, bytes32 eventId, bytes32 policyId, uint8 state, tuple(uint64 blockNumber, uint64 transactionIndex, uint32 logIndex) source, uint64 coverageThrough, uint8 coverageStatus, bytes32 stateCommitment, uint64 createdAt))"
];

const registryAbi = [
  "function getPolicy(bytes32 policyId) view returns (tuple(bytes32 policyId, bytes32 compilerVersion, uint64 policyVersion, bytes32 predecessor, uint64 sourceChainKey, uint256 sourceEvmChainId, address sourceContract, bytes32 sourceCodeHash, address sourceOwner, uint64 sourceStartBlock, address destinationApplication, uint64 maxCoverageAgeBlocks, uint16 loanRatioBps, uint256 minPrincipal, uint256 maxPrincipal, bytes32 rulesHash, bool active, bool sourcePaused))"
];

const guardAbi = [
  "function evaluateLoan(bytes32 policyId, bytes32 positionId, bytes32 candidateEventId) view returns (bool eligible, uint8 reason)",
  "function authorizeLoan(bytes32 policyId, bytes32 positionId, bytes32 candidateEventId) returns (bytes32 decisionId, uint256 amount)",
  "function processedEvents(bytes32 eventId) view returns (bool)"
];

const vaultAbi = [
  "function releasedLoans(bytes32 positionId) view returns (uint256)"
];

export const positionStates = ["None", "Open", "Repaid", "Reversed", "Disputed", "Closed", "Unsupported"];
export const coverageStates = ["Incomplete", "Current", "Stale"];
export const eligibilityReasons = [
  "Eligible",
  "Unknown position",
  "Policy mismatch or paused",
  "Position is not repaid",
  "Candidate event does not match",
  "Coverage is not current",
  "Coverage is behind state",
  "Coverage heartbeat expired"
];

export function bytes32(value, label) {
  if (!isHexString(value, 32)) throw new Error(`${label} must be a 32-byte hex value.`);
  return value;
}

export function scenarioIds() {
  const nonce = crypto.randomUUID();
  return {
    positionId: id(`proofguard:position:${nonce}`),
    repaymentId: id(`proofguard:repayment:${nonce}`),
    termsHash: id(`proofguard:terms:${nonce}`),
    reasonHash: id(`proofguard:reversal:${nonce}`)
  };
}

export async function loadDeployment() {
  const response = await fetch("/deployment.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Missing static/deployment.json. Run the deployment script first.");
  return response.json();
}

export async function loadAdversarialResults() {
  const response = await fetch("/adversarial-results.json", { cache: "no-store" });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error("Could not load adversarial results.");
  return response.json();
}

function provider(url) {
  return new JsonRpcProvider(url);
}

export async function readDashboard(deployment, positionId) {
  bytes32(positionId, "Position ID");
  const creditcoin = provider(deployment.publicCreditcoinRpcUrl);
  const source = provider(deployment.publicSourceRpcUrl);
  const fullFile = new Contract(deployment.fullFile, fullFileAbi, creditcoin);
  const registry = new Contract(deployment.loanPolicyRegistry, registryAbi, creditcoin);
  const vault = new Contract(deployment.loanVault, vaultAbi, creditcoin);
  const guard = new Contract(deployment.proofGuard, guardAbi, creditcoin);
  const sourceContract = new Contract(deployment.sourcePositionContract, sourceAbi, source);

  const [position, coverage, policy, releasedLoan, sourceCode, sourceOwner, creditcoinBlock] = await Promise.all([
    fullFile.getPosition(positionId),
    fullFile.getCoverage(positionId),
    registry.getPolicy(deployment.policyId),
    vault.releasedLoans(positionId),
    source.getCode(deployment.sourcePositionContract),
    sourceContract.owner(),
    creditcoin.getBlockNumber()
  ]);

  const versions = [];
  for (let version = 1n; version <= position.stateVersion; version += 1n) {
    versions.push(await fullFile.getStateVersion(positionId, version));
  }

  const candidateEventId = position.qualifyingRepaymentEventId;
  const [eligible, reason] = candidateEventId === ZeroHash
    ? [false, 3n]
    : await guard.evaluateLoan(deployment.policyId, positionId, candidateEventId);
  const processed = candidateEventId === ZeroHash ? false : await guard.processedEvents(candidateEventId);

  return {
    position,
    coverage,
    policy,
    releasedLoan,
    versions,
    eligible,
    reason,
    candidateEventId,
    processed,
    sourceIdentity: {
      codeMatches: keccak256(sourceCode) === policy.sourceCodeHash,
      ownerMatches: getAddress(sourceOwner) === getAddress(policy.sourceOwner),
      observedCodeHash: keccak256(sourceCode),
      observedOwner: sourceOwner
    },
    coverageAge: BigInt(creditcoinBlock) - coverage.updatedAtCreditcoinBlock
  };
}

async function walletFor(deployment, target) {
  if (!window.ethereum) throw new Error("An EVM wallet extension is required.");
  const network = target === "source"
    ? {
        chainId: deployment.sourceEvmChainId,
        chainName: "Ethereum Sepolia",
        rpcUrls: [deployment.publicSourceRpcUrl],
        nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 }
      }
    : {
        chainId: deployment.creditcoinEvmChainId,
        chainName: "Creditcoin CC3 Testnet",
        rpcUrls: [deployment.publicCreditcoinRpcUrl],
        nativeCurrency: { name: "Test CTC", symbol: "tCTC", decimals: 18 }
      };
  const chainId = toBeHex(BigInt(network.chainId));
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{ ...network, chainId }]
    });
  }
  const browserProvider = new BrowserProvider(window.ethereum);
  await browserProvider.send("eth_requestAccounts", []);
  return browserProvider.getSigner();
}

export async function connectWallet(deployment, target = "source") {
  return getAddress(await (await walletFor(deployment, target)).getAddress());
}

export async function openPosition(deployment, positionId, principal, termsHash) {
  const signer = await walletFor(deployment, "source");
  const contract = new Contract(deployment.sourcePositionContract, sourceAbi, signer);
  return (await contract.openPosition(
    bytes32(positionId, "Position ID"), BigInt(principal), bytes32(termsHash, "Terms hash")
  )).wait();
}

export async function recordRepayment(deployment, positionId, repaymentId, amount) {
  const signer = await walletFor(deployment, "source");
  const contract = new Contract(deployment.sourcePositionContract, sourceAbi, signer);
  return (await contract.recordRepayment(
    bytes32(positionId, "Position ID"), bytes32(repaymentId, "Repayment ID"), BigInt(amount)
  )).wait();
}

export async function reverseRepayment(deployment, positionId, repaymentId, reasonHash) {
  const signer = await walletFor(deployment, "source");
  const contract = new Contract(deployment.sourcePositionContract, sourceAbi, signer);
  return (await contract.reverseRepayment(
    bytes32(positionId, "Position ID"),
    bytes32(repaymentId, "Repayment ID"),
    bytes32(reasonHash, "Reason hash")
  )).wait();
}

export async function authorizeLoan(deployment, positionId, candidateEventId) {
  const signer = await walletFor(deployment, "creditcoin");
  const guard = new Contract(deployment.proofGuard, guardAbi, signer);
  return (await guard.authorizeLoan(
    deployment.policyId,
    bytes32(positionId, "Position ID"),
    bytes32(candidateEventId, "Candidate event ID")
  )).wait();
}
