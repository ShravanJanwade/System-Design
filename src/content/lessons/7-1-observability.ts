import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** Where telemetry goes: three stores, dashboards, alerting and the on-call engineer. */
const pipeline: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'feed', type: 'service', label: 'Feed service', sublabel: 'and every other', x: 0, y: 1 },
    { id: 'logs', type: 'search', label: 'Log store', x: 1, y: 0 },
    { id: 'metrics', type: 'nosqlDb', label: 'Metrics store', x: 1, y: 1 },
    { id: 'traces', type: 'nosqlDb', label: 'Trace store', x: 1, y: 2 },
    { id: 'alerting', type: 'service', label: 'Alerting', x: 2, y: 1 },
    { id: 'oncall', type: 'client', label: 'On-call engineer', x: 3, y: 1 },
  ],
  edges: [
    { id: 'feed-logs', from: 'feed', to: 'logs', kind: 'async', label: 'log lines' },
    { id: 'feed-metrics', from: 'feed', to: 'metrics', kind: 'async', label: 'counts' },
    { id: 'feed-traces', from: 'feed', to: 'traces', kind: 'async', label: 'spans' },
    { id: 'metrics-alerting', from: 'metrics', to: 'alerting', kind: 'async', label: 'error rate' },
    { id: 'alerting-oncall', from: 'alerting', to: 'oncall', kind: 'async', label: 'page' },
  ],
  // Phones: metrics, alerting and on-call straight down from the feed service, with logs and traces to the sides.
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      feed: { x: 1, y: 0 },
      metrics: { x: 1, y: 1 },
      logs: { x: 0, y: 2 },
      alerting: { x: 1, y: 2 },
      traces: { x: 2, y: 2 },
      oncall: { x: 1, y: 3 },
    },
    sides: { 'feed-logs': { fromSide: 'left', toSide: 'top' }, 'feed-traces': { fromSide: 'right', toSide: 'top' } },
  },
  steps: [
    {
      caption: 'Every Snapgram service sends its telemetry to three stores, in the background, so recording it never slows a user’s request down.',
      flow: [['feed-logs', 'feed-metrics', 'feed-traces']],
    },
    {
      caption: 'Log lines and spans are detailed and bulky. The **log store** keeps them for days or weeks, and the **trace store** keeps only the sampled traces.',
      flow: [['feed-logs', 'feed-traces']],
    },
    {
      caption:
        'Metrics are small, so the **metrics store** keeps them for months. Dashboards read them, and so does the **alerting** service, which checks the feed’s error rate every minute.',
      flow: ['feed-metrics', 'metrics-alerting'],
    },
    {
      caption: 'When the feed fails too often for too long, the alerting service pages the **on-call engineer**, who starts at a dashboard, moves to traces and ends in the logs.',
      flow: ['metrics-alerting', 'alerting-oncall'],
      notes: [{ target: 'oncall', text: 'paged', tone: 'alert' }],
    },
  ],
};

/** A trace ID travelling with every call, and spans reported in the background. */
const tracedRequest: SequenceSpec = {
  actors: [
    { id: 'app', type: 'client', label: 'Snapgram app' },
    { id: 'gw', type: 'gateway', label: 'API gateway' },
    { id: 'feed', type: 'service', label: 'Feed service' },
    { id: 'sugg', type: 'service', label: 'Suggestions' },
    { id: 'store', type: 'nosqlDb', label: 'Trace store' },
  ],
  groups: [{ label: 'One trace ID', from: 1, to: 4 }],
  messages: [
    {
      from: 'app',
      to: 'gw',
      label: 'GET /feed',
      kind: 'sync',
      caption: 'Maya opens her feed. The gateway starts a trace: it picks a random trace ID and opens the root span.',
    },
    {
      from: 'gw',
      to: 'feed',
      label: 'build feed + trace ID',
      kind: 'sync',
      caption: 'The call to the feed service carries the trace ID in a header, so the feed service’s span joins the same trace as a child of the gateway’s.',
    },
    {
      from: 'feed',
      to: 'sugg',
      label: 'suggest + trace ID',
      kind: 'sync',
      caption: 'The feed service calls suggestions, alongside the cache, the posts database and ranking (not shown), and every call carries the same trace ID.',
    },
    {
      from: 'sugg',
      to: 'feed',
      label: 'accounts, 300 ms',
      kind: 'reply',
      caption: 'Suggestions answers after about 300 ms (illustrative). The feed service cannot finish before it does, so its span stretches too, and so does the gateway’s.',
    },
    {
      from: 'feed',
      to: 'store',
      label: 'finished spans',
      kind: 'async',
      caption: 'In the background, each service sends its finished spans to the trace store, which joins them by trace ID into one waterfall.',
    },
  ],
};

