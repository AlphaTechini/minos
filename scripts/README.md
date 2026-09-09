# Project Runners

This directory contains local operators for compilation, deployment, source actions, destination actions, and adversarial scenarios. Private keys are loaded into ethers from `.env` process memory and are never passed to child-process command lines.

To find the portable Foundry build wrapper, visit [build.mjs](file:///C:/Hackathons/Proof%20Firewall/scripts/build.mjs).

To find the six-contract deployment sequence, decoder linking, policy compilation, one-time guard bindings, registry activation, vault funding, and public browser configuration, visit [deploy.mjs](file:///C:/Hackathons/Proof%20Firewall/scripts/deploy.mjs).

To find standalone deterministic policy generation, visit [compile-policy.mjs](file:///C:/Hackathons/Proof%20Firewall/scripts/compile-policy.mjs).

To find wallet-authorized Sepolia position, repayment, and reversal actions, visit [source-flow.mjs](file:///C:/Hackathons/Proof%20Firewall/scripts/source-flow.mjs).

To find FullFile inspection, eligibility checks, vault funding, and guarded loan release, visit [app-flow.mjs](file:///C:/Hackathons/Proof%20Firewall/scripts/app-flow.mjs).

To find live fake-source, replay, wrong-chain, and stale-coverage probes, visit [adversarial-flow.mjs](file:///C:/Hackathons/Proof%20Firewall/scripts/adversarial-flow.mjs).

## Deployment

```powershell
pnpm deploy:testnet
```

The deployment writes private-free metadata to `deployments/`, a policy manifest to `deployments/loan-policy.json`, and browser-safe runtime configuration to `static/deployment.json`.

## Source Actions

```powershell
pnpm source-flow -- open --position-id 0xPOSITION_ID --principal 1000000000000000000 --terms-hash 0xTERMS_HASH
pnpm source-flow -- repay --position-id 0xPOSITION_ID --repayment-id 0xREPAYMENT_ID --amount 1000000000000000000
pnpm source-flow -- reverse --position-id 0xPOSITION_ID --repayment-id 0xREPAYMENT_ID --reason-hash 0xREASON_HASH
```

## Destination Actions

```powershell
pnpm app-flow -- status --position-id 0xPOSITION_ID
pnpm app-flow -- evaluate --position-id 0xPOSITION_ID
pnpm app-flow -- authorize --position-id 0xPOSITION_ID
pnpm app-flow -- fund --amount 1000000000000000000
```

## Adversarial Checks

```powershell
pnpm adversarial-flow -- fake-source
pnpm adversarial-flow -- replay 0xPOSITION_ID
pnpm adversarial-flow -- wrong-chain 0xPOSITION_ID
pnpm adversarial-flow -- stale-coverage 0xPOSITION_ID
```

The stale-coverage scenario intentionally changes the position's live coverage status. Run it only after the successful loan demonstration.
