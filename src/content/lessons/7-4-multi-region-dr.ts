import type { DiagramSpec, Lesson } from '../types';

/** The main step-through: Oregon fails, GeoDNS moves its users to Singapore, and Oregon later catches up. */
const failover: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', sublabel: 'in the Americas', x: 0, y: 1 },
    { id: 'dns', type: 'dns', label: 'GeoDNS', x: 1, y: 1 },
    { id: 'orApp', type: 'service', label: 'Oregon app', x: 2, y: 0 },
    { id: 'orDb', type: 'sqlDb', label: 'Oregon database', sublabel: 'leader', x: 3, y: 0 },
    { id: 'sgApp', type: 'service', label: 'Singapore app', x: 2, y: 2 },
    { id: 'sgDb', type: 'sqlDb', label: 'Singapore database', sublabel: 'follower', x: 3, y: 2 },
  ],
  edges: [
    { id: 'users-dns', from: 'users', to: 'dns', kind: 'sync' },
    { id: 'users-or', from: 'users', to: 'orApp', kind: 'sync' },
    { id: 'or-ordb', from: 'orApp', to: 'orDb', kind: 'sync' },
    { id: 'ordb-sgdb', from: 'orDb', to: 'sgDb', kind: 'replication' },
    { id: 'sg-sgdb', from: 'sgApp', to: 'sgDb', kind: 'sync' },
    { id: 'dns-or', from: 'dns', to: 'orApp', kind: 'async' },
    { id: 'users-sg', from: 'users', to: 'sgApp', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'On a normal day, [[GeoDNS|geodns]], a Domain Name System (DNS) service that answers by location, sends users in the Americas to the **Oregon app**. Their writes land in the **Oregon database**, and [[asynchronous replication|asynchronous-replication]] copies them to Singapore about a second later (ballpark).',
      flow: ['users-dns', '<users-dns', 'users-or', 'or-ordb', 'ordb-sgdb'],
      notes: [{ target: 'ordb-sgdb', text: '≈ 1 s behind' }],
    },
    {
      caption:
        'A fault takes the whole Oregon region offline. Requests from the Americas now fail, and the last second or so of writes, which had not yet crossed the Pacific, is stuck in Oregon: that is the data you lose.',
      fail: ['orApp', 'orDb'],
      flow: ['users-dns', '<users-dns', { edge: 'users-or', tag: 'fails', tone: 'alert' }],
      notes: [{ target: 'ordb-sgdb', text: 'last 1 s missing', tone: 'alert' }],
    },
    {
      caption:
        'GeoDNS [[health checks|health-check]] get no reply from Oregon, so it starts answering with Singapore’s address instead: [[DNS failover|dns-failover]]. Phones that cached the old answer keep trying Oregon until its [[TTL (time to live)|ttl]] runs out, so failover records use short TTLs, such as 60 seconds.',
      fail: ['orApp', 'orDb'],
      add: ['dns-or'],
      flow: [{ edge: 'dns-or', tag: 'no reply', tone: 'alert' }],
      notes: [{ target: 'dns', text: 'answers Singapore', tone: 'signal' }],
    },
    {
      caption:
        'The **Singapore database** is promoted from follower to leader, so it can accept the writes Oregon used to take, and traffic flows again. This switch is the [[failover|failover]]; the time from the fault until now is your real recovery time.',
      fail: ['orApp', 'orDb'],
      add: ['users-sg'],
      flow: ['users-dns', '<users-dns', 'users-sg', 'sg-sgdb'],
      notes: [{ target: 'sgDb', text: 'now leader', tone: 'signal' }],
    },
    {
      caption:
        'Singapore now serves everyone, about 150 to 200 ms farther from users in the Americas (ballpark). It copes only if it has the [[headroom|headroom]] for roughly twice its usual traffic, or can add servers fast.',
      fail: ['orApp', 'orDb'],
      flow: ['users-sg', 'sg-sgdb'],
      notes: [{ target: 'sgApp', text: '≈ 2× usual load', tone: 'alert' }],
    },
    {
      caption:
        'Oregon comes back. It first catches up on everything written in Singapore while it was down, and only then does the team move users back, on purpose and at a quiet hour.',
      flow: ['<ordb-sgdb'],
      notes: [{ target: 'orDb', text: 'catching up' }],
    },
  ],
};

