# Worker

The worker scans every log from the policy-pinned Sepolia source contract through the latest block available in the Proof Builder. It imports recognized events in block, transaction, and receipt-log order, then advances FullFile coverage only after the complete range succeeds.

To find source bytecode and owner monitoring, unknown-event fail-closed behavior, receipt-local event identity, Attestcoin proof submission, durable cursor metadata, and coverage handling, visit [src/worker.js](file:///C:/Hackathons/Proof%20Firewall/worker/src/worker.js).

The worker supplies discovery and availability. It cannot authorize unverified event content because ProofGuard validates every event through Attestcoin before FullFile accepts it.

The production worker container can be found in [../Dockerfile](file:///C:/Hackathons/Proof%20Firewall/Dockerfile). It installs production dependencies in a separate stage, copies no `.env` file, and runs as the non-root `node` user.
