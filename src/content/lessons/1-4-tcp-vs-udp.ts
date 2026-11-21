import type { Lesson, SequenceSpec } from '../types';

/** The live stream over TCP: packet 2 is lost, packet 3 waits, packet 2 is resent. */
const tcpLoss: SequenceSpec = {
  actors: [
    { id: 'phone', type: 'client', label: 'Maya’s phone' },
    { id: 'server', type: 'service', label: 'Snapgram server' },
  ],
  groups: [{ label: 'Video frozen', from: 3, to: 5 }],
  messages: [
    {
      from: 'server',
      to: 'phone',
      label: 'Packet 1',
      kind: 'sync',
      caption: 'Video flows from Oregon toward Singapore, one numbered packet at a time. Packet 1 arrives and plays.',
    },
    {
      from: 'server',
      to: 'phone',
      label: 'Packet 2',
      kind: 'sync',
      lost: true,
      caption: 'A busy router somewhere over the Pacific drops packet 2. Neither side knows yet.',
    },
    {
      from: 'server',
      to: 'phone',
      label: 'Packet 3',
      kind: 'sync',
      caption: 'Packet 3 arrives safely but cannot be played. TCP hands over data only in order, so packet 3 waits in a buffer behind the gap.',
    },
    {
      from: 'phone',
      to: 'server',
      label: 'ACK: still need 2',
      kind: 'reply',
      caption: 'The phone acknowledges only what it has in order: everything up to packet 1. Repeated acknowledgments like this tell the server something is missing.',
    },
    {
      from: 'server',
      to: 'phone',
      label: 'Packet 2, resent',
      kind: 'sync',
      caption: 'The server resends packet 2. It arrives about one round trip after the phone noticed the gap: around 150 ms for Maya.',
    },
    {
      from: 'phone',
      to: 'server',
      label: 'ACK: up to 3',
      kind: 'reply',
      caption: 'Packets 2 and 3 finally reach the video player together. The picture was frozen the whole time, and that freeze is the price of perfect order.',
    },
  ],
};

/** The same stream over UDP: packet 2 is lost and nobody waits for it. */
const udpLoss: SequenceSpec = {
  actors: [
    { id: 'phone', type: 'client', label: 'Maya’s phone' },
    { id: 'server', type: 'service', label: 'Snapgram server' },
  ],
  messages: [
    {
      from: 'server',
      to: 'phone',
      label: 'Packet 1',
      kind: 'async',
      caption: 'No handshake: the server started sending the moment Maya opened the stream. Packet 1 plays as soon as it lands.',
    },
    {
      from: 'server',
      to: 'phone',
      label: 'Packet 2',
      kind: 'async',
      lost: true,
      caption: 'Packet 2 is dropped at the same busy router. UDP kept no copy and expects no acknowledgment, so the packet is simply gone.',
    },
    {
      from: 'server',
      to: 'phone',
      label: 'Packet 3',
      kind: 'async',
      caption: 'Packet 3 plays straight away. The app’s own numbering shows a gap, so the player covers it, perhaps with a blurry patch for a split second.',
    },
    {
      from: 'server',
      to: 'phone',
      label: 'Packet 4',
      kind: 'async',
      caption: 'The stream never paused. Maya sees a small glitch instead of a freeze, and the video stays live.',
    },
    {
      from: 'phone',
      to: 'server',
      label: 'Loss report',
      kind: 'async',
      caption: 'UDP sends no feedback, so the app adds its own. The player reports its losses every few seconds, and the server lowers the video quality if they climb.',
    },
  ],
};