/** Replication copies a bad delete everywhere; a point-in-time restore from backups undoes it. */
const backups: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'app', type: 'service', label: 'App servers', x: 0, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Oregon database', x: 1, y: 0 },
    { id: 'replica', type: 'sqlDb', label: 'Singapore copy', x: 2, y: 0 },
    { id: 'vault', type: 'objectStore', label: 'Backups', sublabel: 'separate account', x: 1, y: 1 },
    { id: 'restored', type: 'sqlDb', label: 'Restored copy', x: 2, y: 1 },
  ],
  edges: [
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
    { id: 'db-replica', from: 'db', to: 'replica', kind: 'replication' },
    { id: 'db-vault', from: 'db', to: 'vault', kind: 'async', label: 'snapshots' },
    { id: 'vault-restored', from: 'vault', to: 'restored', kind: 'async', label: 'restore' },
  ],
  steps: [
    {
      caption:
        'Every night the **Oregon database** copies a full snapshot to **Backups**, kept in another region under a separate account. Every few minutes it also ships its log of changes, so the backups can rebuild the data as of almost any moment.',
      flow: ['db-vault'],
      notes: [{ target: 'vault', text: 'nightly + log' }],
    },
    {
      caption:
        'A deploy runs a faulty migration that deletes half of the comments. Replication does its job perfectly and copies the delete to the **Singapore copy** within a second.',
      flow: [{ edge: 'app-db', tag: 'bad delete', tone: 'alert' }, 'db-replica'],
      notes: [{ target: 'replica', text: 'deleted too', tone: 'alert' }],
    },
    {
      caption:
        'The team restores last night’s snapshot into a new database and replays the log up to one minute before the migration: [[point-in-time recovery|point-in-time-recovery]]. Only that last minute of comments is lost.',
      flow: ['vault-restored'],
      notes: [{ target: 'restored', text: '1 min before', tone: 'signal' }],
    },
  ],
};

