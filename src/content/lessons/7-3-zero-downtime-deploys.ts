import type { DiagramSpec, Lesson } from '../types';

/** Two full fleets and one switch: a release, then a rollback. */
const blueGreen: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'blue', type: 'service', label: 'Blue fleet', sublabel: 'v41', x: 2, y: 0 },
    { id: 'green', type: 'service', label: 'Green fleet', sublabel: 'v42', x: 2, y: 2 },
    { id: 'db', type: 'sqlDb', label: 'Posts database', x: 3, y: 1 },
  ],
  edges: [
    { id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' },
    { id: 'lb-blue', from: 'lb', to: 'blue', kind: 'sync' },
    { id: 'lb-green', from: 'lb', to: 'green', kind: 'sync' },
    { id: 'blue-db', from: 'blue', to: 'db', kind: 'sync' },
    { id: 'green-db', from: 'green', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'The **blue fleet** runs v41 and serves everyone. The **green fleet**, a full copy, now runs v42 and is tested with no users on it.',
      flow: ['users-lb', 'lb-blue', 'blue-db'],
      notes: [{ target: 'blue', text: 'live', tone: 'signal' }],
    },
    {
      caption: 'The switch: the **load balancer** sends every new request to green. Blue keeps running, untouched.',
      flow: ['users-lb', 'lb-green', 'green-db'],
      notes: [{ target: 'green', text: 'live', tone: 'signal' }],
    },
    {
      caption: 'If v42 misbehaves, switching back to blue takes seconds. Both fleets share one database, so its schema must work for both versions.',
      flow: ['users-lb', 'lb-blue', 'blue-db'],
      notes: [{ target: 'blue', text: 'live again', tone: 'signal' }],
    },
  ],
};

/** A canary taking 1%, 10%, 50% and then all of the traffic. */
const canary: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'old', type: 'service', label: 'Feed v41', sublabel: 'current', x: 2, y: 0 },
    { id: 'new', type: 'service', label: 'Feed v42', sublabel: 'canary', x: 2, y: 2 },
    { id: 'metrics', type: 'nosqlDb', label: 'Metrics', sublabel: 'compared', x: 3, y: 1 },
  ],
  edges: [
    { id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' },
    { id: 'lb-old', from: 'lb', to: 'old', kind: 'sync' },
    { id: 'lb-new', from: 'lb', to: 'new', kind: 'sync' },
    { id: 'old-metrics', from: 'old', to: 'metrics', kind: 'async' },
    { id: 'new-metrics', from: 'new', to: 'metrics', kind: 'async' },
  ],
  steps: [
    {
      caption: 'Version 42 of the feed service is deployed to a few new servers. They get no traffic yet, and v41 still serves everyone.',
      flow: ['users-lb', 'lb-old'],
      notes: [{ target: 'lb-old', text: '100%' }],
    },
    {
      caption: 'The load balancer sends 1% of requests to v42. Both versions report errors and latency, and the canary is compared with v41 over the same minutes.',
      flow: ['users-lb', ['lb-old', 'lb-new'], ['old-metrics', 'new-metrics']],
      notes: [
        { target: 'lb-old', text: '99%' },
        { target: 'lb-new', text: '1%', tone: 'signal' },
      ],
    },
    {
      caption: 'After a while with no difference, the share grows to 10%. More traffic makes rarer problems visible.',
      flow: ['users-lb', ['lb-old', 'lb-new']],
      notes: [
        { target: 'lb-old', text: '90%' },
        { target: 'lb-new', text: '10%', tone: 'signal' },
      ],
    },
    {
      caption: 'Then 50%. Had the canary’s errors climbed at any step, traffic would have moved back to v41 within seconds.',
      flow: ['users-lb', ['lb-old', 'lb-new']],
      notes: [
        { target: 'lb-old', text: '50%' },
        { target: 'lb-new', text: '50%', tone: 'signal' },
      ],
    },
    {
      caption: 'With no difference at 50%, v42 takes all the traffic. The v41 servers stay around for a fast rollback, then are retired.',
      flow: ['users-lb', 'lb-new'],
      notes: [{ target: 'lb-new', text: '100%', tone: 'signal' }],
    },
  ],
};

