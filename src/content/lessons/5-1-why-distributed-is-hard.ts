import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** One photo upload fans out to five more services, and the thumbnail call goes silent. */
const upload: DiagramSpec = {
  grid: { cols: 3, rows: 5 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Maya’s phone', x: 0, y: 2 },
    { id: 'upload', type: 'service', label: 'Upload service', x: 1, y: 2 },
    { id: 'storage', type: 'objectStore', label: 'Photo storage', x: 2, y: 0 },
    { id: 'thumbs', type: 'service', label: 'Thumbnail service', x: 2, y: 1 },
    { id: 'feed', type: 'service', label: 'Feed service', x: 2, y: 2 },
    { id: 'notify', type: 'service', label: 'Notifications', x: 2, y: 3 },
    { id: 'search', type: 'service', label: 'Search indexer', x: 2, y: 4 },
  ],
  edges: [
    { id: 'phone-upload', from: 'phone', to: 'upload', kind: 'sync' },
    { id: 'upload-storage', from: 'upload', to: 'storage', kind: 'sync' },
    { id: 'upload-thumbs', from: 'upload', to: 'thumbs', kind: 'sync' },
    { id: 'upload-feed', from: 'upload', to: 'feed', kind: 'sync' },
    { id: 'upload-notify', from: 'upload', to: 'notify', kind: 'async' },
    { id: 'upload-search', from: 'upload', to: 'search', kind: 'async' },
  ],
  // Phones: the phone above the upload service, with the five services around it in the wide layout's order.
  narrow: {
    grid: { cols: 3, rows: 3 },
    positions: {
      phone: { x: 1, y: 0 },
      storage: { x: 0, y: 1 },
      upload: { x: 1, y: 1 },
      thumbs: { x: 2, y: 1 },
      feed: { x: 0, y: 2 },
      notify: { x: 1, y: 2 },
      search: { x: 2, y: 2 },
    },
  },
  steps: [
    {
      caption:
        'Maya uploads a photo. The **upload service** saves it and calls five other services, each a separate program on its own machines, reached over the network.',
      flow: ['phone-upload', ['upload-storage', 'upload-thumbs', 'upload-feed', 'upload-notify', 'upload-search']],
    },
    {
      caption:
        'Photo storage and the feed service answer within a few milliseconds (ballpark). The **thumbnail service** sends nothing back, and after two seconds the upload service’s timeout fires.',
      flow: [['<upload-storage', '<upload-feed']],
      notes: [{ target: 'upload-thumbs', text: 'timed out', tone: 'alert' }],
    },
    {
      caption:
        'From where the upload service sits, three different situations look exactly the same. The request may have been lost on the way, the thumbnail service may have crashed partway through, or it may have made the thumbnails and only the reply was lost.',
      focus: ['upload', 'thumbs', 'upload-thumbs'],
      notes: [{ target: 'thumbs', text: 'done or not?', tone: 'alert' }],
    },
    {
      caption:
        'Meanwhile, everything else works: the photo is stored and shows up in followers’ feeds. One part is in trouble, the rest carries on, and nobody can be sure which part is which.',
      focus: ['phone', 'upload', 'storage', 'feed', 'notify', 'search'],
      notes: [{ target: 'feed', text: 'photo shows', tone: 'signal' }],
    },
    {
      caption:
        'The upload service has to choose without knowing: call again and perhaps make the thumbnails twice, or give up and perhaps have none. Making a thumbnail twice is harmless, so it retries, and this time the answer comes back.',
      flow: ['upload-thumbs', '<upload-thumbs'],
      notes: [{ target: 'thumbs', text: 'retry works', tone: 'signal' }],
    },
  ],
};

