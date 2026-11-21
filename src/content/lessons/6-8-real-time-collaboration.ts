import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The main step-through: live edits and cursors flowing through a collaboration service. */
const liveEditing: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'maya', type: 'client', label: 'Maya’s phone', sublabel: 'Singapore', x: 0, y: 0 },
    { id: 'sam', type: 'client', label: 'Sam’s laptop', x: 0, y: 1 },
    { id: 'collab', type: 'service', label: 'Collab service', sublabel: 'owns the album', x: 1, y: 0.5 },
    { id: 'store', type: 'nosqlDb', label: 'Album store', x: 2, y: 0 },
    { id: 'presence', type: 'cache', label: 'Presence', sublabel: 'in memory', x: 2, y: 1 },
  ],
  edges: [
    { id: 'maya-collab', from: 'maya', to: 'collab', kind: 'async' },
    { id: 'sam-collab', from: 'sam', to: 'collab', kind: 'async' },
    { id: 'collab-store', from: 'collab', to: 'store', kind: 'sync' },
    { id: 'collab-presence', from: 'collab', to: 'presence', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Maya and Sam open the shared album. Each app keeps a connection open to the **collab service**, which holds the album description in memory while anyone is editing.',
      flow: [['maya-collab', 'sam-collab']],
    },
    {
      caption: 'Maya types “beach”. Her phone shows it at once and sends the edit, and the service gives it a place in the album’s order and passes it on to Sam.',
      flow: ['maya-collab', '<sam-collab'],
    },
    {
      caption: 'At the same moment, Sam’s “to Bali” arrives, made on the same version as Maya’s edit. The edits crossed, so a merge rule has to decide what happens.',
      flow: ['sam-collab'],
      notes: [{ target: 'collab', text: 'edits crossed', tone: 'alert' }],
    },
    {
      caption: 'The merged result goes back to both apps. Every few seconds the service saves it to the **album store**, so a crash loses at most a few seconds of typing.',
      flow: [['<maya-collab', '<sam-collab'], 'collab-store'],
    },
    {
      caption: 'Cursor moves take a lighter path: the **presence** store keeps each person’s cursor for a few seconds, and the service forwards the moves to everyone in the album.',
      flow: ['maya-collab', 'collab-presence', '<sam-collab'],
      notes: [{ target: 'presence', text: 'short-lived' }],
    },
  ],
};

/** Operational transformation through a central server, with version numbers. */
const otSequence: SequenceSpec = {
  actors: [
    { id: 'maya', type: 'client', label: 'Maya’s phone' },
    { id: 'server', type: 'service', label: 'Collab service' },
    { id: 'sam', type: 'client', label: 'Sam’s laptop' },
  ],
  messages: [
    {
      from: 'maya',
      to: 'server',
      label: 'insert “beach ” at 16',
      kind: 'async',
      caption: 'Maya’s phone applies her edit at once and sends it as an operation, tagged with the version it was made on: version 7.',
    },
    {
      from: 'sam',
      to: 'server',
      label: 'insert “ to Bali” at 20',
      kind: 'async',
      caption: 'Sam’s laptop does the same, also on version 7. Neither has seen the other’s edit yet.',
    },
    {
      from: 'server',
      to: 'sam',
      label: 'insert “beach ” at 16',
      kind: 'async',
      caption: 'Maya’s edit reached the server first, so it becomes version 8 unchanged. Sam’s laptop transforms it against his own pending edit: 16 comes before 20, so it stays at 16.',
    },
    {
      from: 'server',
      to: 'maya',
      label: 'ack: version 8',
      kind: 'reply',
      caption: 'The server tells Maya’s phone that her edit is version 8, so it is no longer pending.',
    },
    {
      from: 'server',
      to: 'maya',
      label: 'insert “ to Bali” at 26',
      kind: 'async',
      caption: 'Sam’s edit was made on version 7, so the server transforms it past version 8. Maya added six characters before position 20, so it moves to 26 and becomes version 9.',
    },
    {
      from: 'server',
      to: 'sam',
      label: 'ack: version 9',
      kind: 'reply',
      caption: 'Sam’s laptop learns that its edit is in. Both copies, and the server, now read “Photos from our beach trip to Bali”.',
    },
  ],
  groups: [{ label: 'Same moment', from: 1, to: 2 }],
};

