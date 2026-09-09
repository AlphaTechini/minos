# Contracts

This directory contains the separated on-chain boundaries for the Sepolia to Creditcoin authorization flow. Proof verification, history reconstruction, policy governance, and value release are separate so the destination application cannot bypass a failed guard decision.

To find the project-owned Sepolia loan events, visit [SourceLoanPositions.sol](file:///C:/Hackathons/Proof%20Firewall/contracts/src/SourceLoanPositions.sol).

To find Attestcoin verification, exact receipt-log policy checks, event nullifiers, eligibility evaluation, and decision receipts, visit [ProofGuard.sol](file:///C:/Hackathons/Proof%20Firewall/contracts/src/ProofGuard.sol).

To find immutable event records, state versions, coverage, freshness, and loan eligibility, visit [FullFile.sol](file:///C:/Hackathons/Proof%20Firewall/contracts/src/FullFile.sol).

To find the application-pinned source and policy registry, visit [LoanPolicyRegistry.sol](file:///C:/Hackathons/Proof%20Firewall/contracts/src/LoanPolicyRegistry.sol).

To find the guarded tCTC economic action, visit [LoanVault.sol](file:///C:/Hackathons/Proof%20Firewall/contracts/src/LoanVault.sol).

The Attestcoin Block Prover connection can be found in [VerifierInterface.sol](file:///C:/Hackathons/Proof%20Firewall/contracts/src/VerifierInterface.sol).
