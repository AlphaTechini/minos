import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Contract, ContractFactory, JsonRpcProvider, Wallet, keccak256 } from "ethers";
import { compileLoanPolicy } from "../policy/compiler.mjs";

const forge = process.env.FORGE_BIN ?? join(homedir(), ".foundry", "bin", "forge.exe");
const root = resolve(import.meta.dirname, "..");
const deploymentsDirectory = join(root, "deployments");
const deploymentFile = join(deploymentsDirectory, "cc3-testnet.json");
const staticDirectory = join(root, "static");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in .env.`);
  return value;
}

function address(name) {
  const value = required(name);
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${name} must be an EVM address.`);
  return value;
}

async function loadArtifact(relativePath) {
  const artifact = JSON.parse(await readFile(join(root, relativePath), "utf8"));
  const bytecode = typeof artifact.bytecode === "string" ? artifact.bytecode : artifact.bytecode.object;
  if (!bytecode || bytecode === "0x") throw new Error(`Artifact has no deployable bytecode: ${relativePath}`);
  return { abi: artifact.abi, bytecode, linkReferences: artifact.bytecode.linkReferences ?? artifact.linkReferences ?? {} };
}

function linkLibraries(bytecode, linkReferences, libraries) {
  let linkedBytecode = bytecode;
  for (const [sourcePath, sourceLibraries] of Object.entries(linkReferences)) {
    for (const [libraryName, references] of Object.entries(sourceLibraries)) {
      const libraryAddress = libraries[`${sourcePath}:${libraryName}`] ?? libraries[libraryName];
      if (!libraryAddress) throw new Error(`Missing address for linked library ${libraryName}.`);
      const replacement = libraryAddress.slice(2).toLowerCase();
      for (const reference of references) {
        const start = 2 + reference.start * 2;
        const end = start + reference.length * 2;
        linkedBytecode = `${linkedBytecode.slice(0, start)}${replacement}${linkedBytecode.slice(end)}`;
      }
    }
  }
  return linkedBytecode;
}

async function deploy(label, rpcUrl, privateKey, artifactPath, constructorArgs = [], libraries = {}) {
  console.log(`Deploying ${label}.`);
  const provider = new JsonRpcProvider(rpcUrl);
  const signer = new Wallet(privateKey, provider);
  const artifact = await loadArtifact(artifactPath);
  const bytecode = linkLibraries(artifact.bytecode, artifact.linkReferences, libraries);
  const factory = new ContractFactory(artifact.abi, bytecode, signer);
  const contract = await factory.deploy(...constructorArgs);
  const receipt = await contract.deploymentTransaction().wait();
  return {
    address: await contract.getAddress(),
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber
  };
}

async function configuredContract(rpcUrl, privateKey, artifactPath, contractAddress) {
  const provider = new JsonRpcProvider(rpcUrl);
  const signer = new Wallet(privateKey, provider);
  const artifact = await loadArtifact(artifactPath);
  return new Contract(contractAddress, artifact.abi, signer);
}

async function send(label, transactionPromise) {
  console.log(label);
  const transaction = await transactionPromise;
  return transaction.wait();
}

const envFile = join(root, ".env");

