# Contracts

This directory holds the on-chain part of the Sepolia to Creditcoin proof flow. The source contract is intentionally project-owned and non-upgradeable for the hackathon demo. The Creditcoin contract owns the protected credit authorization and has no unguarded action path.

To find Sepolia position events, visit [SourceLoanPositions.sol](file:///C:/Hackathons/Proof%20Firewall/contracts/src/SourceLoanPositions.sol).

To find ProofGuard validation, FullFile state transitions, coverage status, replay protection, and credit authorization, visit [ProofGuardFullFile.sol](file:///C:/Hackathons/Proof%20Firewall/contracts/src/ProofGuardFullFile.sol).

The Attestcoin Block Prover connection can be found in [VerifierInterface.sol](file:///C:/Hackathons/Proof%20Firewall/contracts/src/VerifierInterface.sol).

The tradeoff is deliberate: the guard accepts a single fixed source/event policy rather than attempting a general policy compiler or source registry during the hackathon.
