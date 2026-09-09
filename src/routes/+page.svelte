<script>
  import { onMount } from "svelte";
  import {
    authorizeLoan,
    connectWallet,
    coverageStates,
    eligibilityReasons,
    loadAdversarialResults,
    loadDeployment,
    openPosition,
    positionStates,
    readDashboard,
    recordRepayment,
    reverseRepayment,
    scenarioIds
  } from "$lib/contracts.js";

  let deployment;
  let dashboard;
  let walletAddress = "";
  let positionId = "";
  let repaymentId = "";
  let termsHash = "";
  let reasonHash = "";
  let principal = "";
  let busy = "";
  let notice = "";
  let error = "";
  let adversarialResults = [];

  const short = (value, size = 7) => value ? `${value.slice(0, size + 2)}...${value.slice(-size)}` : "Not available";
  const numeric = (value) => Number(value ?? 0);

  function generateScenario() {
    const ids = scenarioIds();
    positionId = ids.positionId;
    repaymentId = ids.repaymentId;
    termsHash = ids.termsHash;
    reasonHash = ids.reasonHash;
    dashboard = undefined;
    notice = "Generated disposable test identifiers. Enter a principal in wei to begin.";
  }

  async function perform(label, task) {
    busy = label;
    error = "";
    notice = "";
    try {
      const result = await task();
      notice = result?.hash ? `${label} confirmed: ${result.hash}` : `${label} complete.`;
      return result;
    } catch (caught) {
      error = caught.shortMessage ?? caught.message ?? String(caught);
    } finally {
      busy = "";
    }
  }

  async function refresh() {
    if (!positionId) {
      error = "Generate or enter a position ID first.";
      return;
    }
    await perform("Loading evidence", async () => {
      dashboard = await readDashboard(deployment, positionId);
    });
  }

  onMount(async () => {
    try {
      deployment = await loadDeployment();
      adversarialResults = await loadAdversarialResults();
    } catch (caught) {
      error = caught.message;
    }
  });
</script>

<svelte:head>
  <title>ProofGuard Security Console</title>
  <meta name="description" content="Attestcoin policy enforcement and ordered FullFile evidence." />
</svelte:head>