// Persists only public deployment values back into .env so no address has to be
// copied by hand. Private keys are never read, matched, or printed here.
async function updatePublicEnvValues(values) {
  let content = "";
  try {
    content = await readFile(envFile, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const pending = new Map(Object.entries(values));
  const lines = content.split(/\r?\n/);
  const updated = lines.map((line) => {
    const assignment = line.match(/^([A-Z0-9_]+)=/);
    if (assignment && pending.has(assignment[1])) {
      const key = assignment[1];
      const replacement = `${key}=${pending.get(key)}`;
      pending.delete(key);
      return replacement;
    }
    return line;
  });
  if (updated.length > 0 && updated.at(-1) !== "") updated.push("");
  for (const [key, value] of pending) updated.push(`${key}=${value}`);
  const temporary = `${envFile}.tmp`;
  await writeFile(temporary, updated.join("\n"), "utf8");
  await rename(temporary, envFile);
  console.log(`Updated public values in .env: ${Object.keys(values).join(", ")}`);
}

function configuration() {
  return {
    sourceRpcUrl: required("SOURCE_CHAIN_RPC_URL"),
    publicSourceRpcUrl: process.env.PUBLIC_SOURCE_CHAIN_RPC_URL ?? required("SOURCE_CHAIN_RPC_URL"),
    sourceEvmChainId: process.env.SOURCE_EVM_CHAIN_ID ?? "11155111",
    sourceDeployerKey: required("SOURCE_DEPLOYER_PRIVATE_KEY"),
    sourceOwner: address("SOURCE_OWNER_ADDRESS"),
    creditcoinRpcUrl: required("CREDITCOIN_RPC_URL"),
    publicCreditcoinRpcUrl: process.env.PUBLIC_CREDITCOIN_RPC_URL ?? required("CREDITCOIN_RPC_URL"),
    creditcoinEvmChainId: process.env.CREDITCOIN_EVM_CHAIN_ID ?? "102031",
    creditcoinDeployerKey: required("CREDITCOIN_DEPLOYER_PRIVATE_KEY"),
    sourceChainKey: required("SOURCE_CHAIN_KEY"),
    workerAddress: address("WORKER_ADDRESS"),
    policyVersion: required("POLICY_VERSION"),
    policyPredecessor: process.env.POLICY_PREDECESSOR,
    maxCoverageAgeBlocks: required("POLICY_MAX_COVERAGE_AGE_BLOCKS"),
    loanRatioBps: required("POLICY_LOAN_RATIO_BPS"),
    minPrincipal: required("POLICY_MIN_PRINCIPAL_WEI"),
    maxPrincipal: required("POLICY_MAX_PRINCIPAL_WEI"),
    vaultFunding: process.env.VAULT_FUNDING_WEI ?? "0"
  };
}

async function main() {
  const config = configuration();
  execFileSync(forge, ["build"], { cwd: root, stdio: "inherit" });

  const source = await deploy(
    "SourceLoanPositions on Ethereum Sepolia",
    config.sourceRpcUrl,
    config.sourceDeployerKey,
    "contracts/out/SourceLoanPositions.sol/SourceLoanPositions.json",
    [config.sourceOwner]
  );
  const sourceProvider = new JsonRpcProvider(config.sourceRpcUrl);
  const sourceCodeHash = keccak256(await sourceProvider.getCode(source.address));

  const decoder = await deploy(
    "EvmV1Decoder on Creditcoin CC3 Testnet",
    config.creditcoinRpcUrl,
    config.creditcoinDeployerKey,
    "contracts/out/decoding/EvmV1Decoder.sol/EvmV1Decoder.json"
  );

  const registry = await deploy(
    "LoanPolicyRegistry on Creditcoin CC3 Testnet",
    config.creditcoinRpcUrl,
    config.creditcoinDeployerKey,
    "contracts/out/LoanPolicyRegistry.sol/LoanPolicyRegistry.json",
    [config.sourceOwner, config.workerAddress]
  );

  const fullFile = await deploy(
    "FullFile on Creditcoin CC3 Testnet",
    config.creditcoinRpcUrl,
    config.creditcoinDeployerKey,
    "contracts/out/FullFile.sol/FullFile.json",
    [config.sourceOwner, config.workerAddress]
  );

  const vault = await deploy(
    "LoanVault on Creditcoin CC3 Testnet",
    config.creditcoinRpcUrl,
    config.creditcoinDeployerKey,
    "contracts/out/LoanVault.sol/LoanVault.json",
    [config.sourceOwner]
  );

  const guard = await deploy(
    "ProofGuard on Creditcoin CC3 Testnet",
    config.creditcoinRpcUrl,
    config.creditcoinDeployerKey,
    "contracts/out/ProofGuard.sol/ProofGuard.json",
    [registry.address, fullFile.address, vault.address],
    { EvmV1Decoder: decoder.address }
  );

  const fullFileContract = await configuredContract(
    config.creditcoinRpcUrl,
    config.creditcoinDeployerKey,
    "contracts/out/FullFile.sol/FullFile.json",
    fullFile.address
  );
  const vaultContract = await configuredContract(
    config.creditcoinRpcUrl,
    config.creditcoinDeployerKey,
    "contracts/out/LoanVault.sol/LoanVault.json",
    vault.address
  );
  const registryContract = await configuredContract(
    config.creditcoinRpcUrl,
    config.creditcoinDeployerKey,
    "contracts/out/LoanPolicyRegistry.sol/LoanPolicyRegistry.json",
    registry.address
  );

  const fullFileConfiguration = await send(
    "Binding FullFile to ProofGuard.", fullFileContract.configureProofGuard(guard.address)
  );
  const vaultConfiguration = await send(
    "Binding LoanVault to ProofGuard.", vaultContract.configureProofGuard(guard.address)
  );

  const { policyId, manifest, registryInput } = compileLoanPolicy({
    policyVersion: config.policyVersion,
    predecessor: config.policyPredecessor,
    sourceChainKey: config.sourceChainKey,
    sourceEvmChainId: config.sourceEvmChainId,
    sourceContract: source.address,
    sourceCodeHash,
    sourceOwner: config.sourceOwner,
    sourceStartBlock: source.blockNumber,
    destinationApplication: vault.address,
    maxCoverageAgeBlocks: config.maxCoverageAgeBlocks,
    loanRatioBps: config.loanRatioBps,
    minPrincipal: config.minPrincipal,
    maxPrincipal: config.maxPrincipal
  });
  const policyRegistration = await send(
    `Registering policy ${policyId}.`, registryContract.registerPolicy(registryInput)
  );

  let vaultFunding;
  if (!/^\d+$/.test(config.vaultFunding)) throw new Error("VAULT_FUNDING_WEI must be an integer.");
  if (BigInt(config.vaultFunding) > 0n) {
    const funder = new Wallet(
      config.creditcoinDeployerKey, new JsonRpcProvider(config.creditcoinRpcUrl)
    );
    vaultFunding = await send(
      "Funding LoanVault with tCTC.",
      funder.sendTransaction({ to: vault.address, value: BigInt(config.vaultFunding) })
    );
  }

  const deployment = {
    network: "cc3-testnet",
    sourceNetwork: "ethereum-sepolia",
    sourceEvmChainId: config.sourceEvmChainId,
    creditcoinEvmChainId: config.creditcoinEvmChainId,
    publicSourceRpcUrl: config.publicSourceRpcUrl,
    publicCreditcoinRpcUrl: config.publicCreditcoinRpcUrl,
    sourcePositionContract: source.address,
    decoderLibrary: decoder.address,
    loanPolicyRegistry: registry.address,
    fullFile: fullFile.address,
    loanVault: vault.address,
    proofGuard: guard.address,
    policyId,
    sourceCodeHash,
    workerAddress: config.workerAddress,
    sourceChainKey: config.sourceChainKey,
    sourceDeploymentBlock: source.blockNumber,
    transactions: {
      source: source.transactionHash,
      decoder: decoder.transactionHash,
      registry: registry.transactionHash,
      fullFile: fullFile.transactionHash,
      vault: vault.transactionHash,
      guard: guard.transactionHash,
      fullFileConfiguration: fullFileConfiguration.hash,
      vaultConfiguration: vaultConfiguration.hash,
      policyRegistration: policyRegistration.hash,
      vaultFunding: vaultFunding?.hash ?? null
    },
    generatedAt: new Date().toISOString()
  };

  await mkdir(deploymentsDirectory, { recursive: true });
  await mkdir(staticDirectory, { recursive: true });
  await writeFile(deploymentFile, `${JSON.stringify(deployment, null, 2)}\n`);
  await writeFile(
    join(deploymentsDirectory, "loan-policy.json"), `${JSON.stringify(manifest, null, 2)}\n`
  );
  await writeFile(
    join(staticDirectory, "deployment.json"),
    `${JSON.stringify({
      network: deployment.network,
      sourceNetwork: deployment.sourceNetwork,
      sourceEvmChainId: deployment.sourceEvmChainId,
      creditcoinEvmChainId: deployment.creditcoinEvmChainId,
      publicSourceRpcUrl: deployment.publicSourceRpcUrl,
      publicCreditcoinRpcUrl: deployment.publicCreditcoinRpcUrl,
      sourcePositionContract: deployment.sourcePositionContract,
      loanPolicyRegistry: deployment.loanPolicyRegistry,
      fullFile: deployment.fullFile,
      loanVault: deployment.loanVault,
      proofGuard: deployment.proofGuard,
      policyId: deployment.policyId
    }, null, 2)}\n`
  );
  console.log(`Deployment metadata written to ${deploymentFile}.`);
  await updatePublicEnvValues({
    SOURCE_EVM_CHAIN_ID: config.sourceEvmChainId,
    PUBLIC_SOURCE_CHAIN_RPC_URL: config.publicSourceRpcUrl,
    PUBLIC_CREDITCOIN_RPC_URL: config.publicCreditcoinRpcUrl,
    CREDITCOIN_EVM_CHAIN_ID: config.creditcoinEvmChainId,
    SOURCE_POSITION_CONTRACT_ADDRESS: source.address,
    DECODER_LIBRARY_ADDRESS: decoder.address,
    LOAN_POLICY_REGISTRY_ADDRESS: registry.address,
    FULLFILE_CONTRACT_ADDRESS: fullFile.address,
    LOAN_VAULT_CONTRACT_ADDRESS: vault.address,
    PROOF_GUARD_CONTRACT_ADDRESS: guard.address,
    POLICY_ID: policyId,
    SOURCE_CODE_HASH: sourceCodeHash,
    WORKER_START_BLOCK: source.blockNumber
  });
  console.log("Update .env with:");
  console.log(`SOURCE_POSITION_CONTRACT_ADDRESS=${source.address}`);
  console.log(`DECODER_LIBRARY_ADDRESS=${decoder.address}`);
  console.log(`LOAN_POLICY_REGISTRY_ADDRESS=${registry.address}`);
  console.log(`FULLFILE_CONTRACT_ADDRESS=${fullFile.address}`);
  console.log(`LOAN_VAULT_CONTRACT_ADDRESS=${vault.address}`);
  console.log(`PROOF_GUARD_CONTRACT_ADDRESS=${guard.address}`);
  console.log(`POLICY_ID=${policyId}`);
  console.log(`SOURCE_CODE_HASH=${sourceCodeHash}`);
  console.log(`WORKER_START_BLOCK=${source.blockNumber}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
