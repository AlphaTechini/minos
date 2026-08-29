# Project Structure

```text
.
|-- .agents/                 Confirmed product and security constraints
|-- contracts/
|   `-- src/                 Sepolia and Creditcoin Solidity contracts
|-- scripts/                 Deployment runner
|-- deployments/             Local public deployment metadata
|-- worker/
|   `-- src/                 Attestcoin proof ingestion worker
|-- details.md               Product definition
|-- research.txt             Attestcoin research and evidence
|-- foundry.toml             Solidity build settings
|-- package.json             Node.js scripts and pinned dependencies
`-- .env.example             Required runtime configuration schema
```

To find implementation constraints, visit [.agents/README.md](file:///C:/Hackathons/Proof%20Firewall/.agents/README.md).

To find Solidity contract responsibilities, visit [contracts/README.md](file:///C:/Hackathons/Proof%20Firewall/contracts/README.md).

To find worker responsibilities, visit [worker/README.md](file:///C:/Hackathons/Proof%20Firewall/worker/README.md).
