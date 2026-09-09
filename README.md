# ProofGuard and FullFile

ProofGuard accepts an Attestcoin-proven Sepolia event only when it matches an application-pinned policy. FullFile records the ordered state of that position, so a later valid reversal prevents an old repayment from authorizing a new action. A valid decision releases a funded tCTC loan from a Creditcoin vault that has no unguarded loan path.

This repository targets Ethereum Sepolia and Creditcoin CC3 Testnet for the hackathon demonstration. It is not production-ready financial infrastructure.

To find the project layout, visit [structure.md](file:///C:/Hackathons/Proof%20Firewall/structure.md).

## Architecture

- `SourceLoanPositions` emits one creation, one exact full repayment, and one repayment reversal for an enrolled loan.
- The deterministic compiler creates a machine-validatable policy identity from the source deployment, source authority, event rules, principal bounds, coverage age, loan ratio, and destination vault.
- `LoanPolicyRegistry` stores that exact policy and pauses it when the worker reports a source bytecode, ownership, or unsupported-event change.
- The worker scans every source-contract log through the latest Proof Builder checkpoint and submits recognized events with their receipt-local log indexes.
- `ProofGuard` verifies the Attestcoin proof, receipt status, canonical source, exact event schema, policy constraints, event replay scope, and action replay scope.
- `FullFile` persists normalized event records, immutable state versions, source ordering, coverage, freshness, and eligibility.
- `LoanVault` releases funded tCTC only when ProofGuard records an eligible decision.

The worker is the operational coverage boundary. Attestcoin proves each imported event, but it does not prove that a worker discovered an event it omitted. Unknown source-contract events therefore stop coverage and pause the policy.

## Setup

```powershell
pnpm install
pnpm build:contracts
pnpm build
```

Copy `.env.example` to `.env` and set the required policy values, addresses, source deployment block, and private testnet keys. Never commit `.env`.

## Deployment

The deployment runner performs the dependency order automatically:

1. Deploy the Sepolia source contract.
2. Deploy Creditcoin's `EvmV1Decoder` library.
3. Deploy the policy registry, FullFile, and funded loan vault.
4. Deploy the linked ProofGuard.
5. Bind FullFile and the vault to that guard once.
6. Compile and register the deterministic policy.
7. Optionally fund the vault.
8. Write private-free deployment, policy, and browser configuration.

```powershell
pnpm deploy:testnet
```

The official Creditcoin ASC documentation explains the decoder library and Block Prover pattern: https://docs.creditcoin.org/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-smart-contracts.md

## Worker

Run one attested-range cycle:

```powershell
pnpm worker:once
```

Run continuously:

```powershell
pnpm worker
```

The worker stores its deployment-bound cursor and public source transaction metadata in `.proofguard-worker-state.json`. On-chain event nullifiers remain the final replay authority.

## Dashboard

```powershell
pnpm dev
```

The browser console loads only `static/deployment.json`, public RPC endpoints, and public contract state. Source and Creditcoin user actions are signed by the connected browser wallet. Worker, deployer, and owner private keys never enter the frontend bundle.

## Demonstration

1. Open a position on Sepolia.
2. Run the worker and inspect FullFile state `Open`.
3. Record the exact full repayment on Sepolia.
4. Run the worker and inspect FullFile state `Repaid` with current coverage.
5. Release the funded tCTC loan through ProofGuard.
6. Reverse the exact repayment on Sepolia and run the worker again.
7. Confirm FullFile creates a successor `Reversed` version and evaluates the old repayment as historically accepted but currently ineligible.
8. Run fake-source, replay, wrong-chain, and stale-coverage probes.

To find exact commands, visit [scripts/README.md](file:///C:/Hackathons/Proof%20Firewall/scripts/README.md).

## Product Definition

To find confirmed implementation constraints, visit [.agents/GUIDE.md](file:///C:/Hackathons/Proof%20Firewall/.agents/GUIDE.md).

To find the complete ProofGuard and FullFile requirements, visit [details.md](file:///C:/Hackathons/Proof%20Firewall/details.md).