const lesson: Lesson = {
  id: 'tcp-vs-udp',
  module: 'm1',
  order: 4,
  title: 'TCP vs. UDP',
  idea: 'The [[Transmission Control Protocol|tcp]] (TCP) delivers every byte in order by resending anything lost, while the [[User Datagram Protocol|udp]] (UDP) sends each piece of data once and never waits, so you choose between complete and on time.',
  minutes: 14,
  prerequisites: ['life-of-a-request'],
  outcomes: [
    'Explain how TCP makes delivery reliable and ordered, and what that costs when data gets lost.',
    'Predict what one lost piece of data does to a page load, a live stream and an online game.',
    'Choose TCP or UDP for a feature and defend the choice in an interview.',
  ],
  analogy: {
    title: 'A tracked parcel vs. postcards',
    body: 'Ship a set of photo albums by tracked parcel and the courier keeps count. Each box is numbered and signed for, and if box 3 goes missing, a replacement is sent. Everything arrives, in order, but one lost box holds up the whole delivery.\n\nNow send a friend live updates from a football match, one postcard a minute. Nobody tracks them, and a few go missing. You would never resend a lost one: by the time it arrived, a newer postcard would carry the latest score.',
  },
  whyItMatters:
    'Everything Snapgram sends today (pages, photos, likes) travels over TCP and always arrives complete. Now the founders add live video, so people can stream concerts as they happen. Maya watches one from Singapore, and the stream keeps freezing: a second of stillness, then a jump forward.\n\nSnapgram’s servers are fine, and so is Maya’s connection. The trouble is that the internet loses a small share of the [[packets|packet]] it carries, the small chunks all data is cut into, and TCP refuses to show anything after a lost packet until it gets that packet back. To fix the freezes, you need to see what TCP does for you, and what it costs.',
  body: [
    {
      kind: 'prose',
      md: 'Every message on the internet travels as packets of up to about 1,500 bytes, passed from router to router toward an [[IP address|ip-address]]. The Internet Protocol (IP) that moves them makes no promises: a busy router can drop a packet, and two packets can arrive out of order.\n\nTCP and UDP are two [[protocols|protocol]], or sets of rules, that run on top of IP. Both use [[port|port]] numbers to reach the right program on a machine. They differ in what they do about the network’s mistakes.',
    },
    { kind: 'heading', text: 'TCP: numbered, confirmed, resent' },
    {
      kind: 'prose',
      md: 'Most of the web runs on TCP, including the [[Hypertext Transfer Protocol|http]] (HTTP) that carries pages and app requests. TCP turns unreliable delivery into a dependable stream of bytes with four habits:\n\n1. **A [[handshake|handshake]] first.** The two sides trade three messages, SYN (synchronize), SYN-ACK and ACK (acknowledge), to agree on starting numbers. That costs one [[round trip|round-trip-time]] before any data moves.\n2. **Number everything.** Each piece of data carries a [[sequence number|sequence-number]], so the receiver can restore the order and spot gaps.\n3. **Confirm what arrived.** The receiver sends [[acknowledgments|acknowledgment]] saying how far it has everything in order, and the sender keeps a copy of anything not yet acknowledged.\n4. **Resend what is missing.** If no acknowledgment comes back in time, or the receiver keeps acknowledging the same point, the sender sends the data again. That is a [[retransmission|retransmission]].',
    },
    {
      kind: 'sequence',
      title: 'TCP: a lost packet, recovered',
      caption: 'Snapgram’s live stream, with one packet lost on the way. Use Play or the arrow keys.',
      spec: tcpLoss,
    },
    { kind: 'heading', text: 'The price of order' },
    {
      kind: 'prose',
      md: 'Packet 3 arrived on time, then sat waiting for packet 2. This is [[head-of-line blocking|head-of-line-blocking]]: because TCP promises order, one missing packet holds back everything behind it.\n\nFor a photo download, the pause is invisible; the photo just appears a moment later. For live video, every loss becomes a freeze of at least one round trip, and longer if the sender has to wait for its timer.',
    },
    {
      kind: 'prose',
      md: 'TCP also reads loss as a sign of a crowded network, so its [[congestion control|congestion-control]] slows the sender down and speeds it up again only gradually. That keeps a shared network usable for everyone, but on a lossy mobile link it makes TCP slower still.',
    },
    { kind: 'heading', text: 'UDP: send and forget' },
    {
      kind: 'prose',
      md: 'UDP adds almost nothing to IP: port numbers, plus a checksum (a quick fingerprint of the contents) so the receiver can discard a damaged packet. There is no handshake, no numbering, no acknowledgment and no resend. Each packet, called a datagram, is on its own.\n\nThat hands control to the app. A video app numbers its own packets so it can spot gaps and drop anything that arrives too late to show, but it never stops to wait.',
    },
    {
      kind: 'sequence',
      title: 'UDP: a lost packet, skipped',
      caption: 'The same stream and the same lost packet, over UDP.',
      spec: udpLoss,
    },
    {
      kind: 'numbers',
      caption: 'Ballpark numbers for Maya, about 150 ms round trip from Oregon. Real values vary with the network.',
      items: [
        { label: 'Setup before the first byte, TCP', value: '1 round trip', note: '≈ 150 ms for Maya' },
        { label: 'Setup before the first byte, UDP', value: 'none' },
        { label: 'Recovering a lost packet, TCP', value: '≥ 1 round trip' },
        { label: 'Recovering a lost packet, UDP', value: 'never', note: 'unless the app resends it' },
        { label: 'One frame of 30-frames-per-second video', value: '≈ 33 ms' },
        { label: 'Header on every packet', value: 'TCP 20+ bytes, UDP 8 bytes' },
      ],
    },
    { kind: 'heading', text: 'When UDP wins' },
    {
      kind: 'prose',
      md: 'Ask one question: what is a late packet worth? If it is still worth having, use TCP. If it is worthless by the time a resend could arrive, use UDP and keep going.',
    },
    {
      kind: 'table',
      columns: ['Use', 'Usually runs on', 'Why'],
      rows: [
        ['Web pages, app requests, uploads', 'TCP', 'Every byte must arrive, and a short pause is invisible.'],
        ['Chat messages and payments', 'TCP', 'A missing message is a bug, and order changes meaning.'],
        ['Video and voice calls', 'UDP', 'Audio a few hundred milliseconds late is useless in a conversation, so skipping beats freezing.'],
        ['Fast multiplayer games', 'UDP', 'Positions are sent many times a second, and the next update replaces a lost one.'],
        [
          '[[Domain Name System|dns]] (DNS) lookups',
          'UDP',
          'One small question and answer. If the reply is lost, the [[resolver|dns-resolver]] asks again, and answers too large for UDP are fetched over TCP.',
        ],
        ['Live video a few seconds behind', 'TCP', 'A playback buffer hides each resend.'],
      ],
      caption: 'The pattern: UDP wins when data is useless once it is late.',
    },
    {
      kind: 'prose',
      md: 'So Snapgram keeps pages, photos and uploads on TCP, and moves live video to a UDP-based protocol built for media, such as WebRTC (Web Real-Time Communication), which browsers use for video calls. Now a lost packet means a blurry moment, not a frozen picture.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real TCP numbers bytes rather than packets, keeps many packets in flight at once, and usually resends after three repeated acknowledgments or when a timer runs out. Video apps also add small playback buffers and repair data that rebuilds a lost packet without any resend.',
    },
  ],
  tradeoffs: {
    caption: 'Two transports, and the middle ground between them.',
    rows: [
      {
        option: 'TCP',
        goodAt: 'Every byte arrives in order, with no extra work in your app, and almost every network allows it.',
        badAt: 'A handshake before any data, and one lost packet stalls everything behind it.',
        pickWhen: 'Correctness beats a few hundred milliseconds: pages, files and chat.',
      },
      {
        option: 'UDP',
        goodAt: 'No setup and no waiting. The app decides what to do about each loss.',
        badAt: 'No delivery guarantee, ordering or congestion control unless you build them, and some networks block it.',
        pickWhen: 'Fresh beats complete: calls, games, live sensor data and quick lookups.',
      },
      {
        option: 'TCP with a playback buffer',
        goodAt: 'Smooth video with no visible loss, using ordinary web technology.',
        badAt: 'Viewers watch a few seconds behind real time.',
        pickWhen: 'Broadcast-style live streams and video on demand.',
      },
    ],
  },
  realWorld: {
    title: 'Why Google built QUIC on top of UDP',
    body: 'Google started work on [[QUIC|quic]] in 2012, and Chrome began a wide-scale deployment in 2014, according to [Chromium’s QUIC page](https://www.chromium.org/quic/). QUIC is reliable like TCP, yet it runs on top of UDP. Cloudflare’s engineers explain why: carrying QUIC in UDP datagrams eases deployment and avoids network equipment that drops packets from protocols it does not recognize. It also lets QUIC live inside applications such as browsers, which can then ship new protocol features without waiting for operating system updates.\n\nQUIC delivers its streams independently, so packet loss on one stream does not hold up the others. Its first handshake combines TCP’s handshake with the [[Transport Layer Security|tls]] (TLS) 1.3 handshake in a single round trip. UDP gave Google a blank canvas, and QUIC is now the transport under HTTP/3.',
    sourceUrl: 'https://blog.cloudflare.com/the-road-to-quic/',
    sourceLabel: 'Cloudflare blog, “The Road to QUIC” (2018)',
  },
  interview: {
    whenToMention:
      'Bring it up when a design carries live media, voice, multiplayer games or high-rate sensor data, and say which transport you would use and why. Otherwise, one sentence is enough: requests travel as encrypted HTTP (HTTPS) over TCP, or over QUIC with HTTP/3.',
    sayItLikeThis: [
      'Uploads, likes and the feed go over HTTPS on TCP, because every byte matters. For live video, a resent packet would arrive too late to show, so I’d use a UDP-based protocol and let the player hide small losses.',
      'If a few seconds of delay is fine, HTTP streaming over TCP with a buffer is simpler and works on every network, so I’d save UDP for video that must feel live.',
    ],
    followUps: [
      {
        q: 'Why not use TCP for a video call and just buy more [[bandwidth|bandwidth]]?',
        a: 'Bandwidth is not the problem; waiting is. After a loss, TCP holds back everything until the resend arrives, at least a round trip later, so sound and picture freeze. In a conversation, audio that arrives late is useless, so it is better to skip it.',
      },
      {
        q: 'If UDP can lose packets, how do multiplayer games stay in sync?',
        a: 'They send the current state many times a second, so the next update replaces a lost one and nothing needs resending. Events that must not be lost, such as a purchase, go over TCP or over a thin reliability layer the game builds on UDP.',
      },
      {
        q: 'Why does DNS use UDP, and when does it switch to TCP?',
        a: 'A lookup is one small question and answer, so a TCP handshake would double the time, and if the reply is lost, the resolver simply asks again. When an answer is too large for a UDP message, the server marks it as cut short and the resolver retries over TCP.',
      },
    ],
    redFlags: [
      'Saying UDP is faster because its header is smaller, as if a few bytes were the problem.',
      'Picking UDP for payments or uploads with no plan for lost packets.',
      'Claiming TCP guarantees delivery no matter what. It retries, but if the network stays down, the connection fails and the app must cope.',
    ],
  },
  mistakes: [
    '**Treating UDP as a faster TCP.** UDP removes waiting, not distance, and you give up ordering and delivery guarantees.',
    '**Rebuilding all of TCP on UDP.** Add ordering and resends for every packet and you get TCP’s stalls back, with more bugs.',
    '**Assuming packets never get lost.** Wi-Fi and mobile networks drop packets regularly, so design for loss from the start.',
    '**No fallback when UDP is blocked.** Some corporate and public networks only let TCP through, so UDP-based apps need a TCP path.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'A TCP stream loses packet 2, but packet 3 arrives. What does the receiving app get, and when?',
      options: [
        {
          text: 'Nothing new until packet 2 is resent, then packets 2 and 3 together',
          correct: true,
          why: 'TCP delivers data in order, so packet 3 waits in a buffer until the gap is filled. That wait is head-of-line blocking.',
        },
        {
          text: 'Packet 3 right away, and packet 2 when it is resent',
          correct: false,
          why: 'An app on UDP could work this way. TCP never hands data to the app out of order.',
        },
        {
          text: 'Packet 3, with packet 2 skipped for good',
          correct: false,
          why: 'TCP never skips data. It keeps resending until the gap is filled or the connection fails.',
        },
        {
          text: 'An error, because the connection breaks',
          correct: false,
          why: 'A single lost packet is routine. TCP recovers on its own by resending it.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these usually run over UDP?',
      options: [
        {
          text: 'Audio and video in a video call',
          correct: true,
          why: 'A late sound is useless, so calls skip a lost packet instead of waiting for it.',
        },
        {
          text: 'Player positions in a fast multiplayer game',
          correct: true,
          why: 'The next update arrives a few milliseconds later and replaces the lost one.',
        },
        {
          text: 'A DNS lookup',
          correct: true,
          why: 'It is one small question and answer. If the reply is lost, the resolver just asks again.',
        },
        {
          text: 'Uploading a photo to Snapgram',
          correct: false,
          why: 'Every byte of the file must arrive intact, so uploads travel over TCP.',
        },
        {
          text: 'Sending a chat message',
          correct: false,
          why: 'Every message must arrive, in order, so chat uses connections that run on TCP.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'Snapgram’s live stream shows 30 frames per second. Over TCP (Transmission Control Protocol), one lost packet holds back everything behind it for one round trip, about 150 ms for Maya. Roughly how many frames’ worth of video does that hold back?',
      answer: 4.5,
      unit: 'frames',
      tolerance: 1.2,
      solution: [
        'One frame lasts 1,000 ms ÷ 30 ≈ 33 ms.',
        '150 ms ÷ 33 ms ≈ 4.5 frames, so the picture freezes for four or five frames.',
        'Over UDP (User Datagram Protocol), the player would lose part of one frame and keep going.',
      ],
    },
    {
      kind: 'order',
      prompt: 'Put TCP’s recovery from one lost packet in order.',
      items: [
        'The server sends packets 1, 2 and 3',
        'A busy router drops packet 2',
        'The phone acknowledges only up to packet 1',
        'The server resends packet 2',
        'The phone hands packets 2 and 3 to the app',
      ],
      why: 'The phone can only acknowledge data up to the first gap, which tells the server what to resend. Packet 3 waits until packet 2 arrives, because TCP delivers in order.',
    },
    {
      kind: 'single',
      prompt: 'Snapgram wants live concerts to reach viewers in under a second, so they can react in the comments. What should carry the video?',
      options: [
        {
          text: 'A UDP-based protocol, with the player hiding small losses',
          correct: true,
          why: 'A resend would arrive too late to show, so skipping a little data keeps the stream live.',
        },
        {
          text: 'TCP with a 10-second playback buffer',
          correct: false,
          why: 'It plays smoothly, but 10 seconds behind real time, which breaks the live comments.',
        },
        {
          text: 'TCP with no buffer',
          correct: false,
          why: 'Every lost packet would freeze the picture for at least one round trip.',
        },
        {
          text: 'UDP, with the app resending every lost packet until it arrives',
          correct: false,
          why: 'That rebuilds TCP’s waiting on top of UDP and brings the freezes back.',
        },
      ],
    },
  ],
  takeaways: [
    'TCP turns an unreliable network into a reliable, ordered stream with handshakes, sequence numbers, acknowledgments and retransmission.',
    'The price of order is waiting: one lost packet holds back everything behind it for at least a round trip.',
    'UDP sends and forgets, which suits data that is useless once it is late, such as calls, games and quick lookups.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**QUIC and HTTP/3.** HTTP/3 runs over QUIC, which builds reliable, encrypted streams on top of UDP. Each stream recovers from loss on its own, so a lost packet stalls only the request it belongs to, and a new connection needs one round trip of setup instead of two. A connection can even survive a switch from Wi-Fi to mobile data, and where a network blocks UDP, browsers fall back to HTTP/2 over TCP.',
    },
    {
      kind: 'prose',
      md: '**Flow control.** Every TCP receiver advertises how much buffer space it has left, called its receive window, and the sender never sends more than that. A fast server cannot flood a slow phone, while congestion control does the same job for the network in between.',
    },
    {
      kind: 'prose',
      md: '**Reliability à la carte.** Games often build a thin layer on UDP that lets each message choose its own guarantee. Position updates go unreliably and are replaced by newer ones, while a purchase or a chat line is resent until it is acknowledged. Each kind of data pays only for the reliability it needs.',
    },
  ],
  flashcards: [
    {
      front: 'What does TCP guarantee that UDP does not?',
      back: 'TCP delivers every byte, in order and without duplicates, by resending what is lost. UDP sends each packet once, and packets may be lost or arrive out of order.',
    },
    {
      front: 'What is head-of-line blocking in TCP?',
      back: 'One lost packet holds back every later byte, even bytes that already arrived, until the lost packet is resent.',
    },
    {
      front: 'How does a TCP sender notice that a packet was lost?',
      back: 'No acknowledgment arrives before its timer runs out, or the receiver keeps acknowledging the same point, which signals a gap.',
    },
    { front: 'Name three uses where UDP usually wins.', back: 'Video and voice calls, fast multiplayer games, and DNS lookups.' },
    {
      front: 'Why do DNS lookups use UDP?',
      back: 'A lookup is one small question and one small answer. Skipping the handshake saves a round trip, and if a reply is lost, the resolver just asks again.',
    },
    {
      front: 'How long does the TCP handshake take before data can flow?',
      back: 'One round trip: SYN, SYN-ACK, then ACK. Setting up encryption with TLS 1.3 adds one more.',
    },
    {
      front: 'What is QUIC?',
      back: 'A transport protocol built on UDP that adds reliability, encryption and independent streams. HTTP/3 runs on it.',
    },
  ],
  related: ['life-of-a-request', 'http-essentials', 'real-time-communication', 'dns', 'latency-throughput-bandwidth'],
  glossaryTerms: [
    'tcp',
    'udp',
    'packet',
    'ip-address',
    'protocol',
    'port',
    'http',
    'handshake',
    'round-trip-time',
    'sequence-number',
    'acknowledgment',
    'retransmission',
    'head-of-line-blocking',
    'congestion-control',
    'dns',
    'dns-resolver',
    'quic',
    'tls',
    'bandwidth',
  ],
};

export default lesson;
