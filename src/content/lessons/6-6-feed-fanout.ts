import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** Fan-out on write: the post is copied into every follower's feed list; a read is one list. */
const push: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'maya', type: 'client', label: 'Maya', sublabel: '300 followers', x: 0, y: 0 },
    { id: 'post', type: 'service', label: 'Post service', x: 1, y: 0 },
    { id: 'workers', type: 'worker', label: 'Fan-out workers', x: 2, y: 0 },
    { id: 'posts', type: 'nosqlDb', label: 'Posts', x: 1, y: 1 },
    { id: 'feeds', type: 'cache', label: 'Feed cache', sublabel: 'a list per user', x: 2, y: 1 },
    { id: 'reader', type: 'client', label: 'A follower', x: 0, y: 2 },
    { id: 'feed', type: 'service', label: 'Feed service', x: 1, y: 2 },
  ],
  edges: [
    { id: 'maya-post', from: 'maya', to: 'post', kind: 'sync' },
    { id: 'post-posts', from: 'post', to: 'posts', kind: 'sync' },
    { id: 'post-workers', from: 'post', to: 'workers', kind: 'async' },
    { id: 'workers-feeds', from: 'workers', to: 'feeds', kind: 'sync' },
    { id: 'reader-feed', from: 'reader', to: 'feed', kind: 'sync' },
    { id: 'feed-feeds', from: 'feed', to: 'feeds', kind: 'sync' },
    { id: 'feed-posts', from: 'feed', to: 'posts', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Maya posts a photo. The **post service** saves it once in the **posts** store and answers her at once.',
      flow: ['maya-post', 'post-posts', '<maya-post'],
    },
    {
      caption: 'A queued job lets the **fan-out workers** append the post’s ID to the list of each of Maya’s 300 followers in the **feed cache**.',
      flow: ['post-workers', 'workers-feeds'],
      notes: [{ target: 'feeds', text: '300 writes' }],
    },
    {
      caption: 'A follower opens the app. The **feed service** reads one ready-made list from the **feed cache**.',
      flow: ['reader-feed', 'feed-feeds', '<feed-feeds'],
      notes: [{ target: 'feed', text: '1 list' }],
    },
    {
      caption: 'It fetches the posts those IDs point to: a few milliseconds in all (ballpark), however many accounts the follower follows.',
      flow: ['feed-posts', '<feed-posts', '<reader-feed'],
      notes: [{ target: 'feed', text: '≈ 5 ms' }],
    },
  ],
};

/** Fan-out on read: posting is one write; every feed load gathers from every followed account. */
const pull: DiagramSpec = {
  grid: { cols: 2, rows: 3 },
  nodes: [
    { id: 'maya', type: 'client', label: 'Maya', x: 0, y: 0 },
    { id: 'post', type: 'service', label: 'Post service', x: 1, y: 0 },
    { id: 'posts', type: 'nosqlDb', label: 'Posts', sublabel: 'a list per author', x: 1, y: 1 },
    { id: 'reader', type: 'client', label: 'A follower', sublabel: 'follows 300', x: 0, y: 2 },
    { id: 'feed', type: 'service', label: 'Feed service', x: 1, y: 2 },
  ],
  edges: [
    { id: 'maya-post', from: 'maya', to: 'post', kind: 'sync' },
    { id: 'post-posts', from: 'post', to: 'posts', kind: 'sync' },
    { id: 'reader-feed', from: 'reader', to: 'feed', kind: 'sync' },
    { id: 'feed-posts', from: 'feed', to: 'posts', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Maya posts. The **post service** adds the post to Maya’s own list in the **posts** store, and that is all: one write, whatever her follower count.',
      flow: ['maya-post', 'post-posts'],
      notes: [{ target: 'posts', text: '1 write' }],
    },
    {
      caption: 'A follower opens the app. The **feed service** asks for the recent posts of all 300 accounts they follow, in parallel batches.',
      flow: ['reader-feed', 'feed-posts'],
      notes: [{ target: 'feed', text: '300 lookups' }],
    },
    {
      caption: 'It merges the 300 lists by time and returns the newest page. The load waits for its slowest lookup, so it takes tens of milliseconds (ballpark), and longer for people who follow thousands.',
      flow: ['<feed-posts', '<reader-feed'],
      notes: [{ target: 'feed', text: 'merge 300 lists' }],
    },
  ],
};