/** What the network can do to three calls: deliver, lose the reply (so a retry duplicates the work), delay. */
const network: SequenceSpec = {
  actors: [
    { id: 'upload', type: 'service', label: 'Upload service' },
    { id: 'thumbs', type: 'service', label: 'Thumbnail service' },
  ],
  groups: [
    { label: 'Reply lost', from: 1, to: 4 },
    { label: 'Delayed', from: 5, to: 7 },
  ],
  messages: [
    {
      from: 'upload',
      to: 'thumbs',
      label: 'Photo 42',
      kind: 'sync',
      caption: 'The upload service asks for thumbnails. The request arrives, and the thumbnails are made.',
    },
    {
      from: 'thumbs',
      to: 'upload',
      label: 'Done',
      kind: 'reply',
      lost: true,
      caption: 'A congested router drops the reply. The work is done, but the upload service hears nothing, which looks exactly like a lost request.',
    },
    {
      from: 'upload',
      to: 'thumbs',
      label: 'Photo 42, retry',
      kind: 'sync',
      caption: 'After its timeout, the upload service sends the request again, and the thumbnail service makes the same thumbnails a second time: a duplicate.',
    },
    {
      from: 'thumbs',
      to: 'upload',
      label: 'Done',
      kind: 'reply',
      caption: 'This reply arrives. Doing the work twice was harmless here, but it would not be if the request said “charge the card”.',
    },
    {
      from: 'upload',
      to: 'thumbs',
      label: 'Photo 43',
      kind: 'sync',
      caption: 'This request is not lost, only stuck behind a burst of traffic for three seconds, longer than the timeout.',
    },
    {
      from: 'upload',
      to: 'thumbs',
      label: 'Photo 43, retry',
      kind: 'sync',
      caption: 'The timeout fires, so the upload service sends a retry, which overtakes the stuck original.',
    },
    {
      from: 'thumbs',
      to: 'upload',
      label: 'Done, twice',
      kind: 'reply',
      caption: 'Both copies arrive, the retry first. The work happens twice, and in a different order from the one the requests were sent in.',
    },
  ],
};

