import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileLoanPolicy } from "../policy/compiler.mjs";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const deploymentPath = resolve(process.env.DEPLOYMENT_FILE ?? "deployments/cc3-testnet.json");
  const deployment = JSON.parse(await readFile(deploymentPath, "utf8"));
  const sourceCodeHash = required("SOURCE_CODE_HASH");

  const { manifest } = compileLoanPolicy({
    policyVersion: required("POLICY_VERSION"),
    predecessor: process.env.POLICY_PREDECESSOR,
    sourceChainKey: required("SOURCE_CHAIN_KEY"),
    sourceEvmChainId: required("SOURCE_EVM_CHAIN_ID"),
    sourceContract: deployment.sourcePositionContract,
    sourceCodeHash,
    sourceOwner: required("SOURCE_OWNER_ADDRESS"),
    sourceStartBlock: deployment.sourceDeploymentBlock,
    destinationApplication: deployment.loanVault,
    maxCoverageAgeBlocks: required("POLICY_MAX_COVERAGE_AGE_BLOCKS"),
    loanRatioBps: required("POLICY_LOAN_RATIO_BPS"),
    minPrincipal: required("POLICY_MIN_PRINCIPAL_WEI"),
    maxPrincipal: required("POLICY_MAX_PRINCIPAL_WEI")
  });

  const outputPath = resolve(process.env.POLICY_OUTPUT_FILE ?? "deployments/loan-policy.json");
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Policy ${manifest.policyId} written to ${outputPath}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
