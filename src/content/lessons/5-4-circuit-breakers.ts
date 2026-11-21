import type { DiagramSpec, Lesson } from '../types';

/** The main step-through: suggestions slow down, the breaker opens, the feed falls back, and a trial call closes it again. */
const breakerAtWork: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'app', type: 'client', label: 'Snapgram app', x: 0, y: 1 },
    { id: 'feed', type: 'service', label: 'Feed service', sublabel: 'with a breaker', x: 1, y: 1 },
    { id: 'posts', type: 'service', label: 'Posts', x: 2, y: 0 },
    { id: 'sugg', type: 'service', label: 'Suggestions', sublabel: 'Suggested for you', x: 2, y: 1 },
    { id: 'popular', type: 'cache', label: 'Popular accounts', sublabel: 'cached list', x: 2, y: 2 },
  ],
  edges: [
    { id: 'app-feed', from: 'app', to: 'feed', kind: 'sync' },
    { id: 'feed-posts', from: 'feed', to: 'posts', kind: 'sync' },
    { id: 'feed-sugg', from: 'feed', to: 'sugg', kind: 'sync' },
    { id: 'feed-popular', from: 'feed', to: 'popular', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'A home feed request reaches the **feed service**, which calls **Posts** and **Suggestions** at the same time and waits for both before it answers.',
      flow: ['app-feed', ['feed-posts', 'feed-sugg'], ['<feed-posts', '<feed-sugg'], '<app-feed'],
    },
    {
      caption: 'Suggestions slows to a crawl. Each call now waits out its full 2-second timeout while holding a thread, and every feed request waits with it.',
      flow: ['app-feed', 'feed-posts', { edge: 'feed-sugg', tag: 'timeout', tone: 'alert' }],
      notes: [{ target: 'sugg', text: 'slow', tone: 'alert' }],
    },
    {
      caption: 'Half of the recent calls have failed, so the circuit breaker inside the feed service trips open. It stops calling Suggestions at all.',
      fail: ['sugg'],
      focus: ['feed', 'sugg', 'feed-sugg'],
      notes: [{ target: 'feed-sugg', text: 'open', tone: 'alert' }],
    },
    {
      caption: 'While the breaker is open, the feed service skips the call and fills the row from a cached list of **popular accounts**. The feed loads at normal speed.',
      fail: ['sugg'],
      flow: ['app-feed', ['feed-posts', 'feed-popular'], ['<feed-posts', '<feed-popular'], '<app-feed'],
      notes: [{ target: 'feed-sugg', text: 'open', tone: 'alert' }],
    },
    {
      caption: 'After a cool-down, about 30 seconds (ballpark), the breaker goes half-open and lets one trial call through. If it fails, the breaker opens again.',
      fail: ['sugg'],
      flow: [{ edge: 'feed-sugg', tag: 'trial', tone: 'alert' }],
      notes: [{ target: 'feed-sugg', text: 'half-open', tone: 'signal' }],
    },
    {
      caption: 'Once Suggestions recovers, a trial call succeeds and the breaker closes. Calls flow as before, and suggestions return to the feed.',
      flow: ['app-feed', ['feed-posts', 'feed-sugg'], ['<feed-posts', '<feed-sugg'], '<app-feed'],
      notes: [{ target: 'feed-sugg', text: 'closed', tone: 'signal' }],
    },
  ],
};

/** A pool per dependency: the slow one fills its own pool and no other. */
const bulkheads: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'feed', type: 'service', label: 'Feed service', x: 0, y: 0.5 },
    { id: 'poolS', type: 'worker', label: 'Suggestions pool', sublabel: '10 connections', x: 1, y: 0 },
    { id: 'poolP', type: 'worker', label: 'Posts pool', sublabel: '40 connections', x: 1, y: 1 },
    { id: 'sugg', type: 'service', label: 'Suggestions', x: 2, y: 0 },
    { id: 'posts', type: 'service', label: 'Posts', x: 2, y: 1 },
  ],
  edges: [
    { id: 'feed-poolS', from: 'feed', to: 'poolS', kind: 'sync' },
    { id: 'feed-poolP', from: 'feed', to: 'poolP', kind: 'sync' },
    { id: 'poolS-sugg', from: 'poolS', to: 'sugg', kind: 'sync' },
    { id: 'poolP-posts', from: 'poolP', to: 'posts', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'The feed service gives each dependency its own pool of connections: 10 for **Suggestions** and 40 for **Posts** (illustrative sizes). A call may only use its own pool.',
      flow: [
        ['feed-poolS', 'feed-poolP'],
        ['poolS-sugg', 'poolP-posts'],
      ],
    },
    {
      caption: 'Suggestions slows down, and its calls hold their connections while they wait. Once all 10 are busy, the next suggestions call is turned away at once and takes the fallback.',
      fail: ['sugg'],
      flow: ['feed-poolS', { edge: 'poolS-sugg', tag: 'waiting', tone: 'alert' }, { edge: 'feed-poolS', tag: 'full', tone: 'alert' }],
      notes: [{ target: 'poolS', text: '10 of 10 busy', tone: 'alert' }],
    },
    {
      caption: 'Calls to Posts use their own pool, so the feed still loads. With one shared pool, the waiting suggestions calls would have taken every connection.',
      fail: ['sugg'],
      flow: ['feed-poolP', 'poolP-posts', '<poolP-posts', '<feed-poolP'],
      notes: [
        { target: 'poolS', text: '10 of 10 busy', tone: 'alert' },
        { target: 'poolP', text: '3 of 40 busy', tone: 'plain' },
      ],
    },
  ],
};