const lesson: Lesson = {
  id: 'zero-downtime-deploys',
  module: 'm7',
  order: 3,
  title: 'Deploying without downtime',
  idea: 'You can ship new code many times a day without users noticing by replacing servers gradually behind the load balancer, trying each release on a small share of traffic first, separating releasing a feature from deploying its code, and changing databases in backward-compatible steps.',
  minutes: 13,
  prerequisites: ['load-balancers', 'monolith-vs-microservices'],
  outcomes: [
    'Compare rolling, blue-green and canary releases, and pick one for a given service.',
    'Use feature flags to separate deploying code from releasing a feature.',
    'Change a database schema without downtime using expand-and-contract migrations.',
  ],
  analogy: {
    title: 'The new dish',
    body: 'A chef with a new recipe does not reprint the menu and serve it to the whole dining room on a Friday night. She sends a plate to one table of regulars, watches their faces and asks what they think. If they love it, a few more tables get it the next night, and only then does it go on the menu.\n\nIf the first table sends it back, almost nobody noticed, and the old dish is still in the kitchen. Shipping software safely works the same way: try the new version on a few users, watch closely, and keep the old version ready.',
  },
  whyItMatters:
    'Snapgram’s engineers now ship changes dozens of times a day. Last Tuesday, a new version of the feed service went out to every server at once. It had a bug that only appeared under real traffic, and within a minute every feed load was failing.\n\nRolling back took 20 minutes, because the old version had to be rebuilt and redeployed to hundreds of servers, and every user saw an empty feed the whole time. The team wants the next bad release to reach a handful of users, be caught in minutes and be undone in seconds. Two risky changes are waiting: shared albums, and renaming a column in the posts table.',
  body: [
    {
      kind: 'prose',
      md: 'A [[deploy|deploy]] replaces running code with new code. Done everywhere at once, it has two problems: requests fail while servers restart, and a bad release reaches every user before anyone notices. The techniques below fix one or both, and teams usually combine them.',
    },
    { kind: 'heading', text: 'Rolling deployments' },
    {
      kind: 'prose',
      md: 'A [[rolling deployment|rolling-deployment]] replaces servers a few at a time. The [[load balancer|load-balancer]] stops sending new requests to one batch and lets the requests in progress finish, which is [[connection draining|connection-draining]]. The batch restarts on the new version, rejoins the pool once its [[health checks|health-check]] pass, and the next batch begins.',
    },
    {
      kind: 'prose',
      md: 'It needs no spare servers, which is why most deploy tools do it by default. But for the length of the rollout, old and new versions serve traffic side by side, so they must agree on the same data and the same application programming interfaces (APIs). And undoing a bad version means rolling back through every batch, which takes as long as rolling forward.',
    },
    { kind: 'heading', text: 'Blue-green deployments' },
    {
      kind: 'prose',
      md: 'A [[blue-green deployment|blue-green-deployment]] keeps two complete fleets. Blue runs the current version and takes all traffic, while green gets the new version and is tested with no users on it. Then the load balancer switches all traffic to green at once, and blue stays running, so a [[rollback|release-rollback]] is the same switch in reverse, done in seconds.',
    },
    {
      kind: 'diagram',
      title: 'A blue-green release',
      caption: 'Two full fleets and one switch. Step through a release and a rollback.',
      spec: blueGreen,
    },
    {
      kind: 'prose',
      md: 'The price is double the servers during the switch, and every user moves at once, so a bug that slipped through testing still reaches everyone. Martin Fowler also points out the catch with data: both fleets share the database, so schema changes must be deployed separately, in a form both versions can use.',
    },
    { kind: 'heading', text: 'Canary releases' },
    {
      kind: 'prose',
      md: 'A [[canary release|canary-release]] sends a small share of real traffic to the new version first and compares it with the old one. If its error rate and [[p99 latency|tail-latency]] match, the share grows step by step; if they get worse, traffic moves back and only a sliver of users ever saw the bug. That keeps the [[blast radius|blast-radius]] of every release small.',
    },
    {
      kind: 'diagram',
      title: 'Shifting traffic to a canary',
      caption: 'Traffic moves to the new version in steps, and each step is judged against the old version.',
      spec: canary,
    },
    {
      kind: 'prose',
      md: 'Canaries work best when the comparison is automatic. People watching dashboards are slow and hopeful; a script that compares the canary with the old version and rolls back on its own is neither.',
    },
    { kind: 'heading', text: 'Feature flags: deploying is not releasing' },
    {
      kind: 'prose',
      md: 'A [[feature flag|feature-flag]] is a switch, read at runtime from a configuration service, that turns a code path on or off for chosen users. Shared albums ship to production weeks early, switched off, while the team keeps merging small changes. Then the flag turns on for employees, then for 1% of users, then for everyone, and if something breaks, turning it off takes seconds and needs no deploy.',
    },
    {
      kind: 'code',
      code: "if (flags.isOn('shared-albums', user)) {\n  showSharedAlbumsTab();\n}",
      caption: 'The flag service decides per user, so the same build shows shared albums to employees and hides them from everyone else.',
    },
    {
      kind: 'prose',
      md: 'Flags separate deploying code from releasing a feature. The cost is clutter: every flag is a branch in the code, and old ones pile up, so remove each flag once its feature is fully out.',
    },
    { kind: 'heading', text: 'Changing the database: expand and contract' },
    {
      kind: 'prose',
      md: 'Code can run two versions at once, but a database has one [[schema|schema]]. During any rollout, old and new code read and write the same tables, so every [[schema migration|schema-migration]] must work for both. Renaming a column in one step breaks whichever version expects the other name. [[Expand and contract|expand-and-contract]], also called parallel change, does it in [[backward-compatible|backward-compatibility]] steps instead.',
    },
    {
      kind: 'annotated',
      title: 'Renaming posts.text to posts.caption',
      caption: 'Each line is a separate deploy. At every step both the current and the previous code work, so any step can be rolled back.',
      lines: [
        { code: 'ALTER TABLE posts ADD COLUMN caption TEXT;', note: 'Expand: add the new column. Old code ignores it, so nothing breaks.' },
        { code: 'v42: write text and caption, read text', note: 'Deploy code that writes both columns on every change but still reads the old one.' },
        {
          code: 'UPDATE posts SET caption = text WHERE caption IS NULL;',
          note: '[[Backfill|backfill]] the existing rows a few thousand at a time, so the table is never locked for long.',
        },
        { code: 'v43: read caption, still write both', note: 'Switch reads to the new column. Rolling back to v42 stays safe, because both columns are still kept up to date.' },
        { code: 'v44: write only caption', note: 'Stop writing the old column once nobody will roll back past v43.' },
        { code: 'ALTER TABLE posts DROP COLUMN text;', note: 'Contract: drop the old column, days or weeks later.' },
      ],
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real pipelines add more: automated tests before anything ships, deploys that move one region at a time, and reviews of migrations that could lock a big table. Mobile apps are harder still, because old app versions stay installed for months, so servers must keep supporting old clients long after a deploy.',
    },
  ],
  tradeoffs: {
    caption: 'Release strategies, compared.',
    rows: [
      {
        option: 'Rolling deployment',
        goodAt: 'No spare servers, and built into most deploy tools.',
        badAt: 'Old and new versions run side by side, a bad version eventually reaches everyone, and rollback is another full rollout.',
        pickWhen: 'The default for stateless services with good health checks.',
      },
      {
        option: 'Blue-green deployment',
        goodAt: 'One instant switch to release and one to roll back, with the new version tested in production first.',
        badAt: 'Double the servers during the switch, and every user moves at once.',
        pickWhen: 'You need fast, all-or-nothing rollback, such as for a monolith or a risky release.',
      },
      {
        option: 'Canary release',
        goodAt: 'A bad release reaches only a small share of users, and decisions come from real traffic.',
        badAt: 'Needs traffic splitting, good metrics and automation, and takes longer to finish.',
        pickWhen: 'Busy services where a bad deploy is costly.',
      },
      {
        option: 'Feature flags',
        goodAt: 'Release, target and switch off features without deploying.',
        badAt: 'Flag clutter, untested combinations, and code for both paths in every build.',
        pickWhen: 'Large features, gradual launches, and kill switches for risky code paths.',
      },
    ],
  },
  realWorld: {
    title: 'Canary releases at Facebook and IMVU',
    body: 'Danilo Sato’s article on canary releases, published on Martin Fowler’s website in 2014, describes the technique and how companies use it. It notes that Facebook uses several canaries, the first visible only to its own employees and with all feature flags turned on, so problems with new features show up early. It also credits IMVU with a “cluster immune system” that watches business metrics during a rollout and rolls back automatically when they get significantly worse.\n\nThe article is frank about the costs: you must manage several versions at once, and the database must support all of them during the rollout, for which it recommends parallel change, the expand-and-contract pattern from this lesson.',
    sourceUrl: 'https://martinfowler.com/bliki/CanaryRelease.html',
    sourceLabel: 'Danilo Sato, “CanaryRelease,” martinfowler.com (2014)',
  },
  interview: {
    whenToMention:
      'When the interviewer asks how you would ship changes safely, or once your design has many services behind load balancers. Raise it too whenever your design changes a schema or a message format, because that is where deploys without downtime usually break.',
    sayItLikeThis: [
      'Deploys roll through the fleet in batches behind the load balancer, with connection draining, so no request is dropped.',
      'Risky changes go out as a canary: 1% of traffic, compared automatically with the old version on errors and p99 latency, then 10%, 50% and 100%.',
      'Big features ship dark behind a feature flag, and schema changes use expand and contract, so every step stays backward compatible and can be rolled back.',
    ],
    followUps: [
      {
        q: 'How would you rename a column in a big, busy table without downtime?',
        a: 'Expand and contract. Add the new column, deploy code that writes both, backfill old rows in small batches, switch reads, stop writing the old column, and finally drop it. At every step the current and previous code both work, so any step can be rolled back.',
      },
      {
        q: 'Blue-green or canary?',
        a: 'Blue-green gives an instant switch and an instant rollback, but moves every user at once and doubles the servers during the switch. A canary exposes a small slice first and decides from real metrics, at the cost of tooling and time. For a busy service I’d use a canary and keep the old version running, so rollback is a traffic shift, not a rebuild.',
      },
      {
        q: 'How do you decide whether a canary is healthy?',
        a: 'Compare it with the old version over the same minutes, not with yesterday: error rate, p99 latency, saturation, and a business metric such as feed loads per user. Set the thresholds in advance and let automation roll back when they are crossed.',
      },
    ],
    redFlags: [
      'Deploying to every server at once and planning to fix problems by redeploying.',
      'Changing a schema in the same step as the code that needs it, with no plan for the old version that is still running.',
      'Treating feature flags as permanent settings that are never removed.',
    ],
  },
  mistakes: [
    '**Big-bang deploys.** Updating every server at once lets a bad release reach every user before anyone can react.',
    '**Breaking changes mid-rollout.** Old and new versions run together for minutes or hours, so a change that only the new version understands breaks the old one.',
    '**Rollback by rebuild.** If going back means building and deploying the old version again, every incident lasts at least that long.',
    '**Canaries nobody compares.** A canary helps only if its metrics are checked against the old version and something acts on the difference.',
    '**Flags that never die.** Old flags pile up as dead branches and untested combinations, until switching one breaks something.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Snapgram wants to undo a feed release within seconds at any point, and can afford double the servers for an hour. Which strategy fits best?',
      options: [
        { text: 'Blue-green deployment', correct: true, why: 'The old fleet keeps running, so rolling back is a single traffic switch.' },
        { text: 'Rolling deployment', correct: false, why: 'Undoing it means another rollout through every batch, which takes as long as the first.' },
        { text: 'Redeploying the old version to every server', correct: false, why: 'That is the 20-minute rebuild from the story.' },
        { text: 'One feature flag around the whole service', correct: false, why: 'Flags switch features inside the code; they cannot undo a bad build of the service itself.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these are true of feature flags?',
      options: [
        { text: 'They let code reach production before users can see the feature', correct: true, why: 'Deploying and releasing become separate steps.' },
        { text: 'They let you switch a feature off without a deploy', correct: true, why: 'Turning the flag off takes effect in seconds.' },
        { text: 'They remove the need to test new code', correct: false, why: 'Flagged code still runs for someone, and every combination of flags is another path to test.' },
        {
          text: 'They cost nothing to leave in the code forever',
          correct: false,
          why: 'Each flag is a branch that adds complexity, so remove flags once their features are fully out.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of renaming a column with expand and contract in order.',
      items: [
        'Add the new column',
        'Deploy code that writes both columns',
        'Backfill the new column for existing rows',
        'Switch reads to the new column',
        'Stop writing the old column',
        'Drop the old column',
      ],
      why: 'Each step keeps both the current and the previous version of the code working, so any step can be rolled back.',
    },
    {
      kind: 'numeric',
      prompt:
        'Snapgram serves about 40,000 feed requests per second. A buggy canary takes 1% of traffic and fails every request it gets, and automation rolls it back after 5 minutes. About how many feed requests fail?',
      answer: 120000,
      unit: 'requests',
      tolerance: 1.1,
      solution: [
        '1% of 40,000 = 400 requests per second reach the canary.',
        '5 minutes is 300 seconds.',
        '400 × 300 = 120,000 failed requests, against 40,000 × 300 = 12 million if the bad version had gone to everyone at once.',
      ],
    },
    {
      kind: 'single',
      prompt: 'During a rolling deploy, v41 and v42 serve traffic together, and v42’s release renames a column in the same step. What happens?',
      options: [
        {
          text: 'v41 servers fail whenever they use the old column name',
          correct: true,
          why: 'The old code still runs for the rest of the rollout, and the column it expects is gone.',
        },
        {
          text: 'Nothing: the load balancer sends each user to the right version',
          correct: false,
          why: 'The balancer knows nothing about columns, and any request can reach either version.',
        },
        { text: 'The database keeps both names automatically', correct: false, why: 'A rename replaces the name; nothing keeps the old one working.' },
        { text: 'Only new users are affected', correct: false, why: 'Every request that reaches an old server can fail, whoever sent it.' },
      ],
    },
  ],
  takeaways: [
    'Replace servers gradually behind the load balancer, with health checks and connection draining, so a deploy never drops requests.',
    'Try each release on a small share of traffic first, compare it with the old version, and keep rollback a quick traffic switch rather than a rebuild.',
    'Separate deploying from releasing with feature flags, and change schemas with expand and contract so old and new code always work together.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Data does not roll back.** Code can return to an old version in seconds, but data written by new code may be in a shape the old code cannot read. That is why every migration step must stay readable by the previous version, and why destructive steps such as dropping a column come last.',
    },
    {
      kind: 'prose',
      md: '**Shadow traffic.** Some teams copy a share of real requests to the new version and throw its answers away, comparing them with the old version’s answers before any user sees the new one. It suits reads only, since copied writes would happen twice.',
    },
    {
      kind: 'prose',
      md: '**Further reading.** Martin Fowler’s [BlueGreenDeployment](https://martinfowler.com/bliki/BlueGreenDeployment.html) explains the switch and why schema changes should be deployed apart from application upgrades. Danilo Sato’s [ParallelChange](https://martinfowler.com/bliki/ParallelChange.html) describes the expand, migrate and contract phases.',
    },
  ],
  flashcards: [
    {
      front: 'What is a rolling deployment?',
      back: 'Replacing servers with the new version a few at a time behind the load balancer, so most of them keep serving throughout.',
    },
    { front: 'What makes blue-green deployment attractive?', back: 'Releasing and rolling back are each one instant traffic switch, because the old fleet keeps running.' },
    {
      front: 'What is a canary release?',
      back: 'Sending a small share of traffic to the new version, comparing it with the old one, and widening step by step or rolling back.',
    },
    {
      front: 'What does a feature flag separate?',
      back: 'Deploying code from releasing a feature: code ships switched off and is turned on, or off again, without a deploy.',
    },
    { front: 'What are the steps of expand and contract?', back: 'Add the new form, write both, backfill, switch reads, stop writing the old form, then remove it.' },
    {
      front: 'Why must every deploy step be backward compatible?',
      back: 'Old and new versions run at the same time during a rollout, and either one may need to be rolled back.',
    },
  ],
  related: ['load-balancers', 'monolith-vs-microservices', 'observability', 'databases-101', 'api-styles', 'multi-region-dr'],
  glossaryTerms: [
    'deploy',
    'rolling-deployment',
    'load-balancer',
    'connection-draining',
    'health-check',
    'blue-green-deployment',
    'release-rollback',
    'canary-release',
    'tail-latency',
    'blast-radius',
    'feature-flag',
    'schema',
    'schema-migration',
    'expand-and-contract',
    'backward-compatibility',
    'backfill',
  ],
};

export default lesson;
