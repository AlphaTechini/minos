import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";

const forge = process.env.FORGE_BIN ?? join(homedir(), ".foundry", "bin", "forge.exe");
const root = resolve(import.meta.dirname, "..");
const deploymentsDirectory = join(root, "deployments");
const deploymentFile = join(deploymentsDirectory, "cc3-testnet.json");

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

function configuration() {
  return {
    sourceRpcUrl: required("SOURCE_CHAIN_RPC_URL"),
    sourceDeployerKey: required("SOURCE_DEPLOYER_PRIVATE_KEY"),
    sourceOwner: address("SOURCE_OWNER_ADDRESS"),
    creditcoinRpcUrl: required("CREDITCOIN_RPC_URL"),
    creditcoinDeployerKey: required("CREDITCOIN_DEPLOYER_PRIVATE_KEY"),
    sourceChainKey: required("SOURCE_CHAIN_KEY"),
    workerAddress: address("WORKER_ADDRESS")
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

  const decoder = await deploy(
    "EvmV1Decoder on Creditcoin CC3 Testnet",
    config.creditcoinRpcUrl,
    config.creditcoinDeployerKey,
    "contracts/out/decoding/EvmV1Decoder.sol/EvmV1Decoder.json"
  );

  const guard = await deploy(
    "ProofGuardFullFile on Creditcoin CC3 Testnet",
    config.creditcoinRpcUrl,
    config.creditcoinDeployerKey,
    "contracts/out/ProofGuardFullFile.sol/ProofGuardFullFile.json",
    [config.sourceChainKey, source.address, config.workerAddress],
    { EvmV1Decoder: decoder.address }
  );

  const deployment = {
    network: "cc3-testnet",
    sourceNetwork: "ethereum-sepolia",
    sourcePositionContract: source.address,
    decoderLibrary: decoder.address,
    proofGuardFullFile: guard.address,
    workerAddress: config.workerAddress,
    sourceChainKey: config.sourceChainKey,
    sourceDeploymentBlock: source.blockNumber,
    transactions: {
      source: source.transactionHash,
      decoder: decoder.transactionHash,
      guard: guard.transactionHash
    },
    generatedAt: new Date().toISOString()
  };

  await mkdir(deploymentsDirectory, { recursive: true });
  await writeFile(deploymentFile, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`Deployment metadata written to ${deploymentFile}.`);
  console.log("Update .env with:");
  console.log(`SOURCE_POSITION_CONTRACT_ADDRESS=${source.address}`);
  console.log(`DECODER_LIBRARY_ADDRESS=${decoder.address}`);
  console.log(`PROOF_GUARD_CONTRACT_ADDRESS=${guard.address}`);
  console.log(`WORKER_START_BLOCK=${source.blockNumber}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