const lesson: Lesson = {
  id: 'why-distributed-is-hard',
  module: 'm5',
  order: 1,
  title: 'Why distributed systems are hard',
  idea: 'In a system spread across many machines, some parts fail while the rest keeps running, and a call that gets no answer may have failed, succeeded or not arrived yet, so every design has to plan for that doubt.',
  minutes: 15,
  prerequisites: ['latency-numbers', 'replication'],
  outcomes: [
    'Explain partial failure, and why a timeout cannot tell you whether a request took effect.',
    'Describe how a network loses, delays, duplicates and reorders messages, and what that means for retries.',
    'Name the fallacies of distributed computing and spot them in a design.',
  ],
  analogy: {
    title: 'A group project over text messages',
    body: 'Picture a group project run entirely over text messages, on a patchy phone network. You ask a teammate to make the slides and hear nothing back. The message may never have arrived, they may have made the slides with their reply stuck somewhere, or they may simply be busy.\n\nYou cannot tell which, so you have to choose: ask again and risk two sets of slides, or wait and risk none. Texts also arrive late, twice or out of order, so a “never mind” can land before the request it cancels. Computers that cooperate over a network live with exactly this.',
  },
  whyItMatters:
    'Snapgram now has about 30 million daily users. The single server in Oregon from the first lessons has become dozens of [[microservices|microservices]], running in two [[regions|region]], Oregon and Singapore, and talking to each other over the network. A single photo upload touches six of them: upload, storage, thumbnails, the feed, notifications and search.\n\nOne evening, the upload service calls the thumbnail service and hears nothing back within its two-second [[timeout|timeout]]. Maybe the thumbnail service crashed before starting, maybe it made the thumbnails and only the reply was lost, or maybe it is still working. The upload service cannot tell which, and whatever it does next, retry or give up, could be wrong.',
  body: [
    {
      kind: 'prose',
      md: 'On one computer, failure is mostly all or nothing. If the machine dies, every part of the program dies with it, and when it restarts you know where you stand. A function call either returns or the whole program crashes; there is no third option.',
    },
    {
      kind: 'prose',
      md: 'Snapgram is now a [[distributed system|distributed-system]]: many machines working together over a network, each able to fail on its own. A disk dies, a process crashes, or a [[network partition|network-partition]] splits the machines into groups that cannot reach each other, and the rest keeps running. Calls between machines gain a third outcome besides success and error: silence.',
    },
    {
      kind: 'diagram',
      title: 'One upload, six services',
      caption: 'A photo upload fans out across the network. Step through what happens when one call goes silent.',
      spec: upload,
    },
    { kind: 'heading', text: 'Partial failure' },
    {
      kind: 'prose',
      md: 'What you just saw is a [[partial failure|partial-failure]]: one part of the system failing while the rest carries on. The hard part is not the failure itself but the doubt. From the outside, a crashed service, a slow service and a cut network link all look like the same silence, so the caller cannot tell whether to wait, retry or give up.',
    },
    { kind: 'heading', text: 'The network is unreliable' },
    {
      kind: 'prose',
      md: 'Between two machines, a message travels as [[packets|packet]] through cables, switches and routers, any of which can be busy or broken. So a message can be:\n\n- **Lost:** a congested router drops it, or a cable is cut.\n- **Delayed:** it waits in a queue behind a burst of traffic, for milliseconds or for seconds.\n- **Duplicated:** a sender that heard nothing sends it again, and both copies arrive.\n- **Reordered:** a later message overtakes an earlier one.',
    },
    {
      kind: 'prose',
      md: 'The [[Transmission Control Protocol|tcp]] (TCP) hides some of this. Within one connection it numbers the data and uses [[retransmission|retransmission]] to resend anything lost, so the bytes arrive complete and in order. But it cannot help when the machine at the other end crashes, the connection breaks, or a reply is lost after the work is done.',
    },
    {
      kind: 'sequence',
      title: 'Lost, duplicated and delayed',
      caption: 'Two calls from the upload service to the thumbnail service. Step through what the network can do to each one.',
      spec: network,
    },
    {
      kind: 'prose',
      md: 'A timeout is the caller’s only tool: wait this long, then assume something went wrong. But a timeout tells you only that no answer arrived in time, not what happened. The request may never have arrived, the work may have failed, the work may have succeeded with the reply lost, or the answer may still be on its way.',
    },
    { kind: 'heading', text: 'Retry or give up' },
    {
      kind: 'prose',
      md: 'After a timeout, every choice is a bet. Retry, and the work may happen twice: that is [[at-least-once|at-least-once]] behavior. Give up, and it may never happen at all: [[at-most-once|at-most-once]]. A thumbnail made twice costs a little computing time while a card charged twice costs a customer’s trust, so the right bet depends on the operation, and [Idempotency](lesson:idempotency) shows how to make repeating safe.',
    },
    { kind: 'heading', text: 'The fallacies of distributed computing' },
    {
      kind: 'prose',
      md: 'In the 1990s, engineers at Sun Microsystems wrote down eight assumptions that people new to distributed systems tend to make without noticing. They became known as the [[fallacies of distributed computing|fallacies-of-distributed-computing]], because every one of them is false. Each lesson in this module deals with the fallout of at least one.',
    },
    {
      kind: 'table',
      columns: ['The assumption', 'What is really true'],
      rows: [
        ['The network is reliable', 'Messages are lost, delayed and duplicated, and links fail.'],
        ['Latency is zero', 'Every call costs a [[round trip|round-trip-time]]: under a millisecond inside a data center, about 150 to 200 ms across the Pacific (ballpark).'],
        ['Bandwidth is infinite', 'Links have limits, and big transfers crowd out small messages.'],
        ['The network is secure', 'Anyone on the path may read or change traffic that is not encrypted.'],
        ['Topology doesn’t change', 'Machines, routes and addresses change all the time, as servers come and go.'],
        ['There is one administrator', 'Different teams and companies run different parts, with different rules.'],
        ['Transport cost is zero', 'Moving data costs money and processor time.'],
        ['The network is homogeneous', 'It mixes every kind of device, link and protocol, like Maya’s phone hopping between Wi-Fi and a mobile network.'],
      ],
      caption: 'The eight fallacies, and what is true instead.',
    },
    {
      kind: 'prose',
      md: 'Two more surprises sit outside the list. Every machine keeps its own clock, and clocks drift apart, so timestamps from two machines can disagree; that [[clock skew|clock-skew]] is the subject of [Time and ordering](lesson:time-and-ordering). And a program can freeze for a moment in a [[process pause|process-pause]], during garbage collection for example, then carry on as if nothing happened, after everyone else has decided it was dead.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson treats a machine as working, slow or stopped. Real machines can also be half-broken, passing health checks while failing real work, or can send wrong answers, and there are formal results proving that some of these problems have no perfect solution. Go deeper touches on both.',
    },
  ],
  tradeoffs: {
    caption: 'When a call times out, the caller has to pick a strategy.',
    rows: [
      {
        option: 'Give up (at-most-once)',
        goodAt: 'Never does the work twice.',
        badAt: 'The work may never happen, and the user may see an error for something that actually succeeded.',
        pickWhen: 'Losing the occasional message is fine, such as a view counter or a best-effort notification.',
      },
      {
        option: 'Retry (at-least-once)',
        goodAt: 'The work almost always happens in the end.',
        badAt: 'It may happen twice, so it is only safe for operations that can be repeated.',
        pickWhen: 'Repeating is harmless, such as making a thumbnail or setting a caption.',
      },
      {
        option: 'Retry with an idempotency key',
        goodAt: 'The effect happens once, even if the request arrives twice.',
        badAt: 'The server must store keys and results, and handle two copies arriving at once.',
        pickWhen: 'Repeating would hurt: payments, orders, sending email.',
      },
      {
        option: 'Check first, then decide',
        goodAt: 'Asks the other side whether the work happened before acting again.',
        badAt: 'Needs a way to look the operation up, and the check itself can time out.',
        pickWhen: 'There is a natural identifier to look up, such as an order number, and retries are rare.',
      },
    ],
  },
  realWorld: {
    title: 'Amazon’s eight failure modes',
    body: 'In the Amazon Builders’ Library, Jacob Gabrielson of Amazon Web Services (AWS) breaks a single request and its reply into steps that can each fail on their own. He lists eight: the request may fail to be sent or to be delivered, the server may reject it or fail to update its state, the reply may fail to be sent or to be delivered, and the client may reject the reply or fail to update its own state.\n\nHe sorts the result of every network call into five outcomes: the request failed to post, a retryable error, a fatal error, unknown, and success. Unknown is what a timeout gives you, and he calls it the hardest case to handle, because the operation may or may not have happened.',
    sourceUrl: 'https://builder.aws.com/content/3F08f7GPFiZMCgXD8gny6OjxR0Z/challenges-with-distributed-systems',
    sourceLabel: 'Jacob Gabrielson, “Challenges with distributed systems,” Amazon Builders’ Library',
  },
  interview: {
    whenToMention:
      'Whenever your design has services calling each other over a network, which is almost always. When you draw an arrow between two services, say what happens if the call times out: is it safe to retry, or must the caller give up?',
    sayItLikeThis: [
      'A call can fail in ways that look identical to the caller: the request was lost, the work failed, or the work succeeded and only the reply was lost.',
      'Every call gets a timeout, and anything we retry must be safe to repeat: making a thumbnail is, and charging a card needs an idempotency key.',
    ],
    followUps: [
      {
        q: 'Why not just wait longer instead of timing out?',
        a: 'A crashed or cut-off service may never answer, so without a limit the caller and its user wait forever. Long waits also let stuck requests pile up and use every thread the caller has. Pick the timeout from the dependency’s slowest normal responses, so healthy calls rarely hit it.',
      },
      {
        q: 'How can one service tell whether another has crashed or is just slow?',
        a: 'It can’t, not for certain: both look like silence. Systems send [[heartbeats|heartbeat]] and use timeouts to suspect a failure, and accept that they will sometimes declare a slow but healthy machine dead. The design has to stay correct when that guess is wrong.',
      },
      {
        q: 'Doesn’t TCP already make the network reliable?',
        a: 'Only within one connection: it resends lost packets and keeps bytes in order. It cannot help when the other machine crashes, the connection breaks, or the reply is lost after the work is done. Applications still see timeouts and unknown outcomes.',
      },
    ],
    redFlags: [
      'Treating a timeout as proof that the request failed.',
      'Designing chatty flows, such as dozens of calls in a row per page, as if latency were zero.',
      'Retrying everything blindly, including operations like payments that are not safe to repeat.',
    ],
  },
  mistakes: [
    '**Treating a timeout as a failure.** The work may have happened, so code that redoes it can do it twice.',
    '**No timeout at all.** Many client libraries wait forever by default, so one hung service ties up every caller that is waiting on it.',
    '**Designing for the happy path.** A flow that needs all six calls to succeed fails whenever any one of them fails, and at scale one of them always is.',
    '**Forgetting duplicates.** Retries and redelivered messages mean the same request can arrive twice, and handlers that cannot cope corrupt data.',
    '**Treating remote calls like local ones.** Dozens of calls in a row multiply both the waiting and the chances that something fails.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Which of these is one of the fallacies of distributed computing?',
      options: [
        { text: 'The network is reliable', correct: true, why: 'Networks lose, delay and duplicate messages, so assuming otherwise is the first and most famous fallacy.' },
        { text: 'Machines can fail independently', correct: false, why: 'That is true, not a fallacy: one service can crash while the rest keep running.' },
        { text: 'Messages can arrive out of order', correct: false, why: 'That is true as well: a later message can overtake an earlier one.' },
        { text: 'Clocks on different machines can disagree', correct: false, why: 'Also true: every machine keeps its own clock, and they drift apart.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these can happen to a message sent from one Snapgram service to another?',
      options: [
        { text: 'It is lost and never arrives', correct: true, why: 'Congested routers drop packets, and links fail.' },
        { text: 'It arrives seconds late', correct: true, why: 'It can wait in queues behind bursts of traffic, sometimes longer than the sender’s timeout.' },
        { text: 'It arrives twice', correct: true, why: 'A sender that heard nothing retries, and if the first copy was only delayed, both arrive.' },
        {
          text: 'It is guaranteed to arrive within the timeout if the receiver is healthy',
          correct: false,
          why: 'A healthy receiver does not make the network between the two machines reliable or fast.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'The thumbnail service finishes its work, but its reply is lost. Put what happens in order.',
      items: [
        'The upload service sends the request',
        'The thumbnail service makes the thumbnails',
        'The reply is dropped by the network',
        'The upload service’s timeout fires',
        'The upload service retries, and the thumbnails are made again',
      ],
      why: 'The work happened before the loss, so the retry repeats it. That is why anything you retry must be safe to do twice.',
    },
    {
      kind: 'numeric',
      prompt:
        'Maya’s feed screen in Singapore makes 10 calls one after another, each to a service in Oregon, about 170 ms per round trip (ballpark). Ignoring processing time, roughly how long does the screen take to load?',
      answer: 1700,
      unit: 'ms',
      tolerance: 1.1,
      solution: [
        'Each call waits for one full round trip: about 170 ms.',
        'One after another, the waits add up: 10 × 170 ms = 1,700 ms.',
        'Making the calls in parallel, or combining them into one, brings it down to about one round trip.',
      ],
    },
    {
      kind: 'single',
      prompt: 'The upload service treats a timeout from the feed service as proof that the post was not added, and adds it again. What can go wrong?',
      options: [
        {
          text: 'The post may appear twice in followers’ feeds',
          correct: true,
          why: 'The first call may have succeeded with only the reply lost, so adding it again makes a duplicate.',
        },
        { text: 'Nothing, because a timeout means the request failed', correct: false, why: 'A timeout means only that no answer arrived in time, not that the work did not happen.' },
        { text: 'The post will never appear', correct: false, why: 'Retrying makes it more likely to appear, not less; the risk is that it appears twice.' },
        { text: 'The feed service will crash', correct: false, why: 'One extra request does not crash a service; the problem is a duplicate post.' },
      ],
    },
  ],
  takeaways: [
    'In a distributed system, parts fail independently, so some part is usually broken while the rest keeps running.',
    'A timeout tells you only that no answer came in time: the request may have been lost, failed or succeeded.',
    'Networks lose, delay, duplicate and reorder messages, so design every call for those cases instead of trusting the fallacies.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Gray failure.** A component can be broken in a way only some observers notice: it passes its health checks but fails real requests, or it is slow for one region only. These half-failures are often harder to handle than a clean crash, because the system’s own checks say everything is fine.',
    },
    {
      kind: 'prose',
      md: '**The two generals problem.** Two armies must attack at the same time and can only send messengers through enemy land, where any messenger may be caught. Every confirmation needs a confirmation of its own, so no finite exchange of messages makes both sides certain. For the same reason, no protocol can guarantee that two machines agree over an unreliable network, and real systems settle for “almost certainly” plus a way to recover.',
    },
    {
      kind: 'prose',
      md: '**Machines that lie.** This lesson assumes machines are honest: they stop or slow down but never send wrong messages on purpose. Systems that must tolerate machines that lie, such as some blockchains, need far more expensive agreement protocols, with many more messages per decision.',
    },
  ],
  flashcards: [
    { front: 'What is a partial failure?', back: 'Some parts of a system fail while others keep working, often without anyone being sure which parts failed.' },
    {
      front: 'After a timeout, what could have happened to the request?',
      back: 'It was lost, the work failed partway, the work succeeded and the reply was lost, or the answer is still on its way.',
    },
    { front: 'Name four things a network can do to a message.', back: 'Lose it, delay it, duplicate it, or deliver it out of order.' },
    {
      front: 'What are the fallacies of distributed computing?',
      back: 'Eight false assumptions about networks, such as “the network is reliable” and “latency is zero”, that newcomers tend to make.',
    },
    {
      front: 'Why doesn’t TCP make the network reliable for applications?',
      back: 'It resends and orders data within one connection, but cannot help when a machine crashes, a connection breaks, or a reply is lost after the work is done.',
    },
    { front: 'What are your two basic choices after a timeout?', back: 'Retry and risk doing the work twice (at-least-once), or give up and risk it never happening (at-most-once).' },
  ],
  related: ['latency-numbers', 'replication', 'timeouts-retries-backoff', 'idempotency', 'time-and-ordering', 'heartbeats-gossip', 'tcp-vs-udp', 'cap-pacelc'],
  glossaryTerms: [
    'microservices',
    'region',
    'timeout',
    'distributed-system',
    'network-partition',
    'partial-failure',
    'packet',
    'tcp',
    'retransmission',
    'at-least-once',
    'at-most-once',
    'fallacies-of-distributed-computing',
    'round-trip-time',
    'clock-skew',
    'process-pause',
    'heartbeat',
  ],
};

export default lesson;
