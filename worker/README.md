# Worker

The worker continuously scans the configured Sepolia source contract, limits scanning to the latest block available in the Proof Builder cache, waits for Attestcoin attestation, submits verified events to Creditcoin, and advances FullFile coverage only after processing the safe scanned range.

To find event discovery, proof generation, idempotent checkpoint persistence, and stale-coverage handling, visit [src/worker.js](file:///C:/Hackathons/Proof%20Firewall/worker/src/worker.js).

The worker is an availability and coverage component. It is not trusted to authorize a raw event because the Creditcoin guard verifies every imported event through Attestcoin.