const lesson: Lesson = {
  id: 'real-time-collaboration',
  module: 'm6',
  order: 8,
  title: 'Real-time collaboration',
  idea: 'When two people edit the same text at once, the system must merge their changes so that neither edit is lost and every copy ends up the same, either by transforming edits or by giving every character its own identity.',
  minutes: 15,
  prerequisites: ['real-time-communication', 'time-and-ordering'],
  outcomes: [
    'Explain why last write wins loses work when two people edit the same text at the same time.',
    'Describe, at the level of intuition, how operational transformation and conflict-free replicated data types (CRDTs) keep both edits and make every copy match.',
    'Design presence, the live cursors and avatars, separately from the document itself.',
  ],
  analogy: {
    title: 'Two pens, one sheet of paper',
    body: 'Picture Maya and Sam leaning over the same sheet of paper, each holding a pen. Maya writes a word in the middle of a sentence while Sam adds a few words at the end. Because they share one page and can see each other’s hands, nothing gets lost: Sam simply writes a little further along.\n\nNow give each of them a photocopy instead, in different cities, and let them swap notes about their changes afterwards. “Add these words at character 20” no longer points to the same place on both copies, and if one copy simply replaces the other, a change disappears. Real-time collaboration is the craft of making many photocopies behave like one sheet of paper.',
  },
  whyItMatters:
    'Snapgram adds shared albums: friends add photos to one album and write its description together, live. Maya, on her phone in Singapore, and her friend Sam, on his laptop, both have the album description open: “Photos from our trip”.\n\nMaya types “beach” before “trip”. In the same half-second, Sam adds “to Bali” at the end. Each app saves the whole description, and the server keeps whichever save has the later timestamp, so Sam’s version replaces Maya’s and her word vanishes. Neither of them is told, and Maya wonders whether she imagined typing it.',
  body: [
    { kind: 'heading', text: 'What live editing needs' },
    {
      kind: 'prose',
      md: 'In a collaborative editor, every keystroke goes out at once over a [[WebSocket|websocket]], the long-lived two-way connection from [Real-time communication](lesson:real-time-communication). Each app applies its own edits immediately, an [[optimistic update|optimistic-update]], because waiting about 200 ms (ballpark, across the Pacific) for the server on every key would feel broken. Edits from others arrive a moment later. The hard part is edits made at the same moment, before either side has seen the other’s: a [[write conflict|write-conflict]].',
    },
    {
      kind: 'diagram',
      title: 'Editing an album together',
      caption: 'Step through two people editing one description, from keystroke to saved copy, plus their cursors.',
      spec: liveEditing,
    },
    { kind: 'heading', text: 'Why last write wins fails here' },
    {
      kind: 'prose',
      md: '[[Last write wins|last-write-wins]] (LWW), which you met in [Time and ordering](lesson:time-and-ordering), settles a conflict by keeping the version with the later timestamp. For a profile photo, that can be fine. For text, it is a disaster: the unit being replaced is the whole description, so one person’s typing disappears even though the two edits touched different words.',
    },
    {
      kind: 'prose',
      md: 'Timestamps make it worse. With [[clock skew|clock-skew]] of a few hundred milliseconds between devices, the “later” edit may really have been the earlier one. What you want instead is a merge that keeps both edits when they are [[concurrent|concurrent-events]], and puts each where its author meant it to go.',
    },
    { kind: 'heading', text: 'Operational transformation' },
    {
      kind: 'prose',
      md: '[[Operational transformation|operational-transformation]] (OT) sends each edit as a small operation instead of the whole text: “insert *beach* at position 16”, “insert *to Bali* at position 20”. The trouble is that positions go stale. Once Maya’s six new characters are in, position 20 on her copy is in the middle of “beach”, so Sam’s operation, applied as it is, would produce “Photos from our beac to Balih trip”.',
    },
    {
      kind: 'prose',
      md: 'So before a copy applies an operation it missed, it transforms it against the ones it already applied. Sam’s insert comes after Maya’s, so it shifts right by the six characters she added, from 20 to 26. Maya’s insert comes before Sam’s, so it stays at 16. Both copies now read “Photos from our beach trip to Bali”.',
    },
    {
      kind: 'sequence',
      title: 'Operational transformation with a central server',
      caption: 'Both edits are made on version 7. The server puts them in one order and transforms the one that arrives second.',
      spec: otSequence,
    },
    {
      kind: 'prose',
      md: 'Most OT systems route every edit through one central server that decides the order, which keeps the transformation rules manageable. Getting those rules right for every pair of edits, including deletes, formatting and undo, is famously hard, and that difficulty is one reason the next idea exists.',
    },
    { kind: 'heading', text: 'CRDTs: give every character a name' },
    {
      kind: 'prose',
      md: 'A [[conflict-free replicated data type|crdt]] (CRDT) for text avoids positions altogether. Every character gets a unique id, made from who typed it and a counter, such as `m21` for the first character Maya added. An insert says “put these characters after the character with id `o16`”, not “at position 16”, and an id never moves, whatever else is typed around it.',
    },
    {
      kind: 'prose',
      md: 'When two people type after the same character at once, every copy breaks the tie with the same rule, such as comparing ids. Deleted characters stay behind as hidden [[tombstones|tombstone]], so an edit that points at one still finds its place. Because the result does not depend on the order edits arrive in, copies reach [[convergence|convergence]], a strong form of [[eventual consistency|eventual-consistency]], with no central server deciding anything, even after hours offline.',
    },
    {
      kind: 'compare',
      left: {
        title: 'Operational transformation',
        summary: 'Rewrite positions',
        points: [
          'Edits are small operations with positions, such as “insert at 20”.',
          'Usually needs a central server to put every edit in one order.',
          'Little extra data per character; the hard part is the transformation rules.',
        ],
      },
      right: {
        title: 'CRDT',
        summary: 'Name every character',
        points: [
          'Edits point at character ids, which never go stale.',
          'Copies merge in any order, so offline devices and peers can sync directly.',
          'Every character carries an id, and deletes leave tombstones, so documents carry more data.',
        ],
      },
      caption: 'Both keep every edit and make the copies match. OT puts the cleverness in transforming positions; a CRDT puts it in the data itself.',
    },
    { kind: 'heading', text: 'Presence: who is here, and where' },
    {
      kind: 'prose',
      md: '[[Presence|presence]] is the live layer on top: who has the album open, where each cursor sits and what each person has selected. It changes constantly and is worthless a few seconds later, so it never goes into the document’s history or the main database. Apps send cursor moves over the same connection, a few times a second at most, and the server forwards them to everyone else in the album.',
    },
    {
      kind: 'prose',
      md: 'To notice people who leave without saying goodbye, such as a phone that loses signal, each app sends a [[heartbeat|heartbeat]], and the presence store forgets anyone it has not heard from within its [[TTL|ttl]] (time to live), around 30 seconds (ballpark). Cursors need the same care as edits: a cursor stored as “position 20” goes stale just like an operation, so OT transforms cursors too, and a CRDT anchors each cursor to a character id.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real editors handle far more than inserts into one line of plain text: overlapping deletes, formatting, undo of only your own edits, and documents opened by hundreds of people. The core ideas stay the same: never replace whole documents, and make every copy converge.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'collab-editing',
      title: 'Two cursors, one description',
      caption: 'Step through Maya’s and Sam’s edits under each merge rule. At the last step, switch rules to compare what survives.',
      props: { mode: 'lww' },
    },
  ],
  tradeoffs: {
    caption: 'Four ways to handle two people editing the same thing.',
    rows: [
      {
        option: 'Last write wins on the whole text',
        goodAt: 'Trivial to build: store one value and a timestamp.',
        badAt: 'Silently throws away one person’s edit whenever two overlap, even on different words.',
        pickWhen: 'Fields one person edits at a time, such as a profile photo.',
      },
      {
        option: 'Locking, one editor at a time',
        goodAt: 'No merging at all, and simple to explain.',
        badAt: 'Others wait, and a lock held by a closed laptop blocks everyone until it expires.',
        pickWhen: 'Edits are rare and long, or the content cannot be merged.',
      },
      {
        option: 'Operational transformation',
        goodAt: 'Keeps every edit with little extra data, and is proven in large text editors.',
        badAt: 'The transformation rules are hard to get right, and it usually needs one central server.',
        pickWhen: 'A server-centered editor whose users are mostly online.',
      },
      {
        option: 'CRDT',
        goodAt: 'Copies merge in any order, so offline editing and peer-to-peer sync come naturally.',
        badAt: 'Every character carries an id and deletes leave tombstones, so documents grow.',
        pickWhen: 'Offline-first apps, peer-to-peer sync, or no single server in the merge path.',
      },
    ],
  },
  realWorld: {
    title: 'Figma’s multiplayer editing',
    body: 'In 2019, Figma co-founder Evan Wallace described how Figma’s multiplayer editing works. The team chose not to use OT, writing that it was unnecessarily complex for their problem, since Figma is a design tool rather than a text editor. Instead they built a system inspired by CRDTs, simplified because Figma’s central server acts as the authority.\n\nEach property of each object is resolved like a last-writer-wins register: whichever value reaches the server last is kept, with no timestamps needed because the server defines the order. Children of an object are ordered with [[fractional indexing|fractional-indexing]], a position between 0 and 1, where inserting between two siblings takes the average of their positions. Clients talk to the servers over WebSockets, and each multiplayer document gets its own server process.',
    sourceUrl: 'https://www.figma.com/blog/how-figmas-multiplayer-technology-works/',
    sourceLabel: 'Evan Wallace, “How Figma’s multiplayer technology works,” Figma blog, 2019',
  },
  interview: {
    whenToMention:
      'When several people change the same thing live: a document editor like Google Docs, a whiteboard, a shared playlist or a shared album. Raise it as soon as you sketch the write path, before the interviewer asks what happens when two edits collide.',
    sayItLikeThis: [
      'Clients keep a WebSocket to a collaboration service and apply their own edits optimistically; the service puts each document’s edits in one order.',
      'For merging I’d use operational transformation with a central server, or a CRDT if we need offline editing.',
      'Presence is separate: cursor positions live in an in-memory store with a short TTL, never in the document history.',
    ],
    followUps: [
      {
        q: 'How do you handle a user who edits offline for an hour?',
        a: 'With a CRDT, the app keeps editing its local copy and sends its operations when it reconnects; they merge in any order, so the copies converge. With OT, the client must transform an hour of pending edits against everything the server accepted meanwhile, which works but gets expensive.',
      },
      {
        q: 'Where does the document live while people are editing it?',
        a: 'One collaboration server owns each active document in memory, picked by hashing the document’s id, so every edit for it goes through one place in order. That server saves snapshots and the list of operations to durable storage every few seconds. If it dies, another server loads the latest snapshot, replays the operations after it, and the clients reconnect.',
      },
      {
        q: 'Why not just lock the description while someone types?',
        a: 'Locks make people wait, and a lock held by a phone that lost signal blocks everyone until it times out. In a live editor, people expect to type at the same time and see each other’s changes within a fraction of a second. Locking suits rare, long edits where merging makes no sense.',
      },
    ],
    redFlags: [
      'Saving the whole document with last write wins and calling the lost edits rare.',
      'Trusting device timestamps to order edits from different people.',
      'Writing every cursor move to the main database.',
    ],
  },
  mistakes: [
    '**Replacing whole documents.** Last write wins on the full text loses one person’s work whenever two edits overlap in time, even if they touch different words.',
    '**Applying remote edits at their original positions.** An insert “at 20” lands in the wrong place once your own edits have shifted the text.',
    '**Storing presence like data.** Cursors move many times a second; writing every move to the database wastes capacity on facts that expire in seconds.',
    '**Never cleaning up.** Tombstones and old operations pile up unless you compact them, for example into a snapshot once every copy has caught up.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Maya and Sam edit different words of the album description at the same moment. With last write wins on the whole text, what happens?',
      options: [
        {
          text: 'One person’s edit disappears, even though they changed different words',
          correct: true,
          why: 'The unit being replaced is the whole description, so the later save overwrites the other person’s changes.',
        },
        {
          text: 'Both edits are kept, because they touched different words',
          correct: false,
          why: 'That needs a merge that understands the text, such as OT or a CRDT. Last write wins only compares timestamps.',
        },
        {
          text: 'The server rejects both saves and asks them to try again',
          correct: false,
          why: 'That is what a lock or a version check would do. Last write wins never rejects anything; it silently picks one.',
        },
        {
          text: 'The text becomes a garbled mix of both edits',
          correct: false,
          why: 'Garbling comes from applying an operation at a stale position. Last write wins replaces the text cleanly, just without one person’s change.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'The description is 20 characters long. Maya inserts 6 characters at position 16, and at the same moment Sam inserts text at position 20. Under operational transformation, at what position does Sam’s insert land on Maya’s copy?',
      answer: 26,
      unit: 'position',
      tolerance: 1.03,
      solution: ['Maya’s insert comes before position 20, so it pushes everything after it to the right.', 'She added 6 characters, so Sam’s position moves by 6.', '20 + 6 = 26.'],
    },
    {
      kind: 'multi',
      prompt: 'Which statements about CRDTs for text are true?',
      options: [
        { text: 'Every character has a unique id that never changes', correct: true, why: 'Inserts point at ids rather than positions, so they never go stale.' },
        {
          text: 'Copies end up identical whatever order the edits arrive in',
          correct: true,
          why: 'That is what makes them conflict-free: the merged result does not depend on the order.',
        },
        {
          text: 'Deleted characters vanish from every copy at once',
          correct: false,
          why: 'They stay behind as tombstones, so later edits that point at them still find their place.',
        },
        {
          text: 'They need one central server to decide the order of edits',
          correct: false,
          why: 'That is typical of OT. CRDT copies can sync peer to peer or after being offline, though many products still use a server.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of one edit under server-based operational transformation in order.',
      items: [
        'Maya’s app applies her edit locally at once',
        'Her app sends the operation, tagged with the version it was made on',
        'The server transforms it against edits it accepted since that version',
        'The server saves it as the next version and forwards it to Sam',
        'Sam’s app transforms it against his own pending edits and applies it',
      ],
      why: 'Each side applies its own edits immediately and transforms the edits it missed. The server’s single order is what keeps everyone in step.',
    },
    {
      kind: 'single',
      prompt: 'Where should Snapgram keep live cursor positions for shared albums?',
      options: [
        {
          text: 'In an in-memory presence store with a short expiry, forwarded over the open connections',
          correct: true,
          why: 'Cursors change many times a second and are useless seconds later, so memory and a time to live fit them.',
        },
        {
          text: 'In the album table, updated on every cursor move',
          correct: false,
          why: 'That turns harmless cursor moves into a flood of durable writes for data nobody needs tomorrow.',
        },
        {
          text: 'In the document’s edit history, next to the text operations',
          correct: false,
          why: 'Cursor moves are not edits; mixing them in bloats the history and slows down replays.',
        },
        {
          text: 'Nowhere: each app polls the server for the other cursors every minute',
          correct: false,
          why: 'A cursor a minute old is useless. Presence needs updates within a fraction of a second.',
        },
      ],
    },
  ],
  takeaways: [
    'Last write wins on a whole document silently loses work, so collaborative editors merge edits instead of replacing text.',
    'Operational transformation shifts each edit past the edits it missed, usually with a central server setting the order, while a CRDT names every character so copies merge in any order.',
    'Presence, the live cursors and avatars, is short-lived data: keep it in memory with heartbeats and expiry, apart from the document.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Why OT is hard to get right.** With a central server, each pair of operation types needs a transformation rule, and every rule must make both orders produce the same text. Without a central server, the rules need extra properties that several early published algorithms were later shown to break, which is one reason most OT products keep a server in the middle.',
    },
    {
      kind: 'prose',
      md: '**Interleaving.** If Maya types “sunny” and Sam types “windy” at the same spot, a careless CRDT can mix their letters into something like “swuinnndyy”. Good sequence CRDTs keep each person’s run of characters together; the widget’s CRDT does it by ordering characters typed after the same one by their ids.',
    },
    {
      kind: 'prose',
      md: '**Knowing what you have seen.** To tell which edits a copy already has, collaborative systems track a per-document version number or a [[version vector|version-vector]], the tools from [Time and ordering](lesson:time-and-ordering). A [[logical clock|logical-clock]] also produces the counters inside CRDT ids.',
    },
    {
      kind: 'prose',
      md: '**Presence at scale.** A document with hundreds of viewers can produce thousands of cursor messages a second (ballpark). Common fixes are batching updates every 50 to 100 ms, sending only the cursors on screen, and showing a count of viewers instead of every cursor once a document gets crowded.',
    },
  ],
  flashcards: [
    {
      front: 'Why does last write wins fail for collaborative text?',
      back: 'It replaces the whole text with the later save, so one person’s edits vanish even when they changed different words.',
    },
    {
      front: 'What does operational transformation do?',
      back: 'It adjusts an incoming operation against the concurrent edits it missed, such as shifting an insert’s position past newly added characters.',
    },
    { front: 'How does a CRDT avoid stale positions?', back: 'Each character has a unique id, and inserts say which character they follow, so references never shift.' },
    { front: 'What is a tombstone in a text CRDT?', back: 'A deleted character kept in place but hidden, so edits that point at it can still be placed correctly.' },
    {
      front: 'OT or CRDT: which suits offline editing better?',
      back: 'A CRDT, because copies merge in any order without a central server, while OT usually relies on a server to order edits.',
    },
    {
      front: 'What is presence, and where should it live?',
      back: 'Live information about who is here and where their cursor is. Keep it in memory with heartbeats and a short expiry, not in the database.',
    },
  ],
  related: ['real-time-communication', 'time-and-ordering', 'consistency-models', 'cap-pacelc', 'cqrs-event-sourcing'],
  glossaryTerms: [
    'websocket',
    'optimistic-update',
    'write-conflict',
    'last-write-wins',
    'clock-skew',
    'concurrent-events',
    'operational-transformation',
    'crdt',
    'tombstone',
    'convergence',
    'eventual-consistency',
    'presence',
    'heartbeat',
    'ttl',
    'fractional-indexing',
    'version-vector',
    'logical-clock',
  ],
};

export default lesson;
