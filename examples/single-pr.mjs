// Single-PR example: steps are areas of one change, substeps go before → after → review.
// Diffs come from a saved `gh pr diff 48 > 48.diff`; notes anchor to new-side lines of that patch.
export default {
  slug: 'nexus-48-account-name-tiebreak',
  title: 'Break domain ties by account name',
  subtitle: 'algolia/nexus #48 · Enrichment, when one email domain matches several accounts',
  url: 'https://github.com/algolia/nexus/pull/48',
  steps: [
    {
      kicker: 'Lookup',
      url: 'https://github.com/algolia/nexus/pull/48',
      title: 'How Enrichment picks an account',
      verdict: 'Request changes',
      substeps: [
        {
          title: 'Before: a shared domain is ambiguous',
          body: 'Enrichment trusts a Salesforce id first, then the email domain. When several accounts share the domain, it returns no account at low confidence.',
          diagram: `flowchart LR
  IN[EnrichmentInput] --> ID{"Salesforce id<br>in source?"}
  ID -- yes --> F1["found<br>source-account-id"]
  ID -- no --> DM{"accounts on<br>the domain"}
  DM -- one --> F2["found<br>domain"]
  DM -- several --> AMB["ambiguous<br>no account, low"]`,
        },
        {
          title: 'After: the account name breaks the tie',
          body: 'An exact normalized name match wins. Otherwise the name is retried with bracketed parts removed, and a unique hit also wins, as domain-and-name at medium confidence.',
          breaking: ['new attribution method domain-and-name'],
          diagram: `flowchart LR
  DM{"accounts on<br>the domain"} -- several --> NM{"accountName?"}:::new
  NM -- exact match --> F3["found<br>domain-and-name, medium"]:::new
  NM -- "unique after removing brackets" --> F3
  NM -- no match --> AMB["ambiguous<br>no account, low"]`,
          files: [
            { path: 'apps/cortex/src/enrichment/find-account.ts', diff: './48.diff', lines: [248, 256] },
            { path: 'apps/cortex/src/enrichment/model.ts', diff: './48.diff' },
          ],
          notes: [
            {
              kind: 'explain',
              path: 'apps/cortex/src/enrichment/find-account.ts',
              line: 251,
              end: 254,
              node: 'NM',
              body: 'Only an ambiguous domain match consults the name. Every other outcome returns exactly as before.',
            },
            {
              kind: 'explain',
              path: 'apps/cortex/src/enrichment/model.ts',
              line: 43,
              node: 'F3',
              body: 'domain-and-name ranks medium, beside email and above a bare domain match.',
            },
          ],
        },
      ],
    },
    {
      kicker: 'Inputs',
      url: 'https://github.com/algolia/nexus/pull/48/files',
      title: 'Where the name comes from',
      substeps: [
        {
          title: 'Each source fills accountName',
          body: 'EnrichmentInput gains a required accountName. Slack reads it from the feedback form; Gong passes null, so Gong behavior is unchanged.',
          breaking: ['EnrichmentInput.accountName is required'],
          diagram: `flowchart LR
  SL["slack-input.ts<br>form account name"]:::new --> EI["EnrichmentInput<br>+ accountName"]:::new
  GG["gong-input.ts<br>null"]:::new --> EI
  EI --> FA[findAccount]`,
          files: [
            { path: 'apps/cortex/src/enrichment/slack-input.ts', diff: './48.diff' },
            { path: 'apps/cortex/src/enrichment/gong-input.ts', diff: './48.diff' },
          ],
          notes: [
            {
              kind: 'explain',
              path: 'apps/cortex/src/enrichment/slack-input.ts',
              line: 24,
              node: 'SL',
              body: 'The raw form value goes in as typed, Slack link markup included.',
            },
          ],
          questions: [
            {
              ask: 'Should Gong pass the CRM account name it already has, instead of null?',
              path: 'apps/cortex/src/enrichment/gong-input.ts',
              line: 20,
            },
          ],
        },
      ],
    },
    {
      kicker: 'Review',
      title: 'Findings',
      verdict: 'Request changes',
      substeps: [
        {
          title: 'Removing brackets picks the wrong account',
          body: 'Northwind (US) against Northwind (EMEA) and Northwind strips to northwind and attaches the plain account. Refuse the stripped match when two candidates share the stem, and move the Slack link cleanup into slack-input.ts.',
          diagram: `flowchart LR
  SRC["source name<br>Northwind (US)"] --> ST["remove brackets<br>northwind"]:::risk
  subgraph CAND[Accounts sharing the domain]
    A1["Northwind (EMEA)"]
    A2[Northwind]
  end
  ST --> A2
  A2 --> WR["found, medium<br>wrong account"]:::risk
  ST -.-> FX["shared stem<br>stay ambiguous"]:::fix
  LU["Slack link cleanup<br>in find-account.ts"]:::risk -.-> SI[slack-input.ts]:::fix`,
          files: [{ path: 'apps/cortex/src/enrichment/find-account.ts', diff: './48.diff', lines: [111, 146] }],
          notes: [
            {
              kind: 'check',
              path: 'apps/cortex/src/enrichment/find-account.ts',
              line: 135,
              end: 140,
              node: 'ST',
              body: 'The second pass compares the stripped name against unstripped candidate names.',
              concern: 'Northwind (EMEA) never strips, so the plain Northwind is the unique hit and wins at medium confidence.',
            },
            {
              kind: 'check',
              path: 'apps/cortex/src/enrichment/find-account.ts',
              line: 133,
              node: 'LU',
              body: 'linkUrl strips Slack link markup inside the domain-agnostic matcher.',
              concern: 'Source-specific cleanup leaks into findAccount; it belongs in slack-input.ts.',
            },
          ],
          questions: [
            {
              ask: 'Is a stripped-name match ever safe when another candidate shares the stem?',
              context: 'If not, the second pass should compare stripped against stripped and stay ambiguous on a tie.',
              path: 'apps/cortex/src/enrichment/find-account.ts',
              line: 140,
            },
            'Do the tests cover two accounts that differ only by a bracketed region?',
          ],
        },
      ],
    },
  ],
};