const lesson: Lesson = {
  id: 'observability',
  module: 'm7',
  order: 1,
  title: 'Observability',
  idea: 'Observability means your running system tells you what it is doing and why, through logs, metrics and traces, so you can find a slow call in minutes and get paged only when users are actually hurting.',
  minutes: 15,
  prerequisites: ['availability-nines', 'percentiles-tail-latency'],
  outcomes: [
    'Explain what logs, metrics and traces each answer, and read a trace waterfall to find the call that makes a request slow.',
    'Watch a service through the four golden signals: latency, traffic, errors and saturation.',
    'Design alerts that fire when a service level objective (SLO) is at risk, not on every blip.',
  ],
  analogy: {
    title: 'The car dashboard',
    body: 'A car’s dashboard does not show everything happening in the engine. It shows a few gauges that matter, such as speed, fuel and temperature, and a warning light comes on only when something needs you. When the light comes on, a mechanic plugs in a reader to see the detailed record of what each part did.\n\nObservability works the same way. Metrics are the gauges, alerts are the warning lights, and logs and traces are the mechanic’s detailed record. A good dashboard is quiet when the car is fine and impossible to miss when it is not.',
  },
  whyItMatters:
    'Snapgram now serves about 100 million daily users through dozens of services. One week, complaints pile up: the home feed sometimes hangs for a second or more, and Maya in Singapore says it happens to her several times a day. Yet the team’s dashboards look normal, with a flat [[average|mean]] latency and almost no errors.\n\nThe averages hide the problem. Only a small share of feed loads is slow, each one touches about ten services, and nobody can say which one is to blame. Meanwhile the [[on-call|on-call]] engineer is paged several times a night for brief spikes that no user noticed. The team has plenty of numbers but cannot answer the one question that matters: why is this request slow?',
  body: [
    {
      kind: 'prose',
      md: '[[Observability|observability]] is how well you can tell what a running system is doing, and why, from what it sends out about itself. That output is called [[telemetry|telemetry]], and it comes in three kinds: logs, metrics and traces.',
    },
    { kind: 'heading', text: 'Logs, metrics and traces' },
    {
      kind: 'prose',
      md: 'A [[log line|log-line]] records one event: a finished request, an error, a sign-in. Written as named fields rather than free sentences, which is called [[structured logging|structured-logging]], logs can be searched like `service=feed status=500`. They carry the most detail and cost the most: at Snapgram’s size, one line per request means billions of lines a day (ballpark).',
    },
    {
      kind: 'prose',
      md: 'A [[metric|metric]] is a number tracked over time, such as feed requests per second or the share that fail. Services count in memory and send a few numbers every few seconds, so metrics stay cheap however busy things get, and [[dashboards|dashboard]] are built from them. The price is detail: a metric says the error rate rose, not which request failed or why.',
    },
    {
      kind: 'prose',
      md: 'A trace follows one request through every service it touches. With [[distributed tracing|distributed-tracing]], the first service gives the request a trace identifier (ID), and each service records [[spans|span]], timed steps such as a call or a query, tagged with that ID. Keeping every trace costs too much, so teams keep a [[sample|trace-sampling]], such as one request in a hundred plus every slow or failed one.',
    },
    {
      kind: 'table',
      columns: ['Signal', 'Answers', 'Snapgram example'],
      rows: [
        ['Logs', 'What exactly happened in this one event?', '`feed request failed: posts query timed out`'],
        ['Metrics', 'How much, how fast and how often, across all traffic?', 'Feed p99 latency rose to 1.4 s at 9 p.m.'],
        ['Traces', 'Where did this one request spend its time?', 'The feed waited 300 ms for suggestions'],
      ],
      caption: 'Most investigations start with a metric, narrow down with a trace and end in the logs.',
    },
    {
      kind: 'diagram',
      title: 'Where telemetry goes',
      caption: 'Every service sends three kinds of telemetry to three stores. Step through how each is used.',
      spec: pipeline,
    },
    { kind: 'heading', text: 'Reading a trace' },
    {
      kind: 'prose',
      md: 'For a trace to cover several services, each service must pass the trace ID along on every call it makes, usually in a header. This is [[context propagation|context-propagation]], and one service that forgets it breaks the chain.',
    },
    {
      kind: 'sequence',
      title: 'One feed request, traced',
      caption: 'The trace ID travels with every call, and each service reports its own spans.',
      spec: tracedRequest,
    },
    {
      kind: 'prose',
      md: 'The trace store draws the spans as a waterfall: one bar per span, starting when the span began, as long as it lasted, and nested under the span that called it. Calls made one after another form a staircase, and calls made in parallel overlap. A request is only as fast as its [[critical path|critical-path]]: the chain of spans that finishes last, where every extra millisecond makes the whole request a millisecond slower.',
    },
    {
      kind: 'prose',
      md: 'Two habits help. Read each span’s own time, not just its length, because a parent waiting on a slow child looks slow too. And check whether a slow span is on the critical path at all, since a call running alongside a longer one can slow down, up to a point, without anyone noticing.',
    },
    { kind: 'heading', text: 'The four golden signals' },
    {
      kind: 'prose',
      md: 'A dashboard with two hundred charts hides the one that matters. Google’s site reliability engineering (SRE) book says that if you can watch only four metrics of a user-facing system, watch the [[four golden signals|golden-signals]]: latency, traffic, errors and [[saturation|saturation]].',
    },
    {
      kind: 'table',
      columns: ['Signal', 'The question', 'Feed service (illustrative)'],
      rows: [
        [
          'Latency',
          'How long do requests take? Read it at the 50th and 99th [[percentiles|percentile]], and keep failed requests separate, since fast errors flatter the numbers.',
          'p50 120 ms, p99 1.4 s',
        ],
        ['Traffic', 'How much demand is there, in the unit that matters for this system?', 'About 35,000 feed loads per second at peak'],
        ['Errors', 'What share of requests fail, counting answers that are wrong or too slow?', '0.05% of feed loads fail'],
        ['Saturation', 'How full is the most constrained resource, such as processors, memory or a queue?', 'Ranking servers at 85% of processor capacity'],
      ],
      caption:
        'Latency and errors say users are hurting, and traffic says whether demand changed. Saturation warns you before the hurting starts, because most systems slow down well before a resource is 100% busy.',
    },
    { kind: 'heading', text: 'Alerts that fire for the right reasons' },
    {
      kind: 'prose',
      md: 'An [[alert|alert]] that wakes someone at 3 a.m. should mean users are hurting, or soon will be, and that a person can act. Alerting on causes, such as one server’s processor running hot, pages people for problems no user feels, and people paged for nothing learn to ignore pages. Alert on symptoms instead, and the best symptom is your [[SLO|slo]].',
    },
    {
      kind: 'prose',
      md: 'As [Availability and the nines](lesson:availability-nines) showed, an SLO of 99.9% of feed loads succeeding over 30 days leaves an [[error budget|error-budget]] of 0.1%. What matters is how fast you spend it, the [[burn rate|burn-rate]]. At a burn rate of 1 the budget lasts exactly 30 days; at 14.4 it is gone in about two.',
    },
    {
      kind: 'numbers',
      items: [
        { label: 'Page someone', value: 'Burn rate 14.4 for 1 hour', note: '2% of the 30-day budget gone in an hour' },
        { label: 'Page someone', value: 'Burn rate 6 for 6 hours', note: '5% of the budget gone' },
        { label: 'Open a ticket', value: 'Burn rate 1 for 3 days', note: '10% of the budget gone' },
      ],
      caption:
        'Starting thresholds from Google’s SRE workbook for a 99.9% SLO. Each alert also checks a short window, such as the last 5 minutes for the 1-hour alert, so it stops soon after the problem does.',
    },
    {
      kind: 'prose',
      md: 'Compare that with paging whenever errors pass 0.1% for ten minutes. That rule catches everything, but mostly noise: ten such minutes use about 0.02% of the month’s budget. Burn-rate alerts page for fast burns, file tickets for slow leaks and stay quiet through blips.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson leaves out how metrics are stored, profiling (finding which functions use the processor) and the details of sampling. Its trace is simplified too: real feed requests touch more services.',
    },
  ],
  tryIt: [
    {
      kind: 'prose',
      md: 'Here is one Snapgram feed request, traced. Make the suggestions service 20 ms slower, then 200 ms slower, and watch when the total starts to move. Try the same with the posts database. Then make the feature store lose a reply and compare a 100 ms [[timeout|timeout]] with a 300 ms one.',
    },
    {
      kind: 'widget',
      id: 'trace-waterfall',
      title: 'One feed request, traced',
      caption: 'Select a span to read its timing, then break one call: slow it down, or lose a reply so the caller retries after a timeout. Timings are illustrative.',
      props: { target: 'suggestions', fault: 'none' },
    },
  ],
  tradeoffs: {
    caption: 'The three signals, and paging on the SLO’s burn rate.',
    rows: [
      {
        option: 'Logs',
        goodAt: 'Full detail about individual events, and easy to add.',
        badAt: 'Costly to store and search at scale, and poor at showing trends.',
        pickWhen: 'Debugging one specific failure, or keeping an audit trail.',
      },
      {
        option: 'Metrics',
        goodAt: 'Cheap, fast to query, and the basis of dashboards and alerts.',
        badAt: 'No per-request detail, and labels with many values blow up the cost.',
        pickWhen: 'Watching health over time and deciding when to page.',
      },
      {
        option: 'Traces',
        goodAt: 'Show where one request’s time went across many services.',
        badAt: 'Every service must pass the trace ID along, and most traces are sampled away.',
        pickWhen: 'Finding the slow or failing call in a request that crosses services.',
      },
      {
        option: 'Alerts on burn rate',
        goodAt: 'Page only when users are hurting fast enough to threaten the target.',
        badAt: 'Need a well-chosen SLO, and miss problems too small to move it.',
        pickWhen: 'Paging for any user-facing service; keep cause alerts for definite dangers, such as a disk about to fill.',
      },
    ],
  },
  realWorld: {
    title: 'Google’s four golden signals',
    body: 'In the monitoring chapter of Google’s Site Reliability Engineering book, Rob Ewaschuk names the four golden signals: latency, traffic, errors and saturation. If you can measure only four metrics of a user-facing system, the chapter says, focus on these. It also advises tracking the latency of failed requests separately, because fast errors make latency look better than it is.\n\nThe same chapter asks that every page be actionable and about a symptom, with causes watched only when they are definite and imminent. Google’s later SRE workbook turns that advice into the burn-rate alerts shown above.',
    sourceUrl: 'https://sre.google/sre-book/monitoring-distributed-systems/',
    sourceLabel: 'Rob Ewaschuk, “Monitoring Distributed Systems,” in Site Reliability Engineering (Google)',
  },
  interview: {
    whenToMention:
      'Near the end of almost any design, or when the interviewer asks how you would know the system is healthy. Name the golden signals for the main path, say requests are traced across services, and say you would page on SLO burn rate. Thirty seconds of this shows you have run systems, not just drawn them.',
    sayItLikeThis: [
      'For the feed I’d watch the four golden signals: p50 and p99 latency, requests per second, error rate, and saturation of the ranking tier.',
      'The gateway gives every request a trace ID that each service passes on, so when p99 jumps we open a slow trace and look at its critical path.',
      'I’d page on SLO burn rate, say 2% of the monthly error budget gone in an hour, and send slower burns to a ticket queue.',
    ],
    followUps: [
      {
        q: 'Averages look fine but users complain. What do you do?',
        a: 'Look at the percentiles, because a 100 ms average can hide a one-second p99. Then pull traces from the slow tail, compare them with fast ones and find the span whose own time grew. Its logs, found by trace ID, usually say why.',
      },
      {
        q: 'Tracing every request is expensive. How do you keep the cost down?',
        a: 'Sample: keep a small share of ordinary requests, such as one in a hundred, plus every slow or failed one, which means deciding after the request finishes. Metrics still count every request, so the numbers stay exact while traces stay affordable.',
      },
      {
        q: 'How do you avoid alert fatigue?',
        a: 'Page only on symptoms users feel, tied to the SLO, with burn-rate thresholds over a long and a short window so blips do not page and alerts clear quickly. Anything that does not need a person right now becomes a ticket, and pages nobody acted on get deleted.',
      },
    ],
    redFlags: [
      'Saying “we’ll add monitoring” without saying what is measured or who gets paged.',
      'Reporting latency as an average, which hides the slow tail.',
      'Paging on every resource spike, which teaches the on-call engineer to ignore pages.',
    ],
  },
  mistakes: [
    '**Watching averages.** The mean hides the slow tail, so a dashboard can look calm while one feed load in a hundred takes seconds.',
    '**Alerting on causes.** Pages for resource spikes that users never feel train people to ignore the pager, until they ignore a real outage.',
    '**Logs without a trace ID.** Without a shared request identifier, matching one request’s log lines across ten services is guesswork.',
    '**A label for every user.** Each distinct label value becomes its own series, so labeling a metric by user ID makes its cost grow with your user count.',
    '**One service left untraced.** A service that does not pass the trace ID along breaks the chain, and its time shows up as an unexplained gap.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'The feed’s average latency is a steady 120 ms, yet users say the feed often hangs. What should you look at first?',
      options: [
        {
          text: 'The p99 latency of feed requests',
          correct: true,
          why: 'The slow tail lives in the high percentiles, and an average can stay flat while one request in a hundred takes seconds.',
        },
        {
          text: 'Requests per second',
          correct: false,
          why: 'Traffic tells you how much demand there is, not how the slowest requests feel.',
        },
        {
          text: 'The average latency of each server',
          correct: false,
          why: 'These are still averages, so they hide the slow tail for the same reason.',
        },
        {
          text: 'Processor use on the feed servers',
          correct: false,
          why: 'That is a possible cause, but it does not show whether users are hurting. Start from the symptom.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these are among the four golden signals?',
      options: [
        { text: 'Latency', correct: true, why: 'How long requests take, read at percentiles.' },
        { text: 'Traffic', correct: true, why: 'How much demand the system is under, such as requests per second.' },
        { text: 'Errors', correct: true, why: 'The share of requests that fail, including wrong or too-slow answers.' },
        { text: 'Saturation', correct: true, why: 'How full the most constrained resource is, which warns you before users feel it.' },
        { text: 'Number of servers', correct: false, why: 'A fact about capacity, not a signal of how the service is doing.' },
        { text: 'Log lines written per second', correct: false, why: 'Log volume rises and falls for many reasons and says little about what users feel.' },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'The feed’s SLO (service level objective) is 99.9% of requests succeeding over 30 days. Over the last hour, 1.44% of feed requests failed. What is the burn rate?',
      answer: 14.4,
      unit: 'times',
      tolerance: 1.1,
      solution: [
        'The error budget is 100% − 99.9% = 0.1% of requests.',
        'The burn rate compares the actual error rate with the budget: 1.44% ÷ 0.1% = 14.4.',
        'At that pace the 30-day budget is gone in 30 ÷ 14.4, about 2 days, which is fast enough to page someone.',
      ],
    },
    {
      kind: 'single',
      prompt:
        'In a feed trace, the suggestions call takes 60 ms and runs alongside a chain of calls that takes 85 ms; both start together. Suggestions gets 20 ms slower. What happens to the request’s total time?',
      options: [
        {
          text: 'Nothing: suggestions still finishes before the longer chain',
          correct: true,
          why: 'It had 25 ms of slack, so 20 ms more keeps it off the critical path.',
        },
        { text: 'It grows by 20 ms', correct: false, why: 'That would be true only if suggestions were on the critical path.' },
        { text: 'It grows by 80 ms', correct: false, why: 'Parallel calls do not add up; the request waits only for the slowest one.' },
        { text: 'It gets shorter', correct: false, why: 'Slowing a call down can never make the request faster.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'A burn-rate page fires for the feed. Put a sensible investigation in order.',
      items: [
        'Confirm on the SLO dashboard that users are affected',
        'Check the golden signals to see what changed and when',
        'Open traces from slow or failed requests',
        'Find the span on the critical path whose own time grew',
        'Search that service’s logs by trace ID for the cause',
      ],
      why: 'Start broad and cheap, then narrow down: metrics show that something is wrong, traces show where, and logs show why.',
    },
  ],
  takeaways: [
    'Metrics tell you that something is wrong, traces tell you where, and logs tell you why.',
    'Watch latency, traffic, errors and saturation, and read latency as percentiles, never as an average alone.',
    'Page on the SLO’s burn rate, so alerts fire when users are hurting and stay quiet through blips.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Burn-rate alerts in detail.** Google’s SRE workbook chapter [Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/) moves from simple alerts to ones that check two windows and several burn rates, judging each by precision, recall, detection time and reset time. It shows that paging whenever the 10-minute error rate crosses the SLO threshold could, in the extreme, mean 144 pages a day while the SLO is still met.',
    },
    {
      kind: 'prose',
      md: '**Head and tail sampling.** Deciding to keep a trace when the request starts is cheap, but it keeps slow requests only by luck. Tail-based sampling holds every span until the request ends and keeps the slow and failed traces, at the cost of a buffering tier.',
    },
    {
      kind: 'prose',
      md: '**High-cardinality labels.** Every distinct combination of a metric’s labels is stored as its own series, so the number of distinct values, its [[cardinality|cardinality]], drives the cost. Per-user and per-request detail belongs in logs and traces.',
    },
    {
      kind: 'prose',
      md: '**One standard for all three.** [[OpenTelemetry|opentelemetry]] is an open standard and set of libraries for producing traces, metrics and logs. Its [documentation on traces](https://opentelemetry.io/docs/concepts/signals/traces/) defines a span by its name, parent, start and end times, attributes and status, and calls context propagation the core concept behind distributed tracing.',
    },
  ],
  flashcards: [
    {
      front: 'What do logs, metrics and traces each tell you?',
      back: 'Metrics show that something changed across all traffic, traces show where one request spent its time, and logs record the details of single events.',
    },
    { front: 'What are the four golden signals?', back: 'Latency, traffic, errors and saturation: the four metrics to watch on any user-facing service.' },
    { front: 'What is a span?', back: 'One timed step inside a trace, such as a service call or a query, with a start time, a duration and a parent span.' },
    {
      front: 'What is the critical path of a request?',
      back: 'The chain of spans that sets the total time. Speeding up anything off it does not make the request faster.',
    },
    {
      front: 'How does a trace ID get from one service to the next?',
      back: 'Each service passes it along, usually in a header, on every call it makes. This is called context propagation.',
    },
    {
      front: 'What is a burn rate?',
      back: 'How fast a service spends its error budget compared with the pace that would use it up exactly at the end of the SLO window.',
    },
    {
      front: 'Why alert on symptoms rather than causes?',
      back: 'Symptoms are what users feel, so every page matters. Causes such as resource spikes often hurt nobody and teach people to ignore pages.',
    },
  ],
  related: ['percentiles-tail-latency', 'availability-nines', 'timeouts-retries-backoff', 'circuit-breakers', 'service-communication', 'zero-downtime-deploys'],
  glossaryTerms: [
    'mean',
    'on-call',
    'observability',
    'telemetry',
    'log-line',
    'structured-logging',
    'metric',
    'dashboard',
    'distributed-tracing',
    'span',
    'trace-sampling',
    'context-propagation',
    'critical-path',
    'golden-signals',
    'saturation',
    'percentile',
    'alert',
    'slo',
    'error-budget',
    'burn-rate',
    'timeout',
    'cardinality',
    'opentelemetry',
  ],
};

export default lesson;