/** A hybrid feed load: the pushed list plus the few big accounts, merged. */
const hybridLoad: SequenceSpec = {
  actors: [
    { id: 'maya', type: 'client', label: 'Maya' },
    { id: 'feed', type: 'service', label: 'Feed service' },
    { id: 'cache', type: 'cache', label: 'Feed cache' },
    { id: 'posts', type: 'nosqlDb', label: 'Posts' },
  ],
  messages: [
    {
      from: 'maya',
      to: 'feed',
      label: 'open my feed',
      kind: 'sync',
      caption: 'Maya opens Snapgram. She follows 300 accounts; two of them, a pop star and a news account, are above the threshold.',
    },
    {
      from: 'feed',
      to: 'cache',
      label: 'read Maya’s list',
      kind: 'sync',
      caption: 'The feed service reads her ready-made list, filled by pushes from the 298 ordinary accounts.',
    },
    {
      from: 'feed',
      to: 'posts',
      label: 'recent posts of 2 accounts',
      kind: 'sync',
      caption: 'At the same time, it asks for the recent posts of the two big accounts: two lookups, not 300.',
    },
    { from: 'posts', to: 'feed', label: 'their recent posts', kind: 'reply', caption: 'The pop star’s post from a minute ago comes back with the rest.' },
    {
      from: 'feed',
      to: 'maya',
      label: 'merged first page',
      kind: 'reply',
      caption: 'The service merges both lists by time and returns the first page. The pop star’s post is there, and it cost no feed writes.',
    },
  ],
  groups: [{ label: 'gather, then merge', from: 2, to: 4 }],
};

