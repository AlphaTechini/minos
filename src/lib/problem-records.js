export const protectionLayers = [
  {
    label: "01 / Source identity",
    detail: "Pin the source chain, contract, expected code hash, authority, and event schema."
  },
  {
    label: "02 / Receipt evidence",
    detail: "Require an Attestcoin-verified successful receipt and the exact expected log."
  },
  {
    label: "03 / Current context",
    detail: "Keep ordered state and a coverage heartbeat, so later changes can invalidate an old positive event."
  },
  {
    label: "04 / Protected action",
    detail: "Bind the decision to one policy, event, and action. Replays and bypass paths cannot release value."
  }
];

export const incidentRecords = [
  {
    id: "dexodus",
    date: "26 MAY 2025",
    category: "VALID SIGNATURE / STALE DATA",
    impact: "About $291,000 lost",
    title: "Dexodus verified a real oracle report from the wrong moment.",
    summary: "An attacker replayed an old, correctly signed Chainlink ETH price report. Dexodus verified the signatures but did not enforce report freshness or one-time use, so the stale price opened a 100x long before a current price closed it at a profit.",
    minosControl: "A Minos-gated action is not authorized by proof validity alone. The proven event must match the enrolled policy and current state, coverage must remain fresh, and the event-to-action authorization can be consumed only once.",
    boundary: "Minos does not determine the correct market price or secure an oracle signer. An oracle integration must define the accepted report, freshness window, and economic bounds in its policy.",
    sourceLabel: "SolidityScan technical analysis",
    sourceUrl: "https://blog.solidityscan.com/dexodus-finance-hack-analysis-d699135f575c/",
    secondarySourceLabel: "Base exploit transaction",
    secondarySourceUrl: "https://basescan.org/tx/0x6ffb494293fc5c32c5a6ab7dc3fff1fcc6e90fba9a6d6e486ba0a15ce518147e"
  },
  {
    id: "venus",
    date: "12 MAY 2022",
    category: "VALID ORACLE VALUE / STALE COVERAGE",
    impact: "$14.2M initial shortfall",
    title: "Venus kept authorizing loans from a genuine price that had stopped updating.",
    summary: "Chainlink's LUNA feed reached its floor and stopped at $0.107. Four hours later, while spot LUNA was near $0.01, Venus still accepted the last genuine oracle answer and attackers borrowed against severely overstated collateral.",
    minosControl: "Minos records how far source history has been covered and how old that coverage is. A protected action fails closed when the required update stream is incomplete, behind the tracked state, stale, or older than the policy permits.",
    boundary: "Freshness cannot prove that a market price is economically correct. A price-dependent policy still needs appropriate oracle selection, deviation bounds, and fallback behavior.",
    sourceLabel: "Venus incident update",
    sourceUrl: "https://community.venus.io/t/venus-protocol-luna-incident-update-2/2654"
  },
  {
    id: "qubit",
    date: "27 JAN 2022",
    category: "VALID EVENT / FALSE ECONOMIC MEANING",
    impact: "About $80M drained",
    title: "Qubit proved that a Deposit event existed, not that ETH arrived.",
    summary: "QBridge's expected Ethereum contract completed 16 deposit transactions and emitted the expected event. Qubit's relayer then submitted genuine BSC votes. But a zero-address transfer had silently moved no ETH, so valid event evidence produced unbacked xETH collateral.",
    minosControl: "Minos separates receipt proof from the application decision. Its policy can constrain source identity, event shape, values, state transitions, coverage, and the exact destination action instead of treating event existence as sufficient authorization.",
    boundary: "No proof wrapper can infer an asset transfer that the canonical source contract failed to enforce or represent. Preventing this exact bug requires a policy or source event that independently binds the claimed deposit to actual asset movement.",
    sourceLabel: "Qubit protocol exploit report",
    sourceUrl: "https://medium.com/@QubitFin/protocol-exploit-report-305c34540fa3",
    secondarySourceLabel: "SlowMist loss analysis",
    secondarySourceUrl: "https://slowmist.medium.com/our-analysis-of-the-80m-qubit-finance-exploit-b0f272cd8c25"
  },
  {
    id: "hashi",
    date: "14 MAR 2022",
    category: "VALID EVENT / WRONG SOURCE",
    impact: "150 ETH compromised",
    title: "Hashi consumed a real Deposit log from an attacker's contract.",
    summary: "The attacker deployed a contract that genuinely emitted the expected Deposit event. The SORA-side bridge consumed that event without checking the emitting contract address and released 150 ETH; 130 ETH was later returned.",
    minosControl: "Minos reads the proven receipt log itself and rejects it unless the emitter is the exact policy-pinned source contract. Matching an event name and fields from any other deployment is not enough.",
    boundary: "Source binding proves which contract emitted a log, not that every rule inside that contract is safe. The pinned deployment and its policy still require review.",
    sourceLabel: "Polkaswap Hashi post-mortem",
    sourceUrl: "https://polkaswap.medium.com/hashi-bridge-post-mortem-b2b01d76fd20"
  },
  {
    id: "omnibridge",
    date: "16 SEP 2022",
    category: "VALID MESSAGE / WRONG CHAIN",
    impact: "200 ETHW extracted",
    title: "OmniBridge accepted a legitimate message again on the wrong fork.",
    summary: "An attacker first transferred 200 WETH through OmniBridge on Ethereum PoS, then replayed the same legitimate message on EthereumPoW. The forked bridge checked a stale stored chain ID rather than the chain it was actually running on.",
    minosControl: "Minos requires the proof's source chain to match the policy-pinned chain and binds each accepted event to one policy, destination application, action, and decision nullifier. A valid message cannot silently change domains or authorize the same action twice.",
    boundary: "Minos protects actions routed through its gate. It cannot stop a separate legacy bridge contract from accepting replayable calldata.",
    sourceLabel: "BlockSec technical report",
    sourceUrl: "https://blocksec.com/blog/reveal-the-message-replay-attacks-on-ethereum-po-w"
  }
];

export const rewardPatterns = [
  {
    title: "Distribution claims",
    detail: "Reward distributors commonly track a claim bitmap. The eligible leaf is only one part of whether a claimant can receive value now.",
    sourceLabel: "Uniswap Merkle Distributor",
    sourceUrl: "https://github.com/Uniswap/merkle-distributor/blob/master/contracts/MerkleDistributor.sol"
  },
  {
    title: "Vesting and cancellation",
    detail: "A vesting entitlement can change when a stream is cancelled. Downstream release logic must account for the later state, not only the original grant.",
    sourceLabel: "Sablier cancelability",
    sourceUrl: "https://docs.sablier.com/concepts/cancelability"
  },
  {
    title: "Time-weighted incentives",
    detail: "Liquidity-mining rewards depend on a position's evolving balance and time in a gauge, rather than a single static ownership snapshot.",
    sourceLabel: "Curve gauges overview",
    sourceUrl: "https://docs.curve.finance/developer/gauges/overview"
  }
];
