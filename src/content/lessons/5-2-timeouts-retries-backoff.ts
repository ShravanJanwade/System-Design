import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** A slow database query turns into a retry storm that outlives it, and the fix. */
const storm: DiagramSpec = {
  grid: { cols: 4, rows: 1 },
  nodes: [
    { id: 'apps', type: 'client', label: 'Snapgram apps', x: 0, y: 0 },
    { id: 'gateway', type: 'gateway', label: 'Gateway', x: 1, y: 0 },
    { id: 'profile', type: 'service', label: 'Profile service', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Profile database', x: 3, y: 0 },
  ],
  edges: [
    { id: 'apps-gateway', from: 'apps', to: 'gateway', kind: 'sync' },
    { id: 'gateway-profile', from: 'gateway', to: 'profile', kind: 'sync' },
    { id: 'profile-db', from: 'profile', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'A normal evening. Requests flow from the apps through the **gateway** to the **profile service** and its database, using about half of the service’s capacity.',
      flow: ['apps-gateway', 'gateway-profile', 'profile-db'],
      notes: [{ target: 'profile', text: 'half busy', tone: 'plain' }],
    },
    {
      caption:
        'A slow query makes the **profile database** take seconds per request. The profile service’s answers stop arriving within the apps’ one-second timeout.',
      flow: ['apps-gateway', 'gateway-profile', { edge: 'profile-db', tag: 'slow', tone: 'alert' }],
    },
    {
      caption:
        'Every app retries the moment its request times out, and the gateway retries each failed call as well. The profile service now receives several times its normal traffic.',
      flow: [{ edge: 'apps-gateway', tone: 'alert' }, { edge: 'gateway-profile', tone: 'alert' }],
      notes: [
        { target: 'gateway', text: 'retries', tone: 'alert' },
        { target: 'profile', text: 'more retries', tone: 'alert' },
      ],
    },
    {
      caption:
        'The query is fixed, but the profile service stays swamped. Its queue is full of requests whose apps gave up long ago, and fresh retries keep refilling it: the storm outlives its cause.',
      fail: ['profile'],
      flow: [{ edge: 'apps-gateway', tone: 'alert' }, { edge: 'gateway-profile', tone: 'alert' }],
      notes: [{ target: 'db', text: 'fixed', tone: 'signal' }],
    },
    {
      caption:
        'The fix: apps back off with jitter, only the apps retry while the gateway fails fast, and a retry budget caps the extra traffic. The backlog drains and the service recovers.',
      flow: ['apps-gateway', 'gateway-profile', 'profile-db', '<profile-db', '<gateway-profile', '<apps-gateway'],
      notes: [{ target: 'profile', text: 'recovered', tone: 'signal' }],
    },
  ],
};

/** One app retrying with exponential backoff and full jitter. */
const jittered: SequenceSpec = {
  actors: [
    { id: 'app', type: 'client', label: 'Snapgram app' },
    { id: 'profile', type: 'service', label: 'Profile service' },
  ],
  messages: [
    { from: 'app', to: 'profile', label: 'Get profile', kind: 'sync', caption: 'The app asks for a profile and starts a one-second timer.' },
    {
      from: 'profile',
      to: 'app',
      label: 'Answer',
      kind: 'reply',
      lost: true,
      caption: 'Nothing comes back within the second, because the service is swamped. The attempt counts as failed.',
    },
    {
      from: 'app',
      to: 'profile',
      label: 'Retry after 0.7 s',
      kind: 'sync',
      caption: 'Instead of retrying at once, the app waits a random time of up to 1 second: 0.7 seconds this time.',
    },
    {
      from: 'profile',
      to: 'app',
      label: 'Answer',
      kind: 'reply',
      lost: true,
      caption: 'Still nothing. Other apps picked their own random waits, so their retries did not all land at the same moment.',
    },
    {
      from: 'app',
      to: 'profile',
      label: 'Retry after 1.6 s',
      kind: 'sync',
      caption: 'Now the app waits a random time of up to 2 seconds, then retries.',
    },
    {
      from: 'profile',
      to: 'app',
      label: 'Profile',
      kind: 'reply',
      caption: 'The service has caught up, and the answer arrives. Two well-spaced retries cost the service far less than a tight loop of them.',
    },
  ],
};

const lesson: Lesson = {
  id: 'timeouts-retries-backoff',
  module: 'm5',
  order: 2,
  title: 'Timeouts, retries, backoff and jitter',
  idea: 'Every call to another service needs a timeout, and a failed call should be retried only with exponential backoff, random jitter and a budget, because careless retries multiply the load on a struggling service and can keep it down.',
  minutes: 15,
  prerequisites: ['why-distributed-is-hard', 'percentiles-tail-latency'],
  outcomes: [
    'Choose a timeout from a dependency’s tail latency.',
    'Explain how retries turn a short slowdown into a retry storm, and why the storm can outlast its cause.',
    'Design a retry policy with exponential backoff, jitter and a retry budget.',
  ],
  analogy: {
    title: 'Redialing a busy line',
    body: 'When a radio station announces a giveaway, thousands of people dial the same number at the same moment, and almost all of them hear a busy signal. If everyone hangs up and redials at once, the line stays jammed however many times they try. Waiting before redialing helps only if people wait different amounts: if everyone waits exactly five seconds, they all collide again five seconds later.\n\nThe calls get through when each person waits a little longer after every busy signal, plus a random pause of their own. The same switchboard that was jammed can then answer the calls one after another. Computers retrying a busy service face the same problem, and use the same fix.',
  },
  whyItMatters:
    'Snapgram’s profile service answers about 20,000 requests a second at the evening peak (ballpark), roughly half of what it can handle. One evening a slow database query makes it stall for about 20 seconds. Every app waiting on it times out after one second and retries at once, then again and again, so the service’s traffic roughly triples.\n\nThe engineers fix the query, but the service does not come back. Its queue is full of requests whose apps gave up long ago, every new request waits behind them and times out too, and each timeout brings another retry. The service is busy all the time and answers almost nobody: a [[retry storm|retry-storm]].',
  body: [
    {
      kind: 'prose',
      md: 'Three decisions shape how a client handles failure: how long to wait, when to try again, and how much retrying the system can afford. Get them wrong, and the retries become the outage.',
    },
    { kind: 'heading', text: 'Timeouts' },
    {
      kind: 'prose',
      md: 'Every call to another service needs a [[timeout|timeout]]. Too long, and a stuck dependency ties up the caller: threads wait, users stare at spinners and requests pile up. Too short, and healthy but slightly slow calls fail, and every false failure brings a retry. A good rule is to set it a little above the dependency’s [[tail latency|tail-latency]], such as its 99.9th [[percentile|percentile]] (p99.9), so only about 1 healthy call in 1,000 times out.',
    },
    { kind: 'heading', text: 'How retries make things worse' },
    {
      kind: 'prose',
      md: 'Retries are great for brief, random failures: one dropped packet, one bad server behind a load balancer. They are terrible for overload, because each retry is one more request to a service that is already short of capacity. If every app keeps retrying, the struggling service sees several times its normal traffic.',
    },
    {
      kind: 'prose',
      md: 'Retries also multiply across layers. If the app, the gateway and the profile service each try a failing call three times, one tap can reach the database 3 × 3 × 3 = 27 times. Worse, an overloaded service wastes effort on requests whose callers have already given up, so even after the cause is fixed it stays swamped. A failure that keeps itself going after its trigger is gone is called a [[metastable failure|metastable-failure]].',
    },
    {
      kind: 'diagram',
      title: 'From a slow query to a retry storm',
      caption: 'Step through how one slow query becomes an outage that outlives it, and what stops it.',
      spec: storm,
    },
    { kind: 'heading', text: 'Exponential backoff' },
    {
      kind: 'prose',
      md: 'The first fix is to wait between attempts, and to wait longer each time: 1 second, then 2, 4 and 8, up to a cap such as 16 seconds. This is [[exponential backoff|exponential-backoff]]. A brief glitch is still retried quickly, while a long outage gets fewer and fewer retries, which gives the service room to recover. Cap the number of attempts too, often at three, then report the error.',
    },
    { kind: 'heading', text: 'Jitter' },
    {
      kind: 'prose',
      md: 'Backoff has a flaw when many clients fail at the same moment, which is exactly what an outage causes. They all wait 1 second and retry together, fail together, then wait 2 seconds and retry together again: the load arrives in synchronized waves, and each wave can knock the service over again. The fix is [[jitter|jitter]]: each client waits a random time between zero and its current backoff, which is called full jitter. The retries spread out, and the recovering service sees a smooth stream instead of a wall.',
    },
    {
      kind: 'sequence',
      title: 'One app, backing off with jitter',
      caption: 'Step through one app’s retries while the profile service catches up.',
      spec: jittered,
    },
    {
      kind: 'code',
      code: 'wait = random(0, min(cap, base × 2^attempt))',
      caption: 'Full jitter. With a base of 1 second and a cap of 16 seconds, the wait before the fourth retry is anywhere from 0 to 8 seconds.',
    },
    { kind: 'heading', text: 'Retry budgets' },
    {
      kind: 'prose',
      md: 'Backoff slows each client down, but it does not limit the total: in a long outage, every request still uses all of its attempts. A [[retry budget|retry-budget]] does. Each client allows retries only up to a fixed share of its requests, often around 10% (ballpark), for example with a [[token bucket|token-bucket]] that each request tops up a little and each retry drains. When the bucket is empty, the client reports the error instead of retrying, so retries can add at most about 10% to the load.',
    },
    {
      kind: 'prose',
      md: 'Two more rules finish the job. Retry only errors that might go away, such as timeouts and `503 Service Unavailable`, never `400 Bad Request`, and only operations that are safe to repeat; [Idempotency](lesson:idempotency) covers that. And retry at one layer, usually the one nearest the user, so attempts do not multiply down the stack.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real retry libraries also respect a server’s `Retry-After` header, stop when an overall deadline passes, and treat some errors as permanent. Servers protect themselves too, by turning excess work away early and with [circuit breakers](lesson:circuit-breakers); this lesson covers the client’s side.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'retry-storm',
      preset: { clients: 900, policy: 'immediate', outageSec: 20 },
      intro:
        'Replay a smaller version of Snapgram’s evening: 900 apps and a profile service that can answer 500 requests a second. Start with immediate retries and watch the load once the stall is fixed. Then switch to backoff, and then add jitter.',
    },
  ],
  tradeoffs: {
    caption: 'Retry policies, from riskiest to safest for a struggling service.',
    rows: [
      {
        option: 'No retries',
        goodAt: 'Adds no load, and is the simplest.',
        badAt: 'Every brief glitch, such as one dropped packet, becomes an error the user sees.',
        pickWhen: 'The call is not safe to repeat, or a person will retry anyway.',
      },
      {
        option: 'Immediate retries',
        goodAt: 'Hides one-off glitches quickly.',
        badAt: 'Multiplies the load during an outage and can start a retry storm.',
        pickWhen: 'Almost never; at most one quick retry of a cheap call that rarely fails.',
      },
      {
        option: 'Exponential backoff',
        goodAt: 'Retries slow down as failures continue, giving the service room to recover.',
        badAt: 'Clients that failed together retry together, in waves.',
        pickWhen: 'Few clients, or failures that do not hit many clients at once.',
      },
      {
        option: 'Backoff with jitter and a retry budget',
        goodAt: 'Spreads retries evenly and caps the extra load at a fixed share.',
        badAt: 'A little slower to retry, and each client needs a small counter.',
        pickWhen: 'Many clients share a service: the default for production clients.',
      },
    ],
  },
  realWorld: {
    title: 'Amazon’s rules for timeouts and retries',
    body: 'In the Amazon Builders’ Library, Marc Brooker of Amazon Web Services (AWS) describes how Amazon handles this. Teams pick a timeout from the latency of the service they call: accepting a false timeout rate of 0.1%, for example, means using that service’s 99.9th percentile latency. He calls retries selfish, because a client that retries uses more of the server’s time to raise its own chance of success.\n\nIn a stack five layers deep, retries at every layer can multiply the load on the database at the bottom by 243 times, so Amazon prefers to retry at a single point. It limits retries locally with a token bucket, which it added to the AWS software development kit (SDK) in 2016, and it adds jitter not only to backoff but also to timers and periodic jobs, so that clients do not line up.',
    sourceUrl: 'https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter',
    sourceLabel: 'Marc Brooker, “Timeouts, retries, and backoff with jitter,” Amazon Builders’ Library',
  },
  interview: {
    whenToMention:
      'Whenever one service calls another, say how long it waits and what it does on failure. Bring up retry storms when the interviewer asks what happens during an outage or a traffic spike, and mention jitter whenever many clients might retry or reconnect at the same moment.',
    sayItLikeThis: [
      'Every call has a timeout a little above the dependency’s p99.9 latency, so healthy calls almost never hit it.',
      'Clients retry only safe calls, at most twice, with exponential backoff and full jitter, capped at a few seconds.',
      'A retry budget keeps retries under about 10% of traffic, so an outage cannot turn into a retry storm.',
      'Only the edge retries; internal services fail fast, so retries do not multiply down the stack.',
    ],
    followUps: [
      {
        q: 'Why add jitter if you already back off exponentially?',
        a: 'Backoff spaces out one client’s retries, but clients that failed at the same moment still retry at the same moments, so the load arrives in waves. Jitter makes each wait random, so the retries spread evenly and the recovering service sees a smooth load.',
      },
      {
        q: 'How do you choose a timeout?',
        a: 'From the dependency’s latency distribution: a little above its p99 or p99.9, so only about 1 in 100 or 1 in 1,000 healthy calls times out. Then I check that it fits inside the caller’s own time limit, and pass the remaining time downstream.',
      },
      {
        q: 'Where in a chain of services should retries happen?',
        a: 'Ideally at one layer, usually the one closest to the user. If every layer retries, the attempts multiply: three tries at each of five layers is 243 calls at the bottom. Inner services should fail fast and let the edge decide.',
      },
    ],
    redFlags: [
      'Retrying immediately in a loop, with no backoff and no limit.',
      'Retrying payments or other unsafe calls without an idempotency key.',
      'No timeouts at all, or one long default timeout everywhere.',
      'Retrying at every layer of the stack.',
    ],
  },
  mistakes: [
    '**Retrying every error.** A `400 Bad Request` fails the same way every time; retry only errors that might go away, such as timeouts and `503`s.',
    '**Backoff without jitter.** Clients that failed together retry together, so the load arrives in waves that knock the service over again.',
    '**No cap on attempts or delay.** Unlimited retries keep a dead service under fire, and a wait that doubles forever leaves users waiting long after it recovers.',
    '**Retrying at every layer.** Each layer multiplies the attempts of the layer above it.',
    '**Timeouts longer than the caller’s.** If the app gives up after 1 second, a backend call with a 5-second timeout keeps working for nobody.',
  ],
  quiz: [
    {
      kind: 'numeric',
      prompt:
        'The app, the gateway and the profile service each try a failing call up to 3 times before giving up. How many calls can one tap send to the profile database at the bottom?',
      answer: 27,
      unit: 'calls',
      tolerance: 1.1,
      solution: [
        'The app tries the gateway up to 3 times.',
        'Each of those tries the profile service up to 3 times: 3 × 3 = 9.',
        'Each of those tries the database up to 3 times: 9 × 3 = 27.',
      ],
    },
    {
      kind: 'single',
      prompt: 'Snapgram’s apps all failed at the same moment, and they retry after exactly 1, 2, 4 and 8 seconds, with no jitter. What does the recovering profile service see?',
      options: [
        {
          text: 'Waves of retries at the same moments, with quiet gaps in between',
          correct: true,
          why: 'Apps that failed together follow the same schedule, so they keep arriving together.',
        },
        { text: 'A smooth, steady trickle of retries', correct: false, why: 'That is what jitter gives you; without it, nothing spreads the apps apart.' },
        { text: 'No retries at all until it has fully recovered', correct: false, why: 'Backoff only spaces the retries out; the apps keep retrying on their schedule.' },
        { text: 'The same load as with immediate retries', correct: false, why: 'Backoff does reduce the load over time; the problem is that it arrives in bursts.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these failures are usually worth retrying, with backoff?',
      options: [
        { text: 'A timeout on a request that is safe to repeat', correct: true, why: 'The problem may be brief, and repeating the request does no harm.' },
        { text: '`503 Service Unavailable`', correct: true, why: 'The server says it is overloaded or down for now, so a later attempt may succeed.' },
        { text: '`400 Bad Request`', correct: false, why: 'The request itself is wrong, so it will fail the same way every time.' },
        { text: '`403 Forbidden`', correct: false, why: 'The caller is not allowed to do this, and trying again will not change that.' },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'A retry budget allows retries up to 10% of requests. During a total outage, at most how much load do the clients send, as a percentage of normal?',
      answer: 110,
      unit: '%',
      tolerance: 1.05,
      solution: [
        'Every normal request is still sent once: 100% of normal.',
        'Retries may add at most 10% on top.',
        'So the load stays at or below 110% of normal, however long the outage lasts.',
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of a well-behaved retry in order.',
      items: [
        'Send the request with a timeout',
        'Check that the error is worth retrying',
        'Check that the retry budget has room',
        'Wait a random time, up to the backoff for this attempt',
        'Send the retry',
      ],
      why: 'Only retryable errors get past the first check, the budget stops retries from multiplying the load, and the random wait spreads retries out before the next attempt.',
    },
  ],
  takeaways: [
    'Every remote call needs a timeout, set from the dependency’s tail latency rather than a guess.',
    'Retries add load exactly when a service is struggling, so limit them with exponential backoff, a small number of attempts and a retry budget.',
    'Add jitter so clients that failed together do not retry together, and retry at one layer only.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Why backoff works best when clients wait.** When each client waits for an answer before sending more, backoff directly lowers how fast it sends. When new work keeps arriving no matter what, such as new users opening the app, backoff only delays the retries, and only a retry budget truly caps them.',
    },
    {
      kind: 'prose',
      md: '**Deadlines instead of timeouts.** With [[deadline propagation|deadline-propagation]], the caller sends its remaining time with the request, such as 300 ms, and every service passes on whatever is left. A service that receives a request whose deadline has already passed can skip it, which removes much of the wasted work that keeps a retry storm going.',
    },
    {
      kind: 'prose',
      md: '**Hedged requests are not retries.** A [[hedged request|hedged-request]] sends a backup copy of a slow request to another server before the first one fails, and uses whichever answer comes first. It cuts tail latency, but every hedge is extra load, so hedge only a small share of requests, such as those slower than the 95th percentile.',
    },
    {
      kind: 'prose',
      md: '**The simulation behind jitter.** In [Exponential backoff and jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) on the AWS Architecture Blog, Marc Brooker simulates 100 clients competing to update the same record. With plain backoff their calls still bunched together, and full jitter needed the least total work of the approaches he compared.',
    },
  ],
  flashcards: [
    { front: 'What is a retry storm?', back: 'A surge of load from many clients retrying at once, which can keep a struggling service down even after the original problem is fixed.' },
    { front: 'What does exponential backoff do?', back: 'It doubles the wait after each failed attempt, up to a cap, so retries slow down instead of piling on.' },
    { front: 'Why add jitter to backoff?', back: 'Without it, clients that failed together retry together, in waves; random waits spread the retries out.' },
    { front: 'What is full jitter?', back: 'Waiting a random time between zero and the current backoff, such as anywhere from 0 to 8 seconds.' },
    { front: 'What is a retry budget?', back: 'A cap on retries as a share of normal requests, such as 10%, so retries can never multiply the load.' },
    { front: 'How should you pick a timeout?', back: 'A little above the dependency’s p99 or p99.9 latency, and shorter than the time the caller itself has left.' },
    { front: 'Why retry at only one layer?', back: 'Retries multiply across layers: three tries at each of five layers is 243 calls at the bottom.' },
  ],
  related: ['why-distributed-is-hard', 'percentiles-tail-latency', 'idempotency', 'circuit-breakers', 'rate-limiting', 'queues-and-streams', 'load-balancers'],
  glossaryTerms: [
    'retry-storm',
    'timeout',
    'tail-latency',
    'percentile',
    'metastable-failure',
    'exponential-backoff',
    'jitter',
    'retry-budget',
    'token-bucket',
    'deadline-propagation',
    'hedged-request',
  ],
};

export default lesson;
