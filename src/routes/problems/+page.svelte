<script>
  import { incidentRecords, protectionLayers, rewardPatterns } from "$lib/problem-records.js";

  let openId = incidentRecords[0].id;

  function toggleCard(id) {
    openId = openId === id ? "" : id;
  }
</script>

<svelte:head>
  <title>Minos Incident Library</title>
  <meta name="description" content="Historical cross-chain and reward-asset incidents, with bounded Minos protections." />
</svelte:head>

<main>
  <header class="topbar">
    <a class="brand-lockup" href="/" aria-label="Return to the Minos security console">
      <div class="mark">M</div>
      <div>
        <p class="eyebrow">ATT-SEC / CC3</p>
        <h1>Minos <span>incident library</span></h1>
      </div>
    </a>
    <a class="console-link" href="/">Security console <span>-&gt;</span></a>
  </header>

  <section class="hero">
    <p class="eyebrow accent">HISTORICAL FAILURE MODES</p>
    <h2>Proof is necessary.<br /><span>Authorization needs more.</span></h2>
    <p class="lede">These reports show why a destination action cannot safely rely on an isolated message, event, or claim. Minos applies source identity, receipt evidence, current context, and one-time authorization to its own protected actions.</p>
  </section>

  <section class="layers" aria-labelledby="layers-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">MINOS CONTROL SURFACE</p>
        <h3 id="layers-title">Four checks before value moves</h3>
      </div>
      <p>Each layer answers a different question. No single historical incident is presented as proof that Minos would have fixed the affected protocol.</p>
    </div>
    <div class="layer-grid">
      {#each protectionLayers as layer}
        <article>
          <p>{layer.label}</p>
          <span>{layer.detail}</span>
        </article>
      {/each}
    </div>
  </section>

  <section class="incidents" aria-labelledby="incidents-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">PRIMARY-SOURCE RECORDS</p>
        <h3 id="incidents-title">What failed, and what a Minos gate can actually control</h3>
      </div>
      <p>Expand a record for the reported facts, the relevant destination-gate control, and an explicit protection boundary.</p>
    </div>

    <div class="incident-list">
      {#each incidentRecords as incident, index}
        <article class:open={openId === incident.id} class="incident-card">
          <button
            class="incident-trigger"
            aria-controls={`${incident.id}-details`}
            aria-expanded={openId === incident.id}
            onclick={() => toggleCard(incident.id)}
          >
            <span class="incident-index">0{index + 1}</span>
            <span class="incident-date">{incident.date}</span>
            <span class="incident-title">
              <small>{incident.category}</small>
              <strong>{incident.title}</strong>
            </span>
            <span class="impact">{incident.impact}</span>
            <span class="plus" aria-hidden="true">{openId === incident.id ? "-" : "+"}</span>
          </button>

          <div class="incident-details" id={`${incident.id}-details`} hidden={openId !== incident.id}>
            <div class="incident-summary">
              <p>{incident.summary}</p>
              <a href={incident.sourceUrl} target="_blank" rel="noreferrer">Read {incident.sourceLabel} <span>-&gt;</span></a>
            </div>
            <div class="detail-grid">
              <section class="control">
                <p class="eyebrow">MINOS-OWNED CONTROL</p>
                <p>{incident.minosControl}</p>
              </section>
              <section class="boundary">
                <p class="eyebrow">PROTECTION BOUNDARY</p>
                <p>{incident.boundary}</p>
              </section>
            </div>
          </div>
        </article>
      {/each}
    </div>
  </section>

  <section class="reward-assets" aria-labelledby="reward-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">PRIMARY APPLICATION</p>
        <h3 id="reward-title">Reward assets change after the first event</h3>
      </div>
      <p>Minos is designed for systems where the original grant or claim is not enough to establish a current entitlement.</p>
    </div>
    <div class="pattern-grid">
      {#each rewardPatterns as pattern}
        <article>
          <h4>{pattern.title}</h4>
          <p>{pattern.detail}</p>
          <a href={pattern.sourceUrl} target="_blank" rel="noreferrer">{pattern.sourceLabel} <span>-&gt;</span></a>
        </article>
      {/each}
    </div>
  </section>

  <section class="boundary-note">
    <p class="eyebrow">CLAIM DISCIPLINE</p>
    <p>Minos verifies and authorizes only the source events and protected destination actions enrolled in its policy. It does not claim universal source-state coverage, automatic proxy-upgrade safety, legal ownership verification, or a fix for vulnerable third-party source contracts.</p>
  </section>
</main>

<style>
  :global(.eyebrow), .incident-index, .incident-date, .impact, .layer-grid p {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    letter-spacing: 0.08em;
  }

  main { width: min(1280px, 100%); margin: 0 auto; padding: 0 28px 76px; }
  .topbar { min-height: 82px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #24443e; }
  .brand-lockup { display: flex; align-items: center; gap: 14px; color: inherit; text-decoration: none; }
  .mark { width: 42px; height: 42px; display: grid; place-items: center; color: #06110f; background: #5ce4c7; font: 800 14px/1 Consolas, monospace; clip-path: polygon(0 0, 78% 0, 100% 22%, 100% 100%, 22% 100%, 0 78%); }
  h1 { margin: 2px 0 0; font-size: 18px; letter-spacing: -0.02em; }
  h1 span { color: #78958e; font-weight: 500; }
  .eyebrow { margin: 0; color: #78958e; font-size: 10px; font-weight: 700; }
  .accent { color: #5ce4c7; }
  .console-link, .incident-summary a, .pattern-grid a { color: #5ce4c7; font: 700 11px Consolas, monospace; letter-spacing: 0.04em; text-decoration: none; }
  .console-link:hover, .incident-summary a:hover, .pattern-grid a:hover { color: #b9fff0; text-decoration: underline; }
  .console-link span, .incident-summary span, .pattern-grid span { display: inline-block; margin-left: 4px; }

  .hero { padding: 74px 0 52px; }
  h2 { max-width: 900px; margin: 12px 0 20px; color: #f0f7f5; font-size: clamp(44px, 7vw, 92px); line-height: 0.91; letter-spacing: -0.07em; }
  h2 span { color: #5ce4c7; }
  .lede { max-width: 760px; margin: 0; color: #9fb3ae; font-size: 17px; line-height: 1.65; }

  .layers, .incidents, .reward-assets { padding: 28px 0 0; border-top: 1px solid #24443e; }
  .section-heading { display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 48px; align-items: end; margin-bottom: 24px; }
  .section-heading h3 { max-width: 680px; margin: 8px 0 0; color: #edf7f3; font-size: clamp(24px, 3vw, 38px); line-height: 1.08; letter-spacing: -0.045em; }
  .section-heading > p { margin: 0 0 3px; color: #829a94; font-size: 13px; line-height: 1.55; }
  .layer-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .layer-grid article { min-height: 152px; padding: 18px; border: 1px solid #20453d; background: rgba(9, 25, 21, 0.86); }
  .layer-grid p { margin: 0 0 28px; color: #5ce4c7; font-size: 10px; }
  .layer-grid span { color: #bdd0ca; font-size: 13px; line-height: 1.48; }

  .incidents { margin-top: 52px; }
  .incident-list { display: grid; gap: 8px; }
  .incident-card { border: 1px solid #25453e; background: rgba(8, 21, 18, 0.88); }
  .incident-card.open { border-color: #3c7568; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18); }
  .incident-trigger { width: 100%; display: grid; grid-template-columns: 42px 110px minmax(0, 1fr) 210px 36px; gap: 14px; align-items: center; padding: 21px 20px; color: inherit; border: 0; background: transparent; text-align: left; cursor: pointer; }
  .incident-trigger:hover { background: rgba(32, 75, 64, 0.22); }
  .incident-index { color: #5ce4c7; font-size: 11px; }
  .incident-date { color: #81958f; font-size: 10px; }
  .incident-title { display: grid; gap: 7px; }
  .incident-title small { color: #d6a85c; font: 700 9px Consolas, monospace; letter-spacing: 0.11em; }
  .incident-title strong { color: #e5f0ed; font-size: 15px; line-height: 1.25; }
  .impact { color: #e4b1a4; font-size: 10px; line-height: 1.35; }
  .plus { display: grid; width: 28px; height: 28px; place-items: center; color: #5ce4c7; border: 1px solid #397368; font: 400 22px/1 Arial, sans-serif; }
  .incident-details { display: grid; grid-template-columns: 0.74fr 1.26fr; gap: 24px; padding: 0 20px 22px 200px; }
  .incident-summary { padding: 20px; border-left: 3px solid #5ce4c7; background: #0a1d19; }
  .incident-summary p { margin: 0 0 19px; color: #c5d6d1; font-size: 14px; line-height: 1.55; }
  .detail-grid { display: grid; gap: 10px; }
  .detail-grid section { padding: 17px 18px; }
  .detail-grid section > p:last-child { margin: 9px 0 0; font-size: 12px; line-height: 1.55; }
  .control { border: 1px solid #285e53; background: #0b251f; color: #c7eee1; }
  .boundary { border: 1px solid #664238; background: #241713; color: #e6c1b4; }
  .boundary .eyebrow { color: #e4a18e; }

  .reward-assets { margin-top: 52px; }
  .pattern-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .pattern-grid article { min-height: 205px; display: flex; flex-direction: column; padding: 22px; border: 1px solid #294b44; background: rgba(9, 25, 21, 0.82); }
  .pattern-grid h4 { margin: 0; color: #e4f1ed; font-size: 18px; letter-spacing: -0.025em; }
  .pattern-grid p { margin: 14px 0 22px; color: #9db3ad; font-size: 13px; line-height: 1.55; }
  .pattern-grid a { margin-top: auto; }
  .boundary-note { max-width: 900px; margin: 52px auto 0; padding: 24px; border: 1px dashed #486159; color: #a7bdb7; background: rgba(8, 20, 17, 0.7); }
  .boundary-note > p:last-child { margin: 10px 0 0; font-size: 13px; line-height: 1.6; }

  @media (max-width: 900px) {
    .layer-grid { grid-template-columns: 1fr 1fr; }
    .incident-trigger { grid-template-columns: 38px 100px minmax(0, 1fr) 32px; }
    .impact { display: none; }
    .incident-details { grid-template-columns: 1fr; padding-left: 20px; }
  }

  @media (max-width: 640px) {
    main { padding: 0 16px 48px; }
    .topbar { min-height: 74px; }
    .console-link { font-size: 10px; }
    .hero { padding: 52px 0 40px; }
    h2 { font-size: clamp(41px, 13vw, 62px); }
    .lede { font-size: 15px; }
    .section-heading { grid-template-columns: 1fr; gap: 14px; }
    .layer-grid, .pattern-grid { grid-template-columns: 1fr; }
    .incident-trigger { grid-template-columns: 30px minmax(0, 1fr) 30px; gap: 10px; padding: 17px 14px; }
    .incident-date { grid-column: 2; grid-row: 2; }
    .incident-title { grid-column: 2; grid-row: 1; }
    .plus { grid-column: 3; grid-row: 1 / span 2; }
    .incident-details { padding: 0 14px 14px; }
  }
</style>
