# Project Constraints

## Confirmed Product Scope

- ProofGuard is a policy-enforcement layer for Attestcoin-verified source events.
- FullFile is the ordered, supported state layer that prevents a genuine but outdated event from authorizing a protected action.
- The first implementation targets Ethereum Sepolia as the source chain and Creditcoin CC3 Testnet as the destination.
- The first integration uses one project-owned source contract and one enrolled position type.
- The demo must execute a real Attestcoin proof flow on live testnets.

## Security Boundaries

- The Creditcoin guard verifies every imported source event through Attestcoin before FullFile applies it.
- FullFile coverage is supplied by a dedicated worker that monitors the declared Sepolia source contract and marks positions stale or incomplete when coverage stops.
- The worker provides discovery and availability, not final event authorization.
- The product must not claim current Ethereum account or storage proofs, automatic proxy-upgrade verification, legal ownership, or universal event coverage.
- The guarded Creditcoin action must not have a bypass path outside the ProofGuard and FullFile checks.

## Demo Requirements

- Demonstrate a valid source event, a fake-source rejection, a replay rejection, and a later valid event that invalidates the earlier state.
- Persist immutable FullFile state versions and decision receipts.
- Keep the source event set fixed and explicit. Do not build a general policy language, registry marketplace, or multi-chain system.

## Tooling

- Use pnpm for Node.js dependencies.
- Use Foundry for Solidity compilation because it matches the official Attestcoin examples. Use ethers for deployment signing so private keys never enter a child-process argument list.
- Use the documented `@gluwa/usc-sdk` and `@gluwa/usc-contracts` interfaces only after version-specific dependency review.
