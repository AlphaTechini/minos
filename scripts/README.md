# Deployment Scripts

To find the testnet deployment sequence, environment validation, library linking, and public deployment metadata output, visit [deploy.mjs](file:///C:/Hackathons/Proof%20Firewall/scripts/deploy.mjs).

To find the portable Foundry build wrapper, visit [build.mjs](file:///C:/Hackathons/Proof%20Firewall/scripts/build.mjs).

To find the public transaction runner for the deployed Sepolia source contract, visit [source-flow.mjs](file:///C:/Hackathons/Proof%20Firewall/scripts/source-flow.mjs).

Run the deployment only after the private deployment keys, public addresses, and RPC endpoints are configured in `.env`:

```powershell
node --env-file=.env scripts/deploy.mjs
```

The script deploys the Sepolia source contract first, then the Creditcoin decoder library, then the linked ProofGuard contract. It writes only addresses, transaction hashes, and network metadata to `deployments/cc3-testnet.json`.

Private keys are supplied to ethers in process memory rather than passed to a child-process command line, preventing them from appearing in process arguments or Foundry command error output.

The source runner emits only public transaction metadata. Examples:

```powershell
pnpm source-flow -- open --position-id 0xPOSITION_ID --principal 1000000000000000000 --terms-hash 0xTERMS_HASH
pnpm source-flow -- repay --position-id 0xPOSITION_ID --repayment-id 0xREPAYMENT_ID --amount 1000000000000000000
pnpm source-flow -- reverse --position-id 0xPOSITION_ID --repayment-id 0xREPAYMENT_ID --reason-hash 0xREASON_HASH
```
