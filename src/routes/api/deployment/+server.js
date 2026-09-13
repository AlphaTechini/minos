import { env } from "$env/dynamic/private";
import { json } from "@sveltejs/kit";

export const prerender = false;

function value(name, fallback) {
  return env[name] ?? fallback;
}

export function GET() {
  const deployment = {
    sourceEvmChainId: value("SOURCE_EVM_CHAIN_ID"),
    creditcoinEvmChainId: value("CREDITCOIN_EVM_CHAIN_ID"),
    publicSourceRpcUrl: value("PUBLIC_SOURCE_CHAIN_RPC_URL", value("SOURCE_CHAIN_RPC_URL")),
    publicCreditcoinRpcUrl: value("PUBLIC_CREDITCOIN_RPC_URL", value("CREDITCOIN_RPC_URL")),
    sourcePositionContract: value("SOURCE_POSITION_CONTRACT_ADDRESS"),
    loanPolicyRegistry: value("LOAN_POLICY_REGISTRY_ADDRESS"),
    fullFile: value("FULLFILE_CONTRACT_ADDRESS"),
    loanVault: value("LOAN_VAULT_CONTRACT_ADDRESS"),
    proofGuard: value("PROOF_GUARD_CONTRACT_ADDRESS"),
    policyId: value("POLICY_ID")
  };
  const missing = Object.entries(deployment)
    .filter(([, configured]) => !configured)
    .map(([name]) => name);

  if (missing.length > 0) {
    return json(
      {
        error: `Minos is not configured. Set these Vercel environment variables: ${missing.join(", ")}.`
      },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }

  return json(deployment, { headers: { "cache-control": "no-store" } });
}