const lesson: Lesson = {
  id: 'circuit-breakers',
  module: 'm5',
  order: 4,
  title: 'Circuit breakers and graceful degradation',
  idea: 'When a dependency keeps failing, a circuit breaker stops calling it for a while, so requests fail fast and get a fallback instead of waiting, and bulkheads keep one failure from sinking everything else.',
  minutes: 15,
  prerequisites: ['timeouts-retries-backoff'],
  outcomes: [
    'Explain the closed, open and half-open states of a circuit breaker and what moves it between them.',
    'Choose a fallback for each feature, so the product degrades gracefully instead of failing.',
    'Use bulkheads to keep one slow dependency from using up the threads and connections every other call needs.',
  ],
  analogy: {
    title: 'A breaker in the hallway, and a ship’s hull',
    body: 'When a faulty kettle shorts out, the breaker in your home’s electrical panel trips and cuts power to the kitchen, and the rest of the house stays lit. Once the kettle is fixed, you flip the switch back; if the fault is still there, it trips again at once.\n\nShips use the same idea against water: the hull is split into watertight compartments, so a hole floods one compartment instead of sinking the ship. Software borrows both. A circuit breaker cuts off a failing dependency, and a bulkhead keeps a failure inside its own compartment.',
  },
  whyItMatters:
    'Snapgram now has about 30 million daily users. The home feed is built by the feed service, which calls several others, including the “Suggested for you” service that picks accounts to follow. Suggestions are a nice extra; most people scroll right past them.\n\nOne evening, the suggestions service’s database slows to a crawl. Every feed request now waits two full seconds for its [[timeout|timeout]], and the waiting requests pile up inside the feed service. Within minutes it has no free threads or connections left, and the home feed stops loading for everyone. An optional extra has taken down Snapgram’s most important screen.',
  body: [
    {
      kind: 'prose',
      md: 'A dead service is kind to its callers: the connection is refused in milliseconds, and the caller moves on. A slow one is a [[partial failure|partial-failure]] that is far worse. Each waiting request holds a thread and a connection, and when the caller runs out of both, it stops answering too, so its own callers start waiting. One slow part spreading upward like this is a [[cascading failure|cascading-failure]].',
    },
    {
      kind: 'prose',
      md: 'Timeouts cap each wait, and retries cover brief blips, but in an outage that lasts minutes every request still waits out its full timeout. Retries add load to a service that is already struggling, and can grow into a [[retry storm|retry-storm]]. The fix is to notice that a dependency is broken and stop calling it for a while: a [[circuit breaker|circuit-breaker]].',
    },
    {
      kind: 'diagram',
      title: 'A circuit breaker in the feed service',
      caption: 'Step through an outage of the suggestions service, from the first slow calls to the breaker closing again.',
      spec: breakerAtWork,
    },
    { kind: 'heading', text: 'Closed, open and half-open' },
    {
      kind: 'prose',
      md: 'A breaker sits in the caller, around every call to one dependency, and is always in one of three states:\n\n- **Closed.** Calls go through, and the breaker counts how many recent calls failed or timed out, over a [[rolling window|sliding-window]] such as the last 10 seconds. When failures cross a threshold, say half of at least 20 calls (ballpark), it trips open.\n- **Open.** Calls [[fail fast|fail-fast]]: the breaker returns an error at once without touching the dependency, and the caller uses its fallback. This lasts for a cool-down, often 5 to 60 seconds (ballpark).\n- **Half-open.** After the cool-down, the breaker enters the [[half-open state|half-open-state]] and lets one trial call through. Success closes it and the count starts afresh; failure opens it for another cool-down.',
    },
    { kind: 'heading', text: 'Fallbacks and graceful degradation' },
    {
      kind: 'prose',
      md: 'An open breaker only helps if the caller has something better to do than show an error. That something is a [[fallback|fallback]], and choosing it is a product decision as much as a technical one. Common choices:\n\n- Serve cached or [[stale|stale-data]] data, such as a list of popular accounts.\n- Hide the feature and show the rest of the page.\n- For a write, accept it into a queue and apply it later.\n- When there is no honest stand-in, as with a payment, fail fast with a clear message the user can retry.',
    },
    {
      kind: 'prose',
      md: 'Keeping the core of the product working while a part is broken is called [[graceful degradation|graceful-degradation]]. Decide ahead of time which features are core, such as the feed and uploads, and which can quietly disappear, such as suggestions or view counts. Then make sure each optional call has a fallback that does not depend on the broken part.',
    },
    { kind: 'heading', text: 'Bulkheads' },
    {
      kind: 'prose',
      md: 'A breaker needs several seconds of failures before it trips, and a slow dependency can do a lot of damage in those seconds. A [[bulkhead|bulkhead]] limits it the way a ship’s compartments do. The caller gives each dependency its own [[connection pool|connection-pool]] or [[thread pool|thread-pool]] of a fixed size, so calls to suggestions can hold at most, say, 10 connections. When those are busy, the next call is turned away at once and takes the fallback, while calls to posts carry on in their own pool.',
    },
    {
      kind: 'diagram',
      title: 'Bulkheads in the feed service',
      caption: 'Each dependency gets its own pool. Step through a slowdown that fills one pool and leaves the other alone.',
      spec: bulkheads,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real breakers have more settings: a minimum number of calls before tripping, separate limits for slow calls and for errors, and several trial calls when half-open. They should count only failures that point at the dependency, such as timeouts and server errors, not a “not found” caused by the request itself. With 50 feed servers, each runs its own breakers, which trip at slightly different moments.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'circuit-breaker',
      title: 'Trip the breaker',
      caption:
        'The feed service calls suggestions every half second, through a breaker that trips when 5 of the last 10 calls fail. Make suggestions fail or slow down, watch the breaker trip and send a trial call, then make it healthy again.',
    },
  ],
  tradeoffs: {
    caption: 'Four tools that work best together.',
    rows: [
      {
        option: 'Timeouts and retries only',
        goodAt: 'Simple, and enough for brief blips.',
        badAt: 'In a long outage every call still waits out its timeout, and retries add load.',
        pickWhen: 'The dependency rarely fails for long, and calls are cheap.',
      },
      {
        option: 'Circuit breaker',
        goodAt: 'Fails fast during an outage and gives the dependency room to recover.',
        badAt: 'Thresholds need tuning: too eager and it trips on a blip, too slow and the damage spreads first.',
        pickWhen: 'A dependency can be down for minutes and callers can manage without it.',
      },
      {
        option: 'Bulkhead',
        goodAt: 'Caps how much of the caller one dependency can tie up.',
        badAt: 'Pools are sized by hand, and spare room in one pool cannot help another.',
        pickWhen: 'One service calls several dependencies of different importance.',
      },
      {
        option: 'Fallback',
        goodAt: 'Users keep the core experience while a part is broken.',
        badAt: 'Needs a design per feature, rarely runs, and can hide a problem if no one is alerted.',
        pickWhen: 'The feature is optional or has a reasonable stand-in, such as cached data.',
      },
    ],
  },
  realWorld: {
    title: 'Netflix’s Hystrix',
    body: 'Netflix built Hystrix, an open-source library, to stop failing dependencies from taking down its service. When the number of requests passes a threshold and the share of errors passes another, the circuit opens and short-circuits every request. After a sleep window, one request is let through; if it fails, the circuit opens again, and if it succeeds, it closes.\n\nHystrix also used bulkheads: a thread pool per dependency, so a slow one saturates only its own pool. Its wiki describes each instance of Netflix’s application programming interface (API) running more than 40 thread pools of 5 to 20 threads. Hystrix is [now in maintenance mode](https://github.com/Netflix/Hystrix), and Netflix points new projects to libraries such as Resilience4j.',
    sourceUrl: 'https://github.com/Netflix/Hystrix/wiki/How-it-Works',
    sourceLabel: 'Netflix, “How it Works,” Hystrix wiki on GitHub',
  },
  interview: {
    whenToMention:
      'Whenever one service calls another over the network, especially when a page [[fans out|fan-out]] to several dependencies. After timeouts and retries, say what happens when a dependency is down for minutes: a breaker, a fallback for each call, and bulkheads so one slow dependency cannot use up the caller.',
    sayItLikeThis: [
      'Each call from the feed service goes through a circuit breaker: if half the calls in ten seconds fail, it opens, and we fail fast for 30 seconds before one trial call.',
      'Suggestions are optional, so with the breaker open the feed shows cached popular accounts, and each dependency gets its own small connection pool, so a slow one cannot starve the rest.',
    ],
    followUps: [
      {
        q: 'How do you pick the thresholds and the cool-down?',
        a: 'From real traffic. Trip on an error rate well above normal, over enough calls that one unlucky second does not trip it, such as half of at least 20 calls. Make the cool-down long enough for the service to recover, often tens of seconds, then watch how often breakers trip and adjust.',
      },
      {
        q: 'What should the caller return when the breaker is open?',
        a: 'It depends on the feature. Optional parts get cached or default data, or disappear. Writes can sometimes be queued for later. For a payment there is no honest fallback, so the caller fails fast with a clear error the user can retry.',
      },
      {
        q: 'With 50 feed servers, does each one have its own breaker?',
        a: 'Usually, yes. Each instance counts its own calls and trips on its own, which needs no coordination, and the breakers opening at slightly different moments is fine. Sharing breaker state would add a dependency to the very thing meant to protect you from dependencies.',
      },
    ],
    redFlags: [
      'Adding retries with no breaker, so a long outage becomes a retry storm.',
      'Claiming the breaker fixes the failing service; it protects the callers and gives the service room to recover.',
      'Having no answer for what users see while the breaker is open.',
    ],
  },
  mistakes: [
    '**No timeouts.** A breaker counts failures, and a call that hangs forever never fails, so the breaker never trips.',
    '**Tripping on the wrong errors.** Counting a bad request or a “not found” as a failure trips the breaker on users’ mistakes, not on a sick dependency.',
    '**A fallback that needs the broken part.** If the fallback calls the same database or service, it fails too, and the breaker has protected nothing.',
    '**Untested fallbacks.** Fallback code runs only during incidents, so its bugs show up at the worst moment. Force breakers open in testing.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'A circuit breaker is open. What happens to the next call?',
      options: [
        {
          text: 'It fails at once and the caller uses its fallback, without contacting the dependency',
          correct: true,
          why: 'That is the point of the open state: no waiting, and no extra load on a service that is already struggling.',
        },
        {
          text: 'It waits in a queue until the dependency recovers',
          correct: false,
          why: 'Nothing queues. Waiting is exactly the problem the breaker exists to stop.',
        },
        {
          text: 'It is retried with exponential backoff',
          correct: false,
          why: 'An open breaker makes no call at all, so there is nothing to retry. [[Exponential backoff|exponential-backoff]] applies to calls the breaker lets through.',
        },
        {
          text: 'It goes to the dependency with a shorter timeout',
          correct: false,
          why: 'That would still send load to a broken service. Only the half-open trial call reaches it.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put a breaker’s life during an outage in order.',
      items: [
        'Calls go through while the breaker is closed',
        'Failures in the rolling window cross the threshold',
        'The breaker opens, and calls fail fast with a fallback',
        'The cool-down ends and the breaker goes half-open',
        'A trial call succeeds and the breaker closes',
      ],
      why: 'The breaker trips only after failures pile up, stays open for the cool-down, and closes only after a trial call shows the dependency is back. A failed trial would send it back to open.',
    },
    {
      kind: 'multi',
      prompt: 'The suggestions service is down. Which are good fallbacks for Snapgram’s “Suggested for you” row?',
      options: [
        { text: 'A cached list of popular accounts', correct: true, why: 'It is useful, cheap and does not depend on the broken service.' },
        { text: 'Hiding the row and showing the rest of the feed', correct: true, why: 'Suggestions are optional, so the feed is still complete without them.' },
        {
          text: 'Calling the suggestions service again with a longer timeout',
          correct: false,
          why: 'That waits even longer on a service that is known to be broken.',
        },
        { text: 'Failing the whole feed request with an error', correct: false, why: 'That turns an optional feature’s outage into a full outage.' },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'Feed requests arrive at 150 a second, and each holds one of the feed service’s 200 threads while it waits for suggestions, which now times out after 2 seconds. About how many threads would the waiting requests need?',
      answer: 300,
      unit: 'threads',
      tolerance: 1.1,
      solution: [
        'Each request waits about 2 seconds, until its timeout.',
        'By [[Little’s law|littles-law]], requests in progress = arrival rate × time each takes = 150 × 2 = 300.',
        'That is more than the 200 threads available, so requests queue and the whole feed stalls, which is why the breaker and the bulkhead matter.',
      ],
    },
    {
      kind: 'single',
      prompt: 'Why does a bulkhead help when one dependency slows down?',
      options: [
        {
          text: 'It caps the connections that dependency’s calls can hold, so calls to other dependencies keep theirs',
          correct: true,
          why: 'The slow calls fill only their own pool, and everything else carries on.',
        },
        {
          text: 'It makes the slow dependency answer faster',
          correct: false,
          why: 'It changes nothing about the dependency; it limits how much of the caller the slowness can take.',
        },
        {
          text: 'It retries slow calls on another server',
          correct: false,
          why: 'That is a retry or a [[hedged request|hedged-request]], not isolation.',
        },
        {
          text: 'It notices failures sooner than a circuit breaker',
          correct: false,
          why: 'A bulkhead does not detect anything. It limits the damage while the breaker decides whether to trip.',
        },
      ],
    },
  ],
  takeaways: [
    'A slow dependency is more dangerous than a dead one, because waiting calls hold threads and connections until the caller runs out.',
    'A circuit breaker counts recent failures, opens to fail fast with a fallback, and sends one trial call after a cool-down before closing again.',
    'Fallbacks keep the core product working while a part is broken, and bulkheads keep each dependency’s failure inside its own pool.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Breakers in the network layer.** Instead of a library in every service, a proxy beside each instance, as in a service mesh, can apply timeouts, retries and limits to every call from one configuration. Envoy, a popular proxy, caps the connections and pending requests to each group of upstream hosts, and can eject hosts that keep returning errors, which it calls outlier detection.',
    },
    {
      kind: 'prose',
      md: '**Breakers and retries together.** Each retry should pass through the breaker, so an open breaker stops retries too. Keep retries within a budget, as in [Timeouts, retries, backoff and jitter](lesson:timeouts-retries-backoff), so they cannot swamp a service while the breaker is still counting.',
    },
    {
      kind: 'prose',
      md: '**The server’s side.** A breaker protects the caller. The struggling service can protect itself too, by [[shedding load|load-shedding]]: rejecting work it cannot finish in time, the least important first. [Rate limiting](lesson:rate-limiting) covers how.',
    },
  ],
  flashcards: [
    {
      front: 'What does a circuit breaker do?',
      back: 'It watches calls to a dependency and, after too many failures, stops calling it for a while, so callers fail fast instead of waiting.',
    },
    {
      front: 'What are the three states of a circuit breaker?',
      back: 'Closed: calls pass and failures are counted. Open: calls fail fast. Half-open: one trial call decides whether to close or open again.',
    },
    {
      front: 'Why is a slow dependency worse than a dead one?',
      back: 'A dead one fails fast. A slow one makes every caller wait, holding threads and connections until the caller runs out too.',
    },
    {
      front: 'What is a bulkhead in software?',
      back: 'A separate, limited pool of threads or connections per dependency, so one slow dependency cannot use up what every other call needs.',
    },
    {
      front: 'What is graceful degradation?',
      back: 'Keeping the core product working when a part fails, by hiding or simplifying the features that depend on it.',
    },
    {
      front: 'What happens in the half-open state?',
      back: 'After the cool-down, the breaker lets one trial call through. Success closes it; failure opens it for another cool-down.',
    },
    {
      front: 'What makes a good fallback?',
      back: 'Something useful that does not depend on the broken part: cached or default data, a hidden section, or a clear, fast error when nothing else is honest.',
    },
  ],
  related: ['timeouts-retries-backoff', 'why-distributed-is-hard', 'rate-limiting', 'heartbeats-gossip', 'observability', 'load-balancers'],
  glossaryTerms: [
    'timeout',
    'partial-failure',
    'cascading-failure',
    'retry-storm',
    'circuit-breaker',
    'sliding-window',
    'fail-fast',
    'half-open-state',
    'fallback',
    'stale-data',
    'graceful-degradation',
    'bulkhead',
    'connection-pool',
    'thread-pool',
    'fan-out',
    'exponential-backoff',
    'littles-law',
    'hedged-request',
    'load-shedding',
  ],
};

export default lesson;
