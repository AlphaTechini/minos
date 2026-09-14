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
    id: "wormhole",
    date: "02 FEB 2022",
    category: "BRIDGE VERIFICATION",
    impact: "120,000 unbacked weETH minted",
    title: "Wormhole accepted a verification path that should have failed.",
    summary: "A signature-verification vulnerability was used to mint wrapped Ether on Solana without an Ethereum-side deposit.",
    minosControl: "For a Minos-protected release, a claimed bridge message is not enough. The action requires an Attestcoin-proven receipt from the pinned source chain and contract, an expected event shape, an active policy, and an unused decision.",
    boundary: "Minos does not repair Wormhole or another bridge verifier. If a broken canonical source contract emits a valid-looking event, the application still needs an independent semantic rule or a trusted source change.",
    sourceLabel: "Wormhole incident report",
    sourceUrl: "https://wormholecrypto.medium.com/wormhole-incident-report-02-02-22-ad9b8f21eec6"
  },
  {
    id: "nomad",
    date: "01 AUG 2022",
    category: "MESSAGE AUTHENTICATION",
    impact: "Forged inbound messages accepted",
    title: "Nomad's Replica failed to authenticate messages correctly.",
    summary: "A zero-value initialization path made unproven messages acceptable, so downstream bridge routing processed fraudulent messages.",
    minosControl: "Minos requires the destination decision to name the exact policy, source contract, and attested source receipt. It also prevents an old event from being reused after the tracked position state changes.",
    boundary: "Minos cannot make a faulty source message verifier truthful. It limits what a separate Minos-gated destination action accepts; it does not replace the bridge's own authentication logic.",
    sourceLabel: "Nomad root-cause analysis",
    sourceUrl: "https://medium.com/nomad-xyz-blog/nomad-bridge-hack-root-cause-analysis-875ad2e5aacd"
  },
  {
    id: "qubit",
    date: "27 JAN 2022",
    category: "UNBACKED COLLATERAL",
    impact: "xETH minted without a token transfer",
    title: "Qubit's deposit path accepted collateral that never arrived.",
    summary: "A stale deposit function passed the zero address as its token, allowing the transfer step to succeed without WETH and enabling xETH-backed borrowing.",
    minosControl: "Minos can keep a protected destination release tied to a pinned source deployment, exact event schema, principal bounds, and current source history instead of a generic claim that collateral exists.",
    boundary: "This source-side accounting bug is outside Minos's proof layer. If the canonical source contract itself records unbacked collateral as valid, Minos cannot infer the missing transfer without a separately defined verification rule.",
    sourceLabel: "Qubit protocol exploit report",
    sourceUrl: "https://medium.com/@QubitFin/protocol-exploit-report-305c34540fa3"
  },
  {
    id: "bnb-token-hub",
    date: "06 OCT 2022",
    category: "PROOF VERIFIER",
    impact: "Forged bridge proof exploited",
    title: "BNB Chain's Token Hub verifier accepted a forged proof.",
    summary: "BNB Chain reported that an attacker exploited a bug in the bridge's legitimate-proof verification path.",
    minosControl: "Minos keeps proof verification and application authorization separate: an action is released only after the proof identifies the pinned source and expected log, then passes policy, freshness, and replay checks.",
    boundary: "No wrapper can cure a defect inside another protocol's proof verifier. This pattern protects a Minos-owned destination gate, not every consumer of the affected bridge.",
    sourceLabel: "BNB Chain response",
    sourceUrl: "https://www.bnbchain.org/en/blog/bnb-chain-a-decentralized-response"
  },
  {
    id: "penpie",
    date: "03 SEP 2024",
    category: "REWARD ACCOUNTING",
    impact: "11,113.6 ETH stolen",
    title: "Penpie reward harvesting was manipulated through a fake market.",
    summary: "A reentrancy path and permissionless market registration let an attacker use a fake Pendle market to manipulate reward accounting and drain funds.",
    minosControl: "For reward assets, Minos can restrict a release to an approved market and source contract, expected reward event, current eligibility record, and one-time action decision. A new source identity or unsupported event pauses the policy instead of silently broadening access.",
    boundary: "Minos does not prevent reentrancy or validate arbitrary reward math inside Penpie. A Minos gate can constrain a downstream reward release, but the vulnerable source contract still requires its own fix.",
    sourceLabel: "Penpie post-mortem report",
    sourceUrl: "https://blog.penpiexyz.io/penpie-post-mortem-report-1ac9863b663a"
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
