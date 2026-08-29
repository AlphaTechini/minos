# ProofGuard and FullFile

ProofGuard accepts an Attestcoin-proven Sepolia event only when it matches the configured source and expected event schema. FullFile records the ordered state of that position, so a later valid reversal prevents a formerly valid repayment from authorizing a new Creditcoin credit line.

This repository is a live-testnet implementation for Ethereum Sepolia and Creditcoin CC3 Testnet. It is not production-ready financial infrastructure.

To find the project layout, visit [structure.md](file:///C:/Hackathons/Proof%20Firewall/structure.md).

## Architecture

- The Sepolia source contract emits `PositionOpened`, `RepaymentRecorded`, and `RepaymentReversed` events.
- The worker discovers these events, waits for Attestcoin attestation, gets a proof, and submits the event to the Creditcoin guard.
- The guard verifies the proof through Creditcoin's Block Prover, checks the source event, enforces replay protection, and advances FullFile's immutable state.
- The worker advances a position's coverage checkpoint only after scanning its declared source range. If a worker cycle fails, it marks known positions stale.
- A Creditcoin borrower can authorize a testnet credit limit only when the position is `Repaid` and coverage is `Current`.

The worker is the operational coverage boundary. Attestcoin proves every event it imports, but does not prove the absence of an event that the worker failed to discover.

## Setup

Install dependencies with:

```powershell
pnpm install
```

Build the contracts with:

```powershell
pnpm build:contracts
```

Copy `.env.example` to `.env` and set the required endpoints, addresses, source deployment block, and worker key. Do not commit `.env`.

## Deployment Order

The Solidity decoder is an external library, so deployment proceeds in this order:

1. Deploy `SourceLoanPositions` to Ethereum Sepolia.
2. Deploy `EvmV1Decoder` to Creditcoin CC3 Testnet from `node_modules/@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol`.
3. Deploy `ProofGuardFullFile` to CC3 Testnet, linking the deployed decoder library and supplying the Sepolia chain key, source-contract address, and worker address.
4. The deployment runner obtains and prints the Sepolia source-contract deployment block for `WORKER_START_BLOCK`.
5. Start the worker.

The official Creditcoin loan-flow tutorial documents the same decoder deployment and library-linking requirement: https://docs.creditcoin.org/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-smart-contracts.md

The deployment runner uses `.env` at runtime so secrets never enter source files:

```powershell
pnpm deploy:testnet
```

The script writes public addresses and transaction hashes to `deployments/cc3-testnet.json`, then prints the three contract addresses and the source deployment block value needed in `.env`. See [scripts/README.md](file:///C:/Hackathons/Proof%20Firewall/scripts/README.md).

The `.env.example` uses a public Sepolia RPC suitable for a lightweight demo. Shared public RPCs can rate-limit automated scanning; replace it with an authenticated Sepolia endpoint if the worker needs sustained throughput.

To create the source events used by the live flow, see [scripts/README.md](file:///C:/Hackathons/Proof%20Firewall/scripts/README.md) and run the `source-flow` commands with test-only bytes32 values.

## Worker

Run a single worker cycle with:

```powershell
pnpm worker:once
```

Run continuously with:

```powershell
pnpm worker
```

The worker writes its next source block and enrolled position IDs to `.proofguard-worker-state.json`. This prevents a successful batch from being reprocessed after restart. The Creditcoin guard also has on-chain query replay protection.

## Demo Flow

1. The borrower opens a position on Sepolia.
2. The worker imports the Attestcoin-proven event and establishes FullFile state `Open`.
3. The borrower records a full repayment on Sepolia.
4. The worker imports it, marks the position `Repaid`, and advances coverage.
5. The borrower calls `authorizeCredit` on Creditcoin to create a testnet credit-limit record.
6. The source owner emits a later repayment reversal on Sepolia.
7. The worker imports it, creating a new FullFile state `Reversed`.
8. A future `authorizeCredit` attempt is rejected even though the original repayment remains historically valid.
9. A matching event from any non-configured source contract is rejected by ProofGuard.

## Decisions

To find confirmed product and security constraints, visit [.agents/GUIDE.md](file:///C:/Hackathons/Proof%20Firewall/.agents/GUIDE.md).

To find the ProofGuard and FullFile product definition, visit [details.md](file:///C:/Hackathons/Proof%20Firewall/details.md).

To find Attestcoin capability research and source links, visit [research.txt](file:///C:/Hackathons/Proof%20Firewall/research.txt).
