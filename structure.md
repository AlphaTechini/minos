# Project Structure

```text
.
|-- .agents/                 Confirmed architecture and security constraints
|-- contracts/
|   `-- src/                 Source, guard, registry, history, vault, and verifier contracts
|-- deployments/             Generated private-free deployment and policy metadata
|-- policy/                  Deterministic fixed-loan policy compiler and schema
|-- scripts/                 Build, deployment, application, and attack runners
|-- src/
|   |-- lib/                 Public blockchain and browser-wallet client
|   `-- routes/              SvelteKit security console and incident library
|-- static/                  Public runtime configuration and attack results
|-- worker/
|   `-- src/                 Attestcoin ingestion and source monitor
|-- details.md               Product definition and FullFile integration
|-- foundry.toml             Solidity compiler settings
|-- package.json             Pinned application dependencies and commands
|-- pnpm-workspace.yaml      Dependency build allowlist and security override
`-- .env.example             Runtime configuration schema
```

To find implementation constraints, visit [.agents/README.md](file:///C:/Hackathons/Proof%20Firewall/.agents/README.md).

To find all contract responsibilities, visit [contracts/README.md](file:///C:/Hackathons/Proof%20Firewall/contracts/README.md).

To find individual Solidity modules, visit [contracts/src/README.md](file:///C:/Hackathons/Proof%20Firewall/contracts/src/README.md).

To find generated deployment metadata decisions, visit [deployments/README.md](file:///C:/Hackathons/Proof%20Firewall/deployments/README.md).

To find deterministic policy logic, visit [policy/README.md](file:///C:/Hackathons/Proof%20Firewall/policy/README.md).

To find build, deployment, live-flow, and attack commands, visit [scripts/README.md](file:///C:/Hackathons/Proof%20Firewall/scripts/README.md).

To find dashboard architecture, visit [src/README.md](file:///C:/Hackathons/Proof%20Firewall/src/README.md).

To find the public contract client, visit [src/lib/README.md](file:///C:/Hackathons/Proof%20Firewall/src/lib/README.md).

To find the security console route, visit [src/routes/README.md](file:///C:/Hackathons/Proof%20Firewall/src/routes/README.md).

To find the incident-library route, visit [src/routes/problems/README.md](file:///C:/Hackathons/Proof%20Firewall/src/routes/problems/README.md).

To find browser-safe runtime files, visit [static/README.md](file:///C:/Hackathons/Proof%20Firewall/static/README.md).

To find worker responsibilities, visit [worker/README.md](file:///C:/Hackathons/Proof%20Firewall/worker/README.md).

To find the worker source entry point, visit [worker/src/README.md](file:///C:/Hackathons/Proof%20Firewall/worker/src/README.md).
