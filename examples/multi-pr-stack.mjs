// Multi-PR example: a five-PR stack, one step per PR in merge order.
export default {
  slug: 'nexus-slack-stack',
  title: 'Slack feedback to JPD: the five-PR stack',
  subtitle: 'algolia/nexus #42 → #43 → #45 → #48 → #50 · each step is one PR, each substep one change or review finding',
  steps: [
  {
    kicker: '#42',
    url: 'https://github.com/algolia/nexus/pull/42',
    title: 'Cortex learns to read a Slack thread',
    verdict: 'Request changes',
    substeps: [
      {
        title: 'Before: Signals only know Gong',
        body: 'Ingestion writes a normalized Gong transcript. Signal extraction parses its raw input id, labels it with labelGong, screens it with the shared rules, and fans Signals out to CSOS.',
        diagram: `flowchart LR
  subgraph ING[Cortex ingestion]
    G[Gong call] --> K["ingestionKeys(callId)"] --> N[normalized.json]
  end
  subgraph SIG[Cortex signals]
    P["parseRawInputId<br>rawInputSources: gong"] --> LG[labelGong] --> SC["screen<br>shared rules"] --> S[(Signals)]
  end
  N --> P
  S --> CS[CSOS]`,
      },
      {
        title: 'A Slack thread becomes units',
        body: 'A new id pattern, slack:<channel>-<ts>, routes a thread to labelSlack. The feedback form becomes the first unit, then each reply becomes one unit linked to its own message. A Slack-specific prompt description feeds the screen.',
        diagram: `flowchart LR
  T["Slack thread<br>NormalizedSlackThread"]:::new --> P["parseRawInputId<br>+ slack id pattern"]:::new
  G[Gong transcript] --> P
  P --> LG[labelGong]
  P --> LS["labelSlack<br>form unit, then one per reply"]:::new
  LG --> SC[screen]
  LS --> SC
  D["sourceDescriptions.slack"]:::new -.-> SC
  SC --> S[("Signals<br>source: gong or slack")]`,
      },
      {
        title: 'Review: the shared screening rule is the real risk',
        body: 'Source, NormalizedSlackThread and the two-argument ingestionKeys land in ingestion one PR early; the next PR uses all three, so a line in the PR body settles it. The sentence added to the shared screening rule is the real change: Gong extractions now keep events they used to drop.',
        breaking: ['ingestionKeys(callId) becomes ingestionKeys(source, id)', 'Source moves to ingestion/model.ts', 'Gong keep/drop behavior changes', 'signals.test.ts 1110 → 1370 lines'],
        diagram: `flowchart LR
  subgraph ING["ingestion/model.ts"]
    SRC["Source + sources"]:::new
    NST[NormalizedSlackThread]:::new
    IK["ingestionKeys(source, id)"]:::new
  end
  IK --> NX["IngestSlackThread<br>in the next PR"]
  NST --> NX
  SR["screen rule 2: employee quotes<br>count as customer side"]:::risk --> GK["Gong extractions<br>keep more events"]:::risk
  SR -.-> SD["Slack-only wording in<br>sourceDescriptions.slack"]:::fix`,
      },
    ],
  },
  {
    kicker: '#43',
    url: 'https://github.com/algolia/nexus/pull/43',
    title: 'Ingest a feedback thread from its link',
    verdict: 'Request changes',
    substeps: [
      {
        title: 'A link enters through a new route',
        body: 'POST /ingestions/slack takes only a url. The API checks it points into the configured feedback channel and workspace, then starts one IngestSlackThread workflow per thread.',
        diagram: `flowchart LR
  U["Thread link from<br>support-product-feedback"] --> API["POST /ingestions/slack"]:::new
  API --> V{"feedback channel<br>and workspace?"}:::new
  V -- no --> R["400 not_a_feedback_form"]:::new
  V -- yes --> W["IngestSlackThread<br>one job per thread"]:::new`,
      },
      {
        title: 'The workflow fetches, enriches, completes',
        body: 'prepareSlackThread pages through conversations.replies with the bot token and stores a raw snapshot. Enrichment reads the Salesforce id and account name from the form. storeEnrichment and storeCompletion are now shared with Gong, and completion starts ExtractSignals from step 1.',
        diagram: `flowchart LR
  W[IngestSlackThread]:::new --> PR[prepareSlackThread]:::new
  PR --> SL["Slack conversations.replies<br>paged, bot token"]:::new
  PR --> RAW[(raw snapshot)]
  RAW --> EI["enrichmentInputFromSlack<br>Salesforce id, account name"]:::new
  EI --> SE["storeEnrichment<br>shared with Gong"]
  RAW --> NORM[NormalizedSlackThread]
  SE --> SCm["storeCompletion<br>shared with Gong"]
  NORM --> SCm
  SCm --> EX["ExtractSignals<br>step 1"]`,
      },
      {
        title: 'Review: six error branches and a copied protocol',
        body: 'Six Slack error classes each get their own instanceof branch in the shared failure classifier, and api.ts repeats two outcomes. prepareSlackThread is the same state machine as prepareSource. activities.ts grows from 590 to 826 lines.',
        diagram: `flowchart LR
  subgraph ERR["slack.ts error classes"]
    E1[THREAD_UNAVAILABLE]:::risk
    E2[ACCESS_DENIED]:::risk
    E3[REQUEST_REJECTED]:::risk
    E4["TRANSIENT, retry delay"]:::risk
    E5[RETRY_BUDGET_EXCEEDED]:::risk
    E6["response validation"]:::risk
  end
  E1 & E2 & E3 & E4 & E5 & E6 --> CAF["classifiedActivityFailure<br>+6 instanceof branches"]:::risk
  CAF -.-> ONE["one SlackIngestionError<br>code + retryAfterMs"]:::fix
  PS["prepareSource, Gong"] --- PST["prepareSlackThread, copy"]:::risk
  PST -.-> SP["one shared prepare protocol"]:::fix`,
      },
      {
        title: 'Deploy: Slack config gates Gong too',
        body: 'The ingestion worker needs a Slack bot token at boot, so Gong activities do not start without it. The API Lambda needs two new values with no defaults. Enrichment can now say source slack while its schema version stays 1.',
        breaking: ['SLACK_BOT_TOKEN required by the worker', 'SLACK_FEEDBACK_CHANNEL_ID and SLACK_WORKSPACE_URL required by the API', 'enrichment source widens without a version bump'],
        diagram: `flowchart LR
  subgraph WK[Ingestion worker]
    TOK["SLACK_BOT_TOKEN<br>required at boot"]:::risk --> GW["Gong activities<br>need it too"]:::risk
  end
  subgraph AL[Ingestion API Lambda]
    CH[SLACK_FEEDBACK_CHANNEL_ID]:::risk
    WS[SLACK_WORKSPACE_URL]:::risk
  end
  EN["enrichment source: Source<br>schema version still 1"]:::risk`,
      },
    ],
  },
  {
    kicker: '#45',
    url: 'https://github.com/algolia/nexus/pull/45',
    title: 'CSOS syncs Slack signals to JPD',
    verdict: 'Request changes (minor)',
    substeps: [
      {
        title: 'Before: a Slack Signal is rejected',
        body: 'SyncJpd maps each Signal source to a JPD Source option. Slack had no mapping, so jpdSourceOption threw and the link was marked rejected.',
        diagram: `flowchart LR
  S[("Signal<br>source: slack")] --> IN[CSOS inbound] --> SY[SyncJpd] --> JSO{jpdSourceOption}
  JSO -- gong --> GOP["Source option: Gong"]
  JSO -- slack --> X["JpdUnknownSourceError<br>jpd_rejected_at set"]:::risk`,
      },
      {
        title: 'After: one map entry, Slack reaches JPD',
        body: 'The production change is one entry. Links rejected before stay rejected until jpd-requeue.sql runs. The JPD Source field must list Slack before deploy, or every update returns 400 and retries each run.',
        breaking: ['Slack Signals now write to production JPD', 'JPD Source field needs a Slack option first'],
        diagram: `flowchart LR
  SY[SyncJpd] --> JSO{jpdSourceOption}
  JSO -- gong --> GOP["Source option: Gong"]
  JSO -- slack --> SOP["Source option: Slack"]:::new
  SOP --> ISS["issue + Insight<br>create or update"]
  OLD["links rejected before"]:::risk -.-> RQ[jpd-requeue.sql]:::fix
  CFG["JPD Source field<br>must list Slack"]:::risk -.-> SOP`,
      },
      {
        title: 'Review: the e2e fixture sequence is copied',
        body: 'The e2e producer and its test run the same Gong-then-Slack block, and the script keeps a third copy as a source list. One runFixtureSignals helper in fixture-runtime.ts removes all three. Worth asking for, not blocking on.',
        diagram: `flowchart LR
  subgraph DUP[Same fact, three places]
    EP["e2e-producer.ts<br>Gong + Slack, concat"]:::risk
    EPT["e2e-producer.test.ts<br>same block"]:::risk
    LST["gong, slack check list"]:::risk
  end
  EP & EPT --> FX["runFixtureSignals<br>in fixture-runtime.ts"]:::fix
  LST -. deleted .-> FX`,
      },
    ],
  },
  {
    kicker: '#48',
    url: 'https://github.com/algolia/nexus/pull/48',
    title: 'Break domain ties by account name',
    verdict: 'Request changes',
    substeps: [
      {
        title: 'Before: a shared domain is ambiguous',
        body: 'Enrichment trusts a Salesforce id first, then the email domain. When several accounts share the domain, it gives up: no account, low confidence.',
        diagram: `flowchart LR
  IN[EnrichmentInput] --> ID{"Salesforce id<br>in source?"}
  ID -- yes --> F1["found<br>source-account-id"]
  ID -- no --> DM{"accounts on<br>the domain"}
  DM -- one --> F2["found<br>domain"]
  DM -- several --> AMB["ambiguous<br>no account, low"]`,
      },
      {
        title: 'After: the account name breaks the tie',
        body: 'Slack carries the account name from the form, while Gong passes null. An exact normalized match wins. Otherwise the name is retried with every bracketed part removed, and a unique hit wins too, as domain-and-name at medium confidence.',
        breaking: ['new attribution method domain-and-name', 'some ambiguous Slack threads now return an account', 'EnrichmentInput.accountName is required'],
        diagram: `flowchart LR
  DM{"accounts on<br>the domain"} -- several --> NM{"accountName?<br>Slack form, Gong null"}:::new
  NM -- exact match --> F3["found<br>domain-and-name, medium"]:::new
  NM -- "unique after removing brackets" --> F3
  NM -- no match --> AMB["ambiguous<br>no account, low"]`,
      },
      {
        title: 'Review: removing brackets picks the wrong account',
        body: 'A source named Northwind (US), against Northwind (EMEA) and Northwind, strips to northwind and matches only the plain account, which is wrong. Refuse the stripped match when two candidates share that stem. Slack link cleanup also belongs in slack-input.ts, not the shared finder.',
        diagram: `flowchart LR
  SRC["source name<br>Northwind (US)"] --> ST["remove brackets<br>northwind"]:::risk
  subgraph CAND[Accounts sharing the domain]
    A1["Northwind (EMEA)"]
    A2[Northwind]
  end
  ST --> A2
  A2 --> WR["found, medium<br>wrong account"]:::risk
  ST -.-> FX["two candidates share the stem<br>stay ambiguous"]:::fix
  LU["Slack link cleanup<br>in find-account.ts"]:::risk -.-> SI[slack-input.ts]:::fix`,
      },
    ],
  },
  {
    kicker: '#50',
    url: 'https://github.com/algolia/nexus/pull/50',
    title: 'Account, ARR and idea totals in JPD',
    verdict: 'Request changes',
    substeps: [
      {
        title: 'ARR travels with each Signal',
        body: 'Cortex copies the account ARR into each Signal. CSOS requires it on inbound, stores it on the customer signal, and writes the account and ARR above the quote in new Insights.',
        diagram: `flowchart LR
  SF[Salesforce ARR] --> EN["Cortex enrichment<br>arrUsd"]:::new
  EN --> SG["Signal account.arrUsd<br>signal-v1.json"]:::new
  SG --> IN["CSOS inbound<br>arrUsd required"]:::new
  IN --> CS[("customer_signal<br>account_arr_usd")]:::new
  CS --> INS["Insight text<br>account + ARR above quote"]:::new`,
      },
      {
        title: 'SyncJpd gains a totals phase',
        body: 'After issues and Insights, a third phase computes each idea’s Number of accounts and Combined ARR, counting each account once at its newest signal’s ARR. It writes JPD only when the totals differ from the ones last written.',
        diagram: `flowchart LR
  SY["SyncJpd<br>every minute"] --> I1[issues] --> I2[Insights] --> T[totals]:::new
  T --> IT["ideaTotalsForJpd<br>newest ARR per account"]:::new
  IT --> CMP{"differs from<br>last written?"}:::new
  CMP -- yes --> UPD["updateIdeaTotals<br>accounts, Combined ARR"]:::new
  CMP -- no --> UN[unchanged]
  UPD --> MIG[("idea.jpd_account_count<br>idea.jpd_combined_arr_usd")]:::new`,
      },
      {
        title: 'Review: the totals rule exists three times',
        body: 'The same rule lives in the Postgres query, the memory store and the e2e expectation, which copies the production algorithm. One pure function with literal e2e numbers fixes it. Postgres still has to find which ideas are stale.',
        diagram: `flowchart LR
  RULE["one row per account<br>newest signal, round sum"]
  RULE --> PG["pg.ts ideaTotals SQL"]:::risk
  RULE --> MEM["memory.ts totalsOf"]:::risk
  RULE --> E2E["scenarios.ts<br>e2e expectation"]:::risk
  PG & MEM & E2E -.-> FX["one pure ideaTotals<br>+ literal e2e numbers"]:::fix
  PG -.-> KEEP["SQL still finds<br>stale ideas"]`,
      },
      {
        title: 'Deploy: queued messages and live config',
        body: 'Signals queued by the old Cortex build lack arrUsd and would go to the dead-letter queue. Align the two parsers or drain the queue before deploying CSOS. Live JPD needs two new field ids, and SyncJpd needs a new build id.',
        breaking: ['old queued Signals go to the DLQ', 'two JPD field ids required in live mode', 'SyncJpd returns totals; new build id'],
        diagram: `flowchart LR
  OLD["Signals queued by<br>old Cortex, no arrUsd"]:::risk --> DLQ["CSOS rejects<br>dead-letter queue"]:::risk
  DLQ -.-> FQ["align parsers<br>or drain first"]:::fix
  ENV["JPD_ACCOUNT_COUNT_FIELD_ID<br>JPD_COMBINED_ARR_FIELD_ID"]:::risk --> LIVE["live JPD sync fails<br>without them"]:::risk
  HIST["SyncJpd result adds totals"]:::risk --> BID["new build id, PINNED"]`,
      },
    ],
  },
],
};