const lesson: Lesson = {
  id: 'multi-region-dr',
  module: 'm7',
  order: 4,
  title: 'Multi-region and disaster recovery',
  idea: 'Disaster recovery means deciding in advance how much data you can lose and how long you can be down when a whole region fails, then paying for the backups, replicas and second region that meet those targets.',
  minutes: 15,
  prerequisites: ['replication', 'cap-pacelc'],
  outcomes: [
    'Set a recovery point objective (RPO) and a recovery time objective (RTO) for each kind of data, and explain what each one costs.',
    'Choose between backup and restore, pilot light, warm standby and active-active, and walk through a regional failover.',
    'Explain why replication is not a backup, why restores must be tested, and how data residency limits where data can live and fail over.',
  ],
  analogy: {
    title: 'A spare key at a friend’s house',
    body: 'You keep a spare house key at a friend’s place across town. Lose your keys and you are not locked out for good; you lose the half hour it takes to get there. Keeping it across town, not under the doormat, means one burglar or one fire cannot take both.\n\nThe spare only helps if it still fits. Change the locks and forget to update your friend’s copy, and you find out on the worst possible night. A second region is that friend’s house: you choose how far away it is and how quickly you can get to it, and now and then you check that the key still turns.',
  },
  whyItMatters:
    'Snapgram has about 100 million daily users. Most of it still runs in the Oregon [[region|region]], while the Singapore region from [an earlier lesson](lesson:cap-pacelc) serves users in Asia and keeps a copy of the databases through [[replication|replication]].\n\nOne Tuesday morning, a network fault inside the cloud provider takes most of Oregon offline for six hours. Snapgram’s servers are spread across three [[availability zones|availability-zone]], but this fault hits all of them at once: a [[correlated failure|correlated-failure]]. Singapore is healthy, yet nobody has ever tried running all of Snapgram from it, and nobody knows how many likes, comments and payments were written in Oregon’s last seconds and never copied.\n\nThe same week, a network of European schools asks to use Snapgram, on one condition: its students’ photos must stay in Europe.',
  body: [
    {
      kind: 'prose',
      md: 'Most failures are small: a disk, a server, one data center. A whole region failing is rare, but power, networking, a bad configuration change or a natural disaster can take out every data center in an area at once, and spreading across availability zones does not help then. [[Disaster recovery|disaster-recovery]] (DR) is the plan for that bigger loss: where a second copy of your system lives, how current it is, and how you switch to it.',
    },
    { kind: 'heading', text: 'Two numbers to agree on first' },
    {
      kind: 'prose',
      md: 'Every DR plan starts with two targets, set for each kind of data before any technology is chosen:\n\n- The [[recovery point objective|recovery-point-objective]] (RPO) is how much recent data you can afford to lose, measured in time. An RPO of one minute means a disaster may wipe out at most the last minute of writes.\n- The [[recovery time objective|recovery-time-objective]] (RTO) is how long you can be down. An RTO of 15 minutes means users must be served again within 15 minutes of the failure.',
    },
    {
      kind: 'prose',
      md: 'Smaller numbers cost more. An RPO of zero needs [[synchronous replication|synchronous-replication]] to a second region, which adds a cross-ocean round trip to every write: the PACELC trade-off between latency and consistency. A short RTO needs a second region that is already running and big enough to take the load. So Snapgram sets targets per feature, not one number for everything.',
    },
    {
      kind: 'table',
      columns: ['Data', 'RPO', 'RTO', 'Why'],
      rows: [
        ['Boost credits and payments', 'Zero', '15 minutes', 'A lost payment is never acceptable.'],
        ['Photos, posts and comments', 'About a minute', '15 minutes', 'A few lost seconds hurt less than hours offline.'],
        ['Likes and view counts', 'A few minutes', '1 hour', 'Counts can be repaired later.'],
        ['Analytics and the weekly recap email', '24 hours', '1 day', 'Can be rebuilt, or skipped for a day.'],
      ],
      caption: 'Snapgram’s targets (illustrative). The zero-RPO row pays for slower writes; the 24-hour row needs nothing more than nightly backups.',
    },
    { kind: 'heading', text: 'Watching a region fail over' },
    {
      kind: 'diagram',
      title: 'Oregon fails over to Singapore',
      caption: 'Oregon goes down. Step through what users see, which data is lost, and how traffic moves to Singapore and back.',
      spec: failover,
    },
    {
      kind: 'prose',
      md: 'The two targets show up in the steps. Data written in Oregon but not yet copied was lost, so with asynchronous replication, the data you lose is whatever sat in the [[replication lag|replication-lag]]. The time until requests flowed again includes noticing, deciding and switching, and it is usually longer than anyone guessed.',
    },
    { kind: 'heading', text: 'Active-passive or active-active' },
    {
      kind: 'prose',
      md: 'There are two ways to run a second region. In [[active-passive|active-passive]], one region serves all traffic while the other waits with replicated data, taking over only in a disaster. In [[active-active|active-active]], every region serves users all the time, usually the ones nearest to it.',
    },
    {
      kind: 'compare',
      left: {
        title: 'Active-passive',
        summary: 'One region serves, one waits.',
        points: [
          'Writes go to one leader in one region, so there are no conflicts to merge.',
          'You pay for a standby that sits idle.',
          'Failover is rare and risky, and nobody knows if the standby can carry full load until it must.',
        ],
      },
      right: {
        title: 'Active-active',
        summary: 'Every region serves.',
        points: [
          'Users reach a nearby region, so pages are faster.',
          'Losing a region means shifting its users to regions already warm and tested by daily traffic.',
          'Writes in two places can [[conflict|write-conflict]], so each kind of data needs a rule: one [[home region|home-region]] per user, merging, or one global leader.',
        ],
      },
      caption: 'Active-active turns failover into everyday traffic shifting, at the price of harder data rules and spare capacity in every region.',
    },
    { kind: 'heading', text: 'Four ways to be ready' },
    {
      kind: 'prose',
      md: 'Between nightly backups and full active-active, Amazon Web Services (AWS) describes four common strategies in its disaster recovery guide. Each step up buys a faster recovery with more money.',
    },
    {
      kind: 'table',
      columns: ['Strategy', 'What runs in the second region', 'Recovery time (ballpark)', 'Cost'],
      rows: [
        ['Backup and restore', 'Nothing but copies of the backups; servers are built after the disaster.', 'Hours', 'Lowest'],
        ['[[Pilot light|pilot-light]]', 'Databases and storage, kept current by replication; app servers are off.', 'Tens of minutes', 'Low'],
        ['[[Warm standby|warm-standby]]', 'A small but complete copy that serves at once, then scales up.', 'Minutes', 'Medium'],
        ['Active-active', 'A full copy, serving its share of users every day.', 'Near zero', 'Highest'],
      ],
      caption: 'Recovery times are ballpark; your real one is whatever your last test measured.',
    },
    {
      kind: 'prose',
      md: 'After the outage, Snapgram goes active-active for the main app: Oregon and Singapore each serve their nearby users every day, with enough headroom to take the other’s traffic. Analytics stays on backup and restore, because a day without the weekly recap email hurts nobody.',
    },
    { kind: 'heading', text: 'Backups: the copy replication cannot give you' },
    {
      kind: 'prose',
      md: 'Replication protects you from losing a machine or a region. It does not protect you from yourself: a faulty migration, a buggy script or an attacker deleting data is copied to every replica within a second. A [[backup|backup]] is a separate, older copy that such a mistake cannot reach, kept in another region and ideally under another account.',
    },
    {
      kind: 'diagram',
      title: 'Replication copies mistakes; backups undo them',
      caption: 'A faulty migration deletes comments. Step through how a point-in-time restore brings them back.',
      spec: backups,
    },
    {
      kind: 'prose',
      md: 'Two habits make backups real. Keep them where the systems they protect cannot delete them, with [[encryption at rest|encryption-at-rest]] so a stolen copy is useless. And restore them on a schedule, timing every step, because ==a backup that has never been restored is a hope, not a plan==. Many teams also hold a [[game day|game-day]], failing a region on purpose during working hours to check that the plan, the people and the capacity hold.',
    },
    { kind: 'heading', text: 'Data residency' },
    {
      kind: 'prose',
      md: '[[Data residency|data-residency]] adds a rule on top: some data must stay inside a country or area, because of law or because customers demand it. Europe’s General Data Protection Regulation (GDPR) limits when personal data may leave Europe, and the schools want the promise in writing. So Snapgram opens a Frankfurt region, which becomes the home region of every European user: their photos and profiles are stored there and not copied to Oregon or Singapore.',
    },
    {
      kind: 'prose',
      md: 'Residency also shapes disaster recovery. Frankfurt cannot fail over to Oregon, so its backups and its standby must stay in Europe too, for example in a second European region. Settle these region pairs before signing the contract, not during the outage.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson gives each kind of data one leader region with followers elsewhere; real systems mix models per dataset, as [the lesson on consistency trade-offs](lesson:cap-pacelc) showed. It also skips slow parts of a real failover, such as moving every service’s DNS name, raising capacity limits in the surviving region, and failing back.',
    },
  ],
  tradeoffs: {
    caption: 'Disaster recovery strategies, from cheapest to fastest.',
    rows: [
      {
        option: 'Backup and restore',
        goodAt: 'Cheapest by far, and the only defense against deleted or corrupted data.',
        badAt: 'Recovery takes hours, and everything since the last backup or log copy is lost.',
        pickWhen: 'The data can wait a day, such as analytics, and always as the safety net under any other strategy.',
      },
      {
        option: 'Pilot light',
        goodAt: 'Data stays current in the second region for a small monthly cost.',
        badAt: 'Servers must be started and scaled during the disaster, which is slow and can fail.',
        pickWhen: 'You need a low RPO but can accept tens of minutes of downtime.',
      },
      {
        option: 'Warm standby',
        goodAt: 'Serves at once, and is easy to test with a small share of real traffic.',
        badAt: 'Must scale up quickly under pressure, and you pay for a copy that mostly waits.',
        pickWhen: 'Downtime must be minutes, but a full second copy is too expensive.',
      },
      {
        option: 'Active-active',
        goodAt: 'Near-zero downtime, lower latency for users near each region, and failover tested by daily traffic.',
        badAt: 'Highest cost and complexity: conflicting writes, spare capacity everywhere, harder deploys.',
        pickWhen: 'Users are spread worldwide and downtime is very expensive.',
      },
    ],
  },
  realWorld: {
    title: 'AWS’s four disaster recovery strategies',
    body: 'Amazon Web Services (AWS) publishes a whitepaper, *Disaster Recovery of Workloads on AWS*, that sorts strategies into four groups: backup and restore, pilot light, warm standby and multi-site active/active. It presents them as a range, from the low cost and complexity of backups to the most complex and costly option, several active regions, which can bring recovery time near zero for most disasters. Even then, data corruption may still need a restore from backup.\n\nThe guide says a backup strategy must include testing the backups. Because automatic failover can fire on a false alarm, it notes that manually started failover is common, and recommends automating every step so that starting one is like pushing a button.',
    sourceUrl: 'https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html',
    sourceLabel: 'Amazon Web Services, “Disaster recovery options in the cloud,” in the whitepaper Disaster Recovery of Workloads on AWS',
  },
  interview: {
    whenToMention:
      'When the interviewer asks what happens if a whole region or data center goes down, or when the requirements mention global users, strict uptime or data laws. Give RPO and RTO targets per kind of data, pick a strategy that meets them, and say what it costs. Mention backups even when you replicate, because replication copies mistakes.',
    sayItLikeThis: [
      'For payments I want an RPO of zero, so those writes are confirmed in two regions; for likes, losing a minute is fine, so they replicate asynchronously.',
      'I’d run active-active in two regions behind GeoDNS, each with headroom to absorb the other’s traffic, and fail over by changing DNS answers with a short TTL.',
      'Replication is not a backup: I’d keep point-in-time backups in a separate account and restore one every week to prove they work.',
    ],
    followUps: [
      {
        q: 'Why not make every write synchronous across regions and get an RPO of zero everywhere?',
        a: 'Every write would wait for a round trip to the other region, roughly 150 to 200 ms across the Pacific (ballpark), and writes would stall whenever the link is down. That is worth it for payments, not for likes. Choosing per kind of data keeps the slow path small.',
      },
      {
        q: 'How do you stop both regions from accepting writes for the same data after a failover?',
        a: 'Make sure only one region can be the leader for each piece of data at a time. Fence off the old leader before promoting the new one, keep leadership in a consensus-based store, or give each user one home region so their data has exactly one writer. Otherwise you get split brain and conflicting writes to merge by hand.',
      },
      {
        q: 'Your RTO is 15 minutes. How do you know you can meet it?',
        a: 'By measuring it. Run failover drills and scheduled restores, and time each step, including detection and the decision to fail over. The last drill’s number is the real RTO; until then the target is only a wish.',
      },
    ],
    redFlags: [
      'Saying replication means you do not need backups.',
      'Promising zero data loss and zero downtime without mentioning the cost or the added latency.',
      'A failover plan that has never been tested, or that assumes the surviving region has unlimited capacity.',
    ],
  },
  mistakes: [
    '**Treating replicas as backups.** A replica copies a bad delete within a second; only an older, separate copy lets you go back in time.',
    '**Never testing a restore.** Backups fail silently, from missing tables to lost encryption keys, and you discover it during the disaster.',
    '**A standby without the capacity.** If the second region can hold only half the traffic, failing over just moves the outage there.',
    '**Long DNS TTLs on failover records.** Clients keep using the dead region’s address for hours after you switch.',
    '**Forgetting residency in the DR plan.** Failing European data over to another continent can break the very rule the region was built for.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Snapgram replicates Oregon to Singapore asynchronously, with about two seconds of lag. Oregon fails. What is the most data Snapgram can lose?',
      options: [
        {
          text: 'About the last two seconds of writes',
          correct: true,
          why: 'Anything written in Oregon but not yet copied is lost, and the copy runs about two seconds behind.',
        },
        {
          text: 'Nothing, because the data is replicated',
          correct: false,
          why: 'Asynchronous replication confirms writes before copying them, so the newest ones exist only in Oregon.',
        },
        {
          text: 'Everything since the last nightly backup',
          correct: false,
          why: 'That would be true with backups alone; the live replica is far more current.',
        },
        {
          text: 'Everything stored in Oregon',
          correct: false,
          why: 'Singapore holds a full copy, missing only the writes still on their way.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'Oregon fails. Health checks take 3 minutes to notice, the on-call engineer takes 10 minutes to decide, promoting Singapore’s database takes 2 minutes, and clients then hold the old address for a 5-minute TTL (time to live). Roughly how many minutes pass before every user is served again?',
      answer: 20,
      unit: 'minutes',
      tolerance: 1.1,
      solution: [
        'Recovery time counts every step, not just the technical switch.',
        '3 + 10 + 2 + 5 = 20 minutes.',
        'The human decision is the biggest part, which is why teams automate every step after it.',
      ],
    },
    {
      kind: 'order',
      prompt: 'Put a regional failover in order.',
      items: [
        'Oregon stops answering',
        'Health checks fail and an alert fires',
        'The team decides to fail over',
        'Singapore’s database is promoted to leader',
        'DNS starts returning Singapore’s address',
        'Cached DNS answers expire and traffic reaches Singapore',
      ],
      why: 'Detection and the decision come before any switch. Promoting the database before moving traffic means users never land on a copy that cannot accept writes, and the DNS change only takes full effect as cached answers expire.',
    },
    {
      kind: 'multi',
      prompt: 'Which of these does a backup protect against that cross-region replication does not?',
      options: [
        {
          text: 'A migration that deletes half a table',
          correct: true,
          why: 'Replication copies the delete everywhere within a second; a backup from before it lets you restore.',
        },
        {
          text: 'An attacker deleting data',
          correct: true,
          why: 'A backup kept under a separate account is out of the attacker’s reach, while replicas obey the deletes.',
        },
        {
          text: 'The whole Oregon region going down',
          correct: false,
          why: 'Both help here, and a live replica recovers far faster than restoring a backup.',
        },
        {
          text: 'Slow photo loads for users in Asia',
          correct: false,
          why: 'That is what a nearby replica is for; backups are never served to users.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'European users’ photos must stay in Europe. Where should the Frankfurt region fail over to?',
      options: [
        {
          text: 'A second region inside Europe',
          correct: true,
          why: 'It keeps the data where the rules require while still surviving the loss of Frankfurt.',
        },
        {
          text: 'Oregon, since it has the most capacity',
          correct: false,
          why: 'Copying the data to Oregon breaks the residency promise that Frankfurt exists to keep.',
        },
        {
          text: 'Nowhere, because residency rules out disaster recovery',
          correct: false,
          why: 'Residency limits where copies may live, not whether they exist; a second European region works.',
        },
        {
          text: 'Singapore, since it is already active',
          correct: false,
          why: 'Singapore is outside Europe, so failing over there moves the data out of Europe.',
        },
      ],
    },
  ],
  takeaways: [
    'Set an RPO and an RTO for each kind of data first; smaller numbers cost more, so spend them where losing data or time really hurts.',
    'Backup and restore, pilot light, warm standby and active-active trade money for recovery speed, and active-active turns failover into everyday traffic shifting.',
    'Replication is not a backup, an untested restore is not a plan, and data residency decides where both may live.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Automatic or manual failover.** A health check can fail during a brief network blip, and a needless failover loses data and risks [[split brain|split-brain]], with both regions accepting writes. Many teams have a person make the call but automate every step after it, so failing over is one command, not a page of instructions.',
    },
    {
      kind: 'prose',
      md: '**Failing back.** When the lost region returns, it must first catch up on everything written while it was gone, and any writes stranded in it during the failure need a decision: replay them, merge them or discard them. Teams fail back deliberately, at a quiet hour, often days later.',
    },
    {
      kind: 'prose',
      md: '**Static stability.** A plan that must start hundreds of servers during a region-wide disaster depends on control systems that may be overloaded at that very moment. Keeping enough capacity already running in the surviving region, so nothing has to be created to fail over, removes that dependency at a higher monthly cost.',
    },
    {
      kind: 'prose',
      md: '**Cells.** Some large systems split users into many independent copies of the whole stack, called cells, so a failure or a bad deploy hits one cell’s users instead of everyone. It shrinks the damage of a failure to less than a region.',
    },
    {
      kind: 'prose',
      md: '**Residency in practice.** When Dropbox described moving most of its file storage into its own data centers in 2016, it [said it would keep using AWS](https://dropbox.tech/infrastructure/magic-pocket-infrastructure) for storing data in Germany for European business customers who asked for it.',
    },
  ],
  flashcards: [
    { front: 'What is a recovery point objective (RPO)?', back: 'The most recent data you can afford to lose in a disaster, measured in time, such as one minute of writes.' },
    { front: 'What is a recovery time objective (RTO)?', back: 'How long the system may be down after a disaster before it must be serving users again.' },
    {
      front: 'Active-passive or active-active: what is the difference?',
      back: 'Active-passive serves from one region while another waits to take over; active-active serves users from every region all the time.',
    },
    {
      front: 'What is a pilot light?',
      back: 'A disaster recovery setup where data is replicated to a second region but its app servers stay off until a disaster, so recovery takes tens of minutes.',
    },
    {
      front: 'Why is replication not a backup?',
      back: 'Replication copies deletes and corruption to every replica within seconds; a backup is an older, separate copy you can restore from.',
    },
    {
      front: 'Why should failover DNS records have a short TTL?',
      back: 'Clients cache DNS answers for the TTL, so a long one keeps them sending traffic to the dead region after you switch.',
    },
    {
      front: 'How does data residency affect disaster recovery?',
      back: 'Backups and standby copies must stay inside the allowed area, so a European region fails over to another European region.',
    },
  ],
  related: ['replication', 'replication-lag', 'cap-pacelc', 'consensus-leader-election', 'dns', 'availability-nines', 'zero-downtime-deploys', 'cost-awareness'],
  glossaryTerms: [
    'region',
    'replication',
    'availability-zone',
    'correlated-failure',
    'disaster-recovery',
    'recovery-point-objective',
    'recovery-time-objective',
    'synchronous-replication',
    'geodns',
    'asynchronous-replication',
    'health-check',
    'dns-failover',
    'ttl',
    'failover',
    'headroom',
    'replication-lag',
    'active-passive',
    'active-active',
    'write-conflict',
    'home-region',
    'pilot-light',
    'warm-standby',
    'backup',
    'point-in-time-recovery',
    'encryption-at-rest',
    'game-day',
    'data-residency',
    'split-brain',
  ],
};

export default lesson;