<main>
  <header class="topbar">
    <div class="brand-lockup">
      <div class="mark">PG</div>
      <div>
        <p class="eyebrow">ATT-SEC / CC3</p>
        <h1>ProofGuard <span>+ FullFile</span></h1>
      </div>
    </div>
    <div class="network-strip">
      <span><i class="online"></i> Sepolia source</span>
      <span><i class="online"></i> CC3 enforcement</span>
      <button
        class="wallet-button"
        disabled={!deployment || !!busy}
        onclick={() => perform("Wallet connection", async () => {
          walletAddress = await connectWallet(deployment);
        })}
      >{walletAddress ? short(walletAddress) : "Connect wallet"}</button>
    </div>
  </header>

  <section class="hero">
    <div>
      <p class="eyebrow accent">CROSS-CHAIN AUTHORIZATION FIREWALL</p>
      <h2>Real proof. Exact policy.<br /><span>Current context.</span></h2>
      <p class="lede">ProofGuard validates the event. FullFile proves whether that event still qualifies for the action being requested.</p>
    </div>
    <div class="policy-fingerprint">
      <p>ACTIVE POLICY</p>
      <strong>{deployment ? short(deployment.policyId, 10) : "Awaiting deployment"}</strong>
      <dl>
        <div><dt>Source</dt><dd>Ethereum Sepolia</dd></div>
        <div><dt>Action</dt><dd>Release tCTC loan</dd></div>
        <div><dt>Mode</dt><dd>Fail closed</dd></div>
      </dl>
    </div>
  </section>

  {#if error}<div class="alert error"><b>BLOCKED</b><span>{error}</span></div>{/if}
  {#if notice}<div class="alert success"><b>RECORDED</b><span>{notice}</span></div>{/if}

  <section class="workspace">
    <aside class="control-panel">
      <div class="panel-heading">
        <p class="eyebrow">TESTNET CONTROL</p>
        <button class="text-button" onclick={generateScenario}>Generate scenario</button>
      </div>

      <label>Position ID<input bind:value={positionId} placeholder="0x..." /></label>
      <label>Principal in wei<input bind:value={principal} inputmode="numeric" placeholder="100000000000000000" /></label>
      <label>Terms hash<input bind:value={termsHash} placeholder="0x..." /></label>
      <label>Repayment ID<input bind:value={repaymentId} placeholder="0x..." /></label>
      <label>Reversal reason hash<input bind:value={reasonHash} placeholder="0x..." /></label>

      <div class="action-grid">
        <button disabled={!deployment || !!busy} onclick={() => perform("Position opened", () => openPosition(deployment, positionId, principal, termsHash))}>1. Open position</button>
        <button disabled={!deployment || !!busy} onclick={() => perform("Repayment recorded", () => recordRepayment(deployment, positionId, repaymentId, principal))}>2. Record repayment</button>
        <button class="secondary" disabled={!deployment || !!busy} onclick={refresh}>3. Refresh evidence</button>
        <button class="authorize" disabled={!dashboard?.eligible || !!busy} onclick={() => perform("Loan released", () => authorizeLoan(deployment, positionId, dashboard.candidateEventId))}>4. Release loan</button>
        <button class="danger" disabled={!deployment || !!busy} onclick={() => perform("Repayment reversed", () => reverseRepayment(deployment, positionId, repaymentId, reasonHash))}>5. Reverse repayment</button>
      </div>
      <p class="operator-note">Run <code>pnpm worker:once</code> after each Sepolia event, then refresh evidence.</p>
    </aside>

    <div class="evidence-area">
      <div class="metrics">
        <article>
          <p>POSITION STATE</p>
          <strong class:good={numeric(dashboard?.position.state) === 2} class:bad={numeric(dashboard?.position.state) === 3}>
            {dashboard ? positionStates[numeric(dashboard.position.state)] : "Unloaded"}
          </strong>
        </article>
        <article>
          <p>COVERAGE</p>
          <strong class:good={numeric(dashboard?.coverage.status) === 1}>
            {dashboard ? coverageStates[numeric(dashboard.coverage.status)] : "Unloaded"}
          </strong>
        </article>
        <article>
          <p>ELIGIBILITY</p>
          <strong class:good={dashboard?.eligible} class:bad={dashboard && !dashboard.eligible}>
            {dashboard?.eligible ? "Authorized" : "Blocked"}
          </strong>
        </article>
        <article>
          <p>VAULT RELEASE</p>
          <strong>{dashboard ? `${dashboard.releasedLoan.toString()} wei` : "Unloaded"}</strong>
        </article>
      </div>

      <div class="evidence-grid">
        <article class="panel verdict-panel">
          <div class="panel-heading"><p class="eyebrow">DECISION ENGINE</p><span class="tag">READ ONLY</span></div>
          <div class="verdict" class:allow={dashboard?.eligible}>
            <span>{dashboard?.eligible ? "ALLOW" : "DENY"}</span>
            <div>
              <b>{dashboard ? eligibilityReasons[numeric(dashboard.reason)] : "No position loaded"}</b>
              <p>{dashboard?.eligible ? "Policy, current state, and coverage all agree." : "No value can leave the vault while this condition remains."}</p>
            </div>
          </div>
          <ul class="checks">
            <li class:pass={dashboard?.sourceIdentity.codeMatches}><span>Source bytecode</span><b>{dashboard?.sourceIdentity.codeMatches ? "MATCH" : "UNVERIFIED"}</b></li>
            <li class:pass={dashboard?.sourceIdentity.ownerMatches}><span>Source authority</span><b>{dashboard?.sourceIdentity.ownerMatches ? "MATCH" : "UNVERIFIED"}</b></li>
            <li class:pass={dashboard?.processed}><span>Repayment proof</span><b>{dashboard?.processed ? "ATTESTED" : "ABSENT"}</b></li>
            <li class:pass={numeric(dashboard?.coverage.status) === 1}><span>Coverage heartbeat</span><b>{dashboard ? `${dashboard.coverageAge} blocks` : "UNKNOWN"}</b></li>
          </ul>
        </article>

        <article class="panel manifest-panel">
          <div class="panel-heading"><p class="eyebrow">POLICY SURFACE</p><span class="tag cyan">PINNED</span></div>
          <dl class="manifest">
            <div><dt>Policy</dt><dd>{deployment ? short(deployment.policyId, 8) : "-"}</dd></div>
            <div><dt>Source</dt><dd>{deployment ? short(deployment.sourcePositionContract) : "-"}</dd></div>
            <div><dt>Guard</dt><dd>{deployment ? short(deployment.proofGuard) : "-"}</dd></div>
            <div><dt>FullFile</dt><dd>{deployment ? short(deployment.fullFile) : "-"}</dd></div>
            <div><dt>Vault</dt><dd>{deployment ? short(deployment.loanVault) : "-"}</dd></div>
            <div><dt>Compiler</dt><dd>{dashboard ? short(dashboard.policy.compilerVersion) : "-"}</dd></div>
          </dl>
        </article>
      </div>

      <article class="panel timeline-panel">
        <div class="panel-heading">
          <div><p class="eyebrow">FULLFILE HISTORY</p><h3>Immutable state versions</h3></div>
          <span class="tag">{dashboard?.versions.length ?? 0} RECORDS</span>
        </div>
        {#if dashboard?.versions.length}
          <ol class="timeline">
            {#each dashboard.versions as version}
              <li>
                <span class="node"></span>
                <div class="timeline-main">
                  <p>VERSION {version.version.toString()}</p>
                  <strong>{positionStates[numeric(version.state)]}</strong>
                  <small>{short(version.eventId, 9)}</small>
                </div>
                <dl>
                  <div><dt>Source block</dt><dd>{version.source.blockNumber.toString()}</dd></div>
                  <div><dt>Tx / log</dt><dd>{version.source.transactionIndex.toString()} / {version.source.logIndex.toString()}</dd></div>
                  <div><dt>Commitment</dt><dd>{short(version.stateCommitment)}</dd></div>
                </dl>
              </li>
            {/each}
          </ol>
        {:else}
          <div class="empty-state"><span>00</span><p>No Attestcoin-verified state has been loaded for this position.</p></div>
        {/if}
      </article>

      <article class="panel attack-panel">
        <div class="panel-heading">
          <div><p class="eyebrow">ADVERSARIAL CONSOLE</p><h3>Recorded attack probes</h3></div>
          <span class="tag">{adversarialResults.length} SCENARIOS</span>
        </div>
        {#if adversarialResults.length}
          <div class="attack-grid">
            {#each adversarialResults as result}
              <div class:passed={result.passed} class="attack-card">
                <span>{result.passed ? "PASS" : "FAIL"}</span>
                <strong>{result.scenario}</strong>
                <p>Expected {result.expected}</p>
                <code>{result.observed}</code>
              </div>
            {/each}
          </div>
        {:else}
          <p class="attack-empty">Run <code>pnpm adversarial-flow</code> after the live loan flow to publish verified attack results here.</p>
        {/if}
      </article>
    </div>
  </section>
</main>

<style>
  :global(code), .eyebrow, .tag, .metrics p, .manifest dt, .timeline p, .checks b {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    letter-spacing: 0.08em;
  }

  main { width: min(1500px, 100%); margin: 0 auto; padding: 0 28px 64px; }
  .topbar { min-height: 82px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #24443e; }
  .brand-lockup, .network-strip, .panel-heading, .verdict { display: flex; align-items: center; }
  .brand-lockup { gap: 14px; }
  .mark { width: 42px; height: 42px; display: grid; place-items: center; color: #06110f; background: #5ce4c7; font: 800 14px/1 Consolas, monospace; clip-path: polygon(0 0, 78% 0, 100% 22%, 100% 100%, 22% 100%, 0 78%); }
  h1 { margin: 2px 0 0; font-size: 18px; letter-spacing: -0.02em; }
  h1 span { color: #78958e; font-weight: 500; }
  .eyebrow { margin: 0; color: #78958e; font-size: 10px; font-weight: 700; }
  .accent { color: #5ce4c7; }
  .network-strip { gap: 22px; color: #9fb3ae; font-size: 12px; }
  .network-strip span { display: flex; align-items: center; gap: 7px; }
  .online { width: 7px; height: 7px; border-radius: 50%; background: #61dfa2; box-shadow: 0 0 12px #61dfa2; }
  button { border: 1px solid #38645b; border-radius: 3px; padding: 11px 14px; color: #dff5ef; background: #11221f; cursor: pointer; transition: 150ms ease; }
  button:hover:not(:disabled) { border-color: #5ce4c7; background: #17332d; transform: translateY(-1px); }
  button:disabled { opacity: 0.38; cursor: not-allowed; }
  .wallet-button { min-width: 142px; border-color: #5ce4c7; color: #5ce4c7; background: transparent; }
  .hero { display: grid; grid-template-columns: 1fr 360px; align-items: end; gap: 60px; padding: 58px 0 44px; }
  h2 { margin: 12px 0 20px; max-width: 850px; color: #f0f7f5; font-size: clamp(42px, 5.7vw, 82px); line-height: 0.94; letter-spacing: -0.065em; }
  h2 span { color: #5ce4c7; }
  .lede { max-width: 680px; margin: 0; color: #9fb3ae; font-size: 17px; line-height: 1.6; }
  .policy-fingerprint { padding: 22px; border: 1px solid #31544c; border-left: 3px solid #5ce4c7; background: rgba(10, 24, 21, 0.82); }
  .policy-fingerprint > p { margin: 0 0 8px; color: #78958e; font: 700 10px Consolas, monospace; letter-spacing: 0.12em; }
  .policy-fingerprint > strong { color: #5ce4c7; font: 600 14px Consolas, monospace; }
  .policy-fingerprint dl { margin: 20px 0 0; }
  .policy-fingerprint dl div { display: flex; justify-content: space-between; padding: 8px 0; border-top: 1px solid #1d3933; font-size: 12px; }
  dt { color: #78958e; } dd { margin: 0; }
  .alert { display: grid; grid-template-columns: 100px 1fr; gap: 18px; margin-bottom: 20px; padding: 14px 18px; border: 1px solid; font-size: 13px; }
  .alert b { font: 700 11px Consolas, monospace; letter-spacing: 0.1em; }
  .alert.error { color: #ffd6c8; border-color: #7c382c; background: #2a1512; }
  .alert.success { color: #c8f6e4; border-color: #2c6a58; background: #102820; }
  .workspace { display: grid; grid-template-columns: 340px 1fr; gap: 20px; align-items: start; }
  .control-panel, .panel, .metrics article { border: 1px solid #203f39; background: rgba(9, 22, 19, 0.9); box-shadow: 0 18px 50px rgba(0, 0, 0, 0.18); }
  .control-panel { position: sticky; top: 20px; padding: 22px; }
  .panel-heading { justify-content: space-between; gap: 18px; }
  .text-button { padding: 0; border: 0; color: #5ce4c7; background: transparent; font-size: 11px; }
  label { display: grid; gap: 7px; margin-top: 16px; color: #91a8a2; font-size: 11px; }
  input { width: 100%; min-width: 0; padding: 11px 12px; border: 1px solid #294b44; border-radius: 2px; color: #e8f2ef; background: #091612; font: 12px Consolas, monospace; }
  input::placeholder { color: #49645e; }
  .action-grid { display: grid; gap: 9px; margin-top: 22px; }
  .action-grid button { text-align: left; }
  .action-grid .secondary { border-style: dashed; color: #a4bbb5; background: transparent; }
  .action-grid .authorize { color: #062019; border-color: #5ce4c7; background: #5ce4c7; font-weight: 800; }
  .action-grid .danger { color: #ffb49e; border-color: #6c382f; background: #271512; }
  .operator-note { margin: 18px 0 0; color: #708a84; font-size: 11px; line-height: 1.55; }
  .operator-note code { color: #b9d3cc; }
  .evidence-area { min-width: 0; }
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .metrics article { min-height: 106px; padding: 18px; }
  .metrics p { margin: 0 0 19px; color: #6f8a84; font-size: 9px; }
  .metrics strong { display: block; overflow: hidden; color: #dceae6; font-size: 18px; text-overflow: ellipsis; }
  .good { color: #61dfa2 !important; } .bad { color: #ff8e74 !important; }
  .evidence-grid { display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 12px; margin-top: 12px; }
  .panel { padding: 22px; }
  .tag { padding: 5px 7px; color: #d6a85c; border: 1px solid #624c29; background: #261f12; font-size: 8px; }
  .tag.cyan { color: #5ce4c7; border-color: #285e53; background: #0d2c26; }
  .verdict { gap: 18px; margin-top: 24px; padding: 18px; border: 1px solid #6a332b; background: linear-gradient(90deg, rgba(111, 45, 34, 0.26), transparent); }
  .verdict.allow { border-color: #286653; background: linear-gradient(90deg, rgba(32, 105, 82, 0.26), transparent); }
  .verdict > span { min-width: 76px; color: #ff8e74; font: 900 20px Consolas, monospace; }
  .verdict.allow > span { color: #61dfa2; }
  .verdict b { font-size: 14px; } .verdict p { margin: 5px 0 0; color: #819a94; font-size: 12px; }
  .checks { display: grid; gap: 0; margin: 18px 0 0; padding: 0; list-style: none; }
  .checks li { display: flex; justify-content: space-between; padding: 11px 2px; border-bottom: 1px solid #19332e; color: #879d98; font-size: 12px; }
  .checks b { color: #d6a85c; font-size: 9px; } .checks li.pass b { color: #61dfa2; }
  .manifest { margin: 24px 0 0; }
  .manifest div { padding: 11px 0; border-bottom: 1px solid #19332e; }
  .manifest dt { margin-bottom: 6px; font-size: 9px; } .manifest dd { overflow: hidden; color: #c8d9d4; font: 12px Consolas, monospace; text-overflow: ellipsis; }
  .timeline-panel { margin-top: 12px; }
  .timeline-panel h3 { margin: 7px 0 0; font-size: 20px; }
  .timeline { margin: 24px 0 0; padding: 0; list-style: none; }
  .timeline li { position: relative; display: grid; grid-template-columns: 28px 1fr minmax(250px, 0.9fr); gap: 12px; padding: 18px 0; border-top: 1px solid #1b3731; }
  .node { width: 10px; height: 10px; margin-top: 4px; border: 2px solid #5ce4c7; background: #07100f; transform: rotate(45deg); }
  .timeline-main p { margin: 0 0 5px; color: #5ce4c7; font-size: 9px; }
  .timeline-main strong { display: block; margin-bottom: 6px; } .timeline-main small { color: #708a84; font: 10px Consolas, monospace; }
  .timeline dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 0; }
  .timeline dl div { min-width: 0; } .timeline dt { margin-bottom: 6px; font-size: 9px; } .timeline dd { overflow: hidden; font: 10px Consolas, monospace; text-overflow: ellipsis; }
  .empty-state { display: flex; align-items: center; gap: 18px; min-height: 150px; margin-top: 20px; color: #6c8580; border-top: 1px solid #1b3731; }
  .empty-state span { color: #24443e; font: 800 48px Consolas, monospace; }
  .attack-panel { margin-top: 12px; }
  .attack-panel h3 { margin: 7px 0 0; font-size: 20px; }
  .attack-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 22px; }
  .attack-card { display: grid; gap: 8px; min-width: 0; padding: 15px; border: 1px solid #63382f; background: #221411; }
  .attack-card.passed { border-color: #285e50; background: #0c251e; }
  .attack-card > span { color: #ff8e74; font: 800 9px Consolas, monospace; letter-spacing: 0.1em; }
  .attack-card.passed > span { color: #61dfa2; }
  .attack-card strong { text-transform: uppercase; font-size: 12px; }
  .attack-card p { margin: 0; color: #78918b; font-size: 10px; }
  .attack-card code { overflow: hidden; color: #c6d8d3; font-size: 10px; text-overflow: ellipsis; }
  .attack-empty { margin: 24px 0 4px; color: #718b84; font-size: 12px; }
  .attack-empty code { color: #5ce4c7; }

  @media (max-width: 1050px) {
    .hero { grid-template-columns: 1fr; } .policy-fingerprint { max-width: 600px; }
    .workspace { grid-template-columns: 1fr; } .control-panel { position: static; }
  }
  @media (max-width: 720px) {
    main { padding: 0 16px 40px; }
    .topbar { align-items: flex-start; gap: 18px; padding: 18px 0; }
    .network-strip { align-items: flex-end; flex-direction: column; gap: 8px; }
    .network-strip span { display: none; }
    .hero { padding: 42px 0 30px; gap: 28px; }
    h2 { font-size: 46px; }
    .metrics, .evidence-grid { grid-template-columns: 1fr 1fr; }
    .evidence-grid { grid-template-columns: 1fr; }
    .attack-grid { grid-template-columns: 1fr 1fr; }
    .timeline li { grid-template-columns: 24px 1fr; }
    .timeline dl { grid-column: 2; grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 460px) {
    .metrics { grid-template-columns: 1fr; }
    .attack-grid { grid-template-columns: 1fr; }
    .brand-lockup .eyebrow { display: none; }
    .wallet-button { min-width: 120px; }
    h2 { font-size: 39px; }
  }
</style>