const lesson: Lesson = {
  id: 'feed-fanout',
  module: 'm6',
  order: 6,
  title: 'Feeds: fan-out on write vs. on read',
  idea: 'A home feed can be built when posts are written, by copying each post into every follower’s feed, or when it is read, by gathering posts from everyone you follow; large systems mix the two so that huge accounts break neither.',
  minutes: 15,
  prerequisites: ['caching', 'denormalization'],
  outcomes: [
    'Explain fan-out on write (push) and fan-out on read (pull), and what each costs per post and per feed load.',
    'Describe the celebrity problem and how a hybrid that pulls only the biggest accounts solves it.',
    'Estimate the write load and memory of a feed design, and pick a strategy for a given mix of reads and writes.',
  ],
  analogy: {
    title: 'Doorstep delivery vs. the newsstand',
    body: 'A newspaper can reach readers in two ways. It can deliver a copy to every subscriber’s door each morning: lots of work on the delivery routes, but reading is effortless. Or it can leave a stack at the newsstand: no routes at all, but every reader makes a trip each time.\n\nIf you read two hundred papers, doorstep delivery still works, but the newsstand means two hundred trips every morning. And a paper read by half the city takes all night to deliver door to door. The sensible plan is doorstep delivery for small papers and a stack on every corner for the giant one.',
  },
  whyItMatters:
    'Snapgram has about 50 million daily users, and the [[home feed|news-feed]] is the first screen they see, loaded far more often than anyone posts. The team keeps a ready-made feed for each user: when Maya posts, a worker copies her post into the feeds of her 300 followers, and opening the app reads one short list.\n\nThen a pop star joins and gains 30 million followers. Her first post sets off 30 million feed writes; the workers fall minutes behind, and ordinary posts wait in line behind hers. Some fans see her post at once and others minutes later.',
  body: [
    {
      kind: 'prose',
      md: 'A feed shows the newest posts from the accounts you follow. Who follows whom is the [[social graph|social-graph]], and a typical Snapgram user follows a few hundred accounts. You can assemble each feed at one of two moments: when a post is written, or when the feed is read.',
    },
    { kind: 'heading', text: 'Fan-out on write: push' },
    {
      kind: 'prose',
      md: 'With [[fan-out on write|fan-out-on-write]], also called push, posting does the work. The post is saved once; then a background job looks up the author’s followers and appends the post’s identifier (ID) to each follower’s list in a feed [[cache|cache]] such as [[Redis|redis]]. Each list is a [[read model|read-model]] built ahead of time, a form of [[denormalization|denormalization]]: one post ID stored once per follower.',
    },
    {
      kind: 'diagram',
      title: 'Fan-out on write',
      caption: 'Maya’s post is copied into 300 feeds when she posts; each feed load reads one list.',
      spec: push,
    },
    {
      kind: 'prose',
      md: 'Reading is then cheap: one list, then a fetch of the posts it points to. That is [[precomputation|precomputation]], and it pays off because a feed is loaded far more often than anyone posts, a high [[read/write ratio|read-write-ratio]]. The fan-out runs from a [[message queue|message-queue]], so Maya’s post returns at once and her followers see it a moment later: the feed is [[eventually consistent|eventual-consistency]].',
    },
    { kind: 'heading', text: 'Fan-out on read: pull' },
    {
      kind: 'prose',
      md: 'With [[fan-out on read|fan-out-on-read]], or pull, posting only saves the post to the author’s own list. When you open the app, the **feed service** reads the recent posts of every account you follow, merges them by time and returns the newest. Nothing is copied, no work is wasted on followers who never open the app, and a new post is visible the moment it is saved.',
    },
    {
      kind: 'diagram',
      title: 'Fan-out on read',
      caption: 'Posting is one write; every feed load gathers from all 300 followed accounts.',
      spec: pull,
    },
    {
      kind: 'prose',
      md: 'The cost moves to every read. Following 300 accounts means 300 lookups per feed load; they run in parallel, but this kind of [[fan-out|fan-out]] waits for the slowest one, so the load inherits the [[tail latency|tail-latency]] of the whole storage tier. Multiply that by every refresh from millions of users, and reads become the expensive side.',
    },
    {
      kind: 'compare',
      left: {
        title: 'Push (fan-out on write)',
        summary: 'Pays once per post',
        points: ['One write per follower for every post.', 'Each feed load reads one ready-made list.', 'Wasted writes for inactive followers; huge spikes for big accounts.'],
      },
      right: {
        title: 'Pull (fan-out on read)',
        summary: 'Pays on every feed load',
        points: ['One write per post, whatever the follower count.', 'Each feed load gathers from every followed account.', 'Always fresh, with nothing stored per follower.'],
      },
      caption: 'Which is cheaper depends on how often each side happens, and on who posts.',
    },
    { kind: 'heading', text: 'The celebrity problem' },
    {
      kind: 'prose',
      md: 'Follower counts are wildly uneven: most accounts have a few hundred followers, and a handful have tens of millions. Under push, the cost of a post grows with its author’s followers, so one post from an account with 30 million followers means 30 million feed writes. This is the [[celebrity problem|celebrity-problem]], an extreme case of [[write amplification|write-amplification]].',
    },
    {
      kind: 'numbers',
      items: [
        { label: 'Feed writes per post, typical account', value: 'a few hundred', note: 'one per follower' },
        { label: 'Feed writes per post, 30 million followers', value: '30 million' },
        { label: 'Time to finish at 100,000 writes per second', value: 'about 5 minutes', note: 'Twitter reported up to 5 minutes for 31 million followers' },
      ],
      caption: 'Ballpark figures.',
    },
    {
      kind: 'prose',
      md: 'While those writes run, some followers see the post and others do not, and the workers have no time for anyone else’s posts. Pull has a milder version of the problem: the celebrity’s own list of posts is read by millions of feed loads, a [[hot key|hot-key]] that needs extra copies in the cache.',
    },
    { kind: 'heading', text: 'Hybrid: push for most, pull for the few' },
    {
      kind: 'prose',
      md: 'The fix large systems describe is [[hybrid fan-out|hybrid-fan-out]]: push posts from ordinary accounts, but skip the fan-out for accounts above a follower threshold, say a million. Their posts are saved once, and each feed load pulls them in: it reads the ready-made list, fetches the recent posts of the few big accounts the reader follows and merges the two by time.',
    },
    {
      kind: 'sequence',
      title: 'A hybrid feed load',
      caption: 'Maya follows 300 accounts, two of them above the threshold.',
      spec: hybridLoad,
    },
    {
      kind: 'prose',
      md: 'The threshold is a dial between write cost and read cost. Lower it, and no post needs a huge fan-out, but every feed load pulls from more accounts; raise it, and reads stay cheap while the biggest pushed posts get expensive. Many designs also stop pushing to users who have not opened the app in weeks, and rebuild their feed with a pull when they return.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real feeds are ranked rather than sorted by time, mix in ads and suggestions, and keep a few hundred post IDs per user. Feed caches are split across machines by user, and a new follow triggers a [[backfill|backfill]] of that account’s recent posts.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'fan-out',
      preset: { strategy: 'push', distribution: 'skewed', celebrity: false, threshold: 100000 },
      intro:
        'Now compare the three strategies on a model of Snapgram: 20,000 sampled posts and 5,000 sampled feed loads, side by side. Start with push, add the celebrity, switch to pull, then move hybrid’s threshold. Every number is illustrative.',
    },
  ],
  tradeoffs: {
    caption: 'Three ways to build a feed.',
    rows: [
      {
        option: 'Push (fan-out on write)',
        goodAt: 'Fast, predictable feed loads: one list and a fetch of its posts.',
        badAt: 'Write cost grows with followers; celebrity posts take minutes; work is wasted on inactive users.',
        pickWhen: 'Follower counts are modest and feed loads far outnumber posts.',
      },
      {
        option: 'Pull (fan-out on read)',
        goodAt: 'Cheap, instant posting; always fresh; nothing stored per follower.',
        badAt: 'Every feed load gathers from every followed account, so reads are slow and costly.',
        pickWhen: 'Feeds are rarely read, follow lists are short, or the system is small.',
      },
      {
        option: 'Hybrid',
        goodAt: 'Caps the write cost of any post and keeps reads to one list plus a few pulls.',
        badAt: 'Two code paths, a merge step and a threshold to tune.',
        pickWhen: 'Follower counts are skewed, with a few huge accounts, as in nearly every large social network.',
      },
    ],
  },
  realWorld: {
    title: 'Twitter’s home timelines',
    body: 'In his talk “Timelines at Scale”, Raffi Krikorian described how Twitter built home timelines, and High Scalability published a summary. Twitter used fan-out on write: a new tweet’s ID was inserted into the home timeline of each follower, kept in a Redis cluster, so reading a timeline needed no computation. Each timeline held at most 800 entries, timelines were read about 300,000 times per second, and the goal was to deliver a tweet within 5 seconds.\n\nBig accounts strained the design: a tweet from Lady Gaga, with about 31 million followers, could take up to 5 minutes to reach them all. The plan described for such accounts is the hybrid: stop fanning out their tweets and merge them into timelines at read time.',
    sourceUrl: 'https://highscalability.com/the-architecture-twitter-uses-to-deal-with-150m-active-users/',
    sourceLabel: 'High Scalability, “The Architecture Twitter Uses to Deal with 150M Active Users” (2013), a summary of Raffi Krikorian’s talk “Timelines at Scale”',
  },
  interview: {
    whenToMention:
      'In any design with a home feed or timeline. Explain how feeds are built (push, pull or hybrid) right after the data model, and raise the celebrity case before the interviewer does.',
    sayItLikeThis: [
      'Feed loads far outnumber posts, so I’d precompute feeds with fan-out on write: a few hundred post IDs per user in a sharded Redis cluster.',
      'Accounts above about a million followers skip the fan-out; their recent posts are merged in at read time.',
      'The fan-out runs from a queue, so posting returns at once and a slow fan-out never blocks the author.',
    ],
    followUps: [
      {
        q: 'What happens when someone follows a new account?',
        a: 'A background job copies that account’s most recent posts into the feed list. Unfollowing is the reverse: filter the account out at read time and clean up later. Neither needs to be instant.',
      },
      {
        q: 'How much memory do the feed lists need?',
        a: '50 million users × 800 post IDs × 8 bytes is about 320 gigabytes before replication, which fits in a sharded cache cluster. Keeping lists only for recently active users cuts that further; the rest are rebuilt on demand.',
      },
      {
        q: 'Why not pull for everyone and cache the assembled feed?',
        a: 'A cached feed goes stale as soon as anyone you follow posts, which for active users is constantly. Every miss pays the full gather, and the misses are the slow loads people notice; push turns that gather into one cheap append per follower.',
      },
    ],
    redFlags: [
      'Pushing every post to every follower with no plan for accounts with millions of followers.',
      'Pulling from hundreds of accounts on every feed load without discussing latency.',
      'Doing the fan-out inside the post request, so a big account’s post times out.',
    ],
  },
  mistakes: [
    '**Fanning out inside the request.** The author waits while millions of feeds are written, and big posts time out; fan out from a queue.',
    '**One rule for every account.** Follower counts are skewed, so a strategy that is cheap on average can be ruinous for the top accounts.',
    '**Pushing to people who never log in.** Writes into feeds nobody opens are wasted; skip inactive users and rebuild their feed when they return.',
    '**Copying whole posts into feeds.** Store the post ID, or one edit means rewriting millions of copies.',
    '**Forgetting deletes.** Filter deleted posts out at read time instead of hunting down every copy.',
  ],
  quiz: [
    {
      kind: 'numeric',
      prompt: 'Snapgram users post 10 million times a day, and the average post’s author has 200 followers. Under push, how many feed writes is that per day?',
      answer: 2_000_000_000,
      unit: 'feed writes',
      tolerance: 1.1,
      solution: [
        'Push writes one feed entry per follower for every post.',
        '10,000,000 posts × 200 followers = 2,000,000,000 feed writes a day.',
        'That is about 23,000 writes per second on average (2 billion ÷ 86,400 seconds), before peaks.',
      ],
    },
    {
      kind: 'single',
      prompt: 'A pop star with 30 million followers posts. Which strategy avoids millions of writes for that post while keeping feed loads fast for everyone?',
      options: [
        {
          text: 'Hybrid: push ordinary accounts, pull accounts above a follower threshold',
          correct: true,
          why: 'The pop star’s post is saved once, and each follower’s feed load pulls it with one extra lookup.',
        },
        {
          text: 'Push, with more fan-out workers',
          correct: false,
          why: 'More workers finish sooner, but the post still costs 30 million writes, and the next big post does it again.',
        },
        {
          text: 'Pull for everyone',
          correct: false,
          why: 'It avoids the writes, but every feed load now gathers from hundreds of accounts, which slows every read.',
        },
        {
          text: 'Push, but only to followers in the same region',
          correct: false,
          why: 'Every follower still needs the post, so this only moves the writes around.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these are real costs of fan-out on read (pull)?',
      options: [
        {
          text: 'Feed loads slow down as people follow more accounts',
          correct: true,
          why: 'Each followed account is another lookup, and the load waits for the slowest one.',
        },
        {
          text: 'A celebrity’s list of posts becomes a hot key read by millions of feed loads',
          correct: true,
          why: 'Every follower’s feed load reads it, so it needs extra cached copies.',
        },
        {
          text: 'A celebrity’s post triggers millions of feed writes',
          correct: false,
          why: 'That is the cost of push. Under pull, any post is one write.',
        },
        {
          text: 'New posts take minutes to appear in followers’ feeds',
          correct: false,
          why: 'Pull reads the latest posts at load time, so a new post shows up on the next load.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put fan-out on write in order, from the author’s tap to a follower seeing the post.',
      items: [
        'The author taps Post',
        'The post is saved once',
        'A fan-out job is queued',
        'Workers append the post’s ID to each follower’s feed',
        'A follower opens the app and reads their feed list',
      ],
      why: 'The author’s request ends once the post is saved and the job is queued. The fan-out runs in the background, which is why a big account’s post reaches its followers gradually.',
    },
    {
      kind: 'single',
      prompt: 'Why does push usually win for ordinary accounts?',
      options: [
        {
          text: 'Feeds are read far more often than posts are written, so paying once per post beats paying on every load',
          correct: true,
          why: 'With a high read/write ratio, the work done at write time is reused by many cheap reads.',
        },
        {
          text: 'Writes to a cache are free',
          correct: false,
          why: 'Writes cost memory and work. It is the ratio of reads to writes that makes push worthwhile.',
        },
        {
          text: 'Pull cannot show posts in time order',
          correct: false,
          why: 'Pull merges by time just fine; its problem is how much it gathers on every load.',
        },
        {
          text: 'Push needs no extra storage',
          correct: false,
          why: 'Push stores one entry per follower for every post: it trades memory for fast reads.',
        },
      ],
    },
  ],
  takeaways: [
    'Fan-out on write (push) copies each post into every follower’s feed, so a feed load reads one list, but the cost of a post grows with its author’s followers.',
    'Fan-out on read (pull) gathers from every followed account when the feed is opened, so posting is cheap but every feed load is slow and costly.',
    'Large systems go hybrid: push for ordinary accounts and pull for the few huge ones, merged at read time, so no single post triggers millions of writes.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Ranking.** Most feeds are no longer purely newest-first: a ranking model scores candidate posts. Push, pull or hybrid still decides which candidates exist; ranking only reorders them.',
    },
    {
      kind: 'prose',
      md: '**Paging.** Feeds load a page at a time with a cursor ([[cursor pagination|cursor-pagination]]), so a list of a few hundred IDs covers many scrolls. Scrolling past the end of the list falls back to a slower pull.',
    },
    {
      kind: 'prose',
      md: '**Edits and deletes.** Because feeds hold IDs rather than copies, an edit changes one stored post. A deleted post is filtered out at read time, so nobody has to find every copy.',
    },
    {
      kind: 'prose',
      md: '**Watch the talk.** Raffi Krikorian’s [Timelines at Scale](https://www.infoq.com/presentations/Twitter-Timeline-Scalability/) on InfoQ walks through Twitter’s timeline design in 38 minutes.',
    },
  ],
  flashcards: [
    {
      front: 'What is fan-out on write?',
      back: 'Copying each new post’s ID into the feed of every follower when it is posted, so reading a feed is one list lookup.',
    },
    { front: 'What is fan-out on read?', back: 'Building a feed when it is opened, by gathering and merging recent posts from every followed account.' },
    {
      front: 'What is the celebrity problem?',
      back: 'Under fan-out on write, one post from an account with millions of followers causes millions of feed writes and takes minutes to reach everyone.',
    },
    {
      front: 'How does a hybrid feed work?',
      back: 'Posts from ordinary accounts are pushed into feeds; posts from accounts above a follower threshold are pulled at read time and merged in.',
    },
    {
      front: 'Why store post IDs rather than whole posts in feeds?',
      back: 'IDs are small, and an edit or delete then touches one stored post instead of millions of copies.',
    },
    {
      front: 'What does the hybrid threshold trade?',
      back: 'A lower threshold caps the write cost of any post but makes each feed load pull more accounts; a higher one does the reverse.',
    },
  ],
  related: ['caching', 'denormalization', 'queues-and-streams', 'sharding', 'percentiles-tail-latency', 'batch-vs-stream'],
  glossaryTerms: [
    'news-feed',
    'social-graph',
    'fan-out-on-write',
    'cache',
    'redis',
    'read-model',
    'denormalization',
    'precomputation',
    'read-write-ratio',
    'message-queue',
    'eventual-consistency',
    'fan-out-on-read',
    'fan-out',
    'tail-latency',
    'celebrity-problem',
    'write-amplification',
    'hot-key',
    'hybrid-fan-out',
    'backfill',
    'cursor-pagination',
  ],
};

export default lesson;
