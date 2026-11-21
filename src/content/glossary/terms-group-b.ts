import type { RawTerm } from '../types';

/** New glossary terms from lesson group B (lessons 1.4 to 1.7). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  /* Shared ids owned by group B */
  {
    id: 'packet',
    term: 'Packet',
    definition: 'A small chunk of data that crosses a network on its own, carrying the addresses it needs. Big messages travel as many packets.',
    example: 'A 3 MB photo crosses the internet as roughly two thousand packets.',
  },
  {
    id: 'udp',
    term: 'UDP',
    aka: ['User Datagram Protocol'],
    definition: 'A lightweight protocol that sends each packet once, with no handshake, ordering or resending. Nothing waits, but lost packets stay lost.',
    example: 'Video calls and DNS lookups usually travel over UDP.',
  },
  {
    id: 'retransmission',
    term: 'Retransmission',
    definition: 'Sending data again because no acknowledgment came back for it in time, so the sender assumes it was lost.',
    example: 'TCP resends packet 2 of the live stream after the phone reports a gap.',
  },
  {
    id: 'http-method',
    term: 'HTTP method',
    aka: ['HTTP verb'],
    definition: 'The verb at the start of an HTTP request that says what to do: GET reads, POST creates, PUT replaces, DELETE removes.',
    example: 'Liking a photo sends POST /photos/123/likes.',
  },
  {
    id: 'http-header',
    term: 'HTTP header',
    definition: 'A name and value line in an HTTP request or response that carries extra details, such as the data format or a cookie.',
    example: 'Content-Type: application/json says the body is JSON.',
  },
  {
    id: 'cookie',
    term: 'Cookie',
    definition: 'A small piece of data a server asks the client, usually a browser, to store and send back with every later request to that site.',
    example: 'Snapgram’s session cookie keeps Maya logged in between visits.',
  },
  {
    id: 'session',
    term: 'Session',
    definition: 'What a server remembers about a logged-in user between requests, found by a random session ID the client sends with each request.',
    example: 'Session 7f3a9c says this request comes from Maya and expires in 30 days.',
  },
  {
    id: 'stateless',
    term: 'Stateless',
    definition: 'Keeps no memory of earlier requests; each request carries everything needed to handle it, so any server can answer it.',
    example: 'Each Snapgram request carries its session cookie, so any app server can handle it.',
  },
  {
    id: 'api',
    term: 'API',
    aka: ['application programming interface'],
    definition: 'The set of operations a program offers to other programs, with fixed rules for how to ask and what comes back.',
    example: 'Snapgram’s API lets the mobile app load photos and post likes.',
  },
  {
    id: 'rest',
    term: 'REST',
    aka: ['representational state transfer', 'RESTful API'],
    definition: 'An API style built around resources, each with its own URL, acted on with standard HTTP methods and status codes.',
    example: 'GET /v1/photos/123 reads a photo; DELETE /v1/photos/123 removes it.',
  },
  {
    id: 'graphql',
    term: 'GraphQL',
    definition: 'A query language for APIs: the client describes exactly which fields it wants, often across several resources, and gets just those back in one request.',
    example: 'The profile screen asks for a name, an avatar and 12 photos in one query.',
  },
  {
    id: 'grpc',
    term: 'gRPC',
    definition: 'A framework for calls between services: you call a function on another machine as if it were local, with compact binary messages over HTTP/2.',
    example: 'Snapgram’s feed service calls GetProfile on the profile service over gRPC.',
  },
  {
    id: 'idempotent',
    term: 'Idempotent',
    aka: ['idempotency'],
    definition: 'An operation with the same effect whether it runs once or several times, so repeating it after a failure is safe.',
    example: 'Deleting photo 123 twice leaves it deleted; posting a comment twice makes two comments.',
  },
  {
    id: 'pagination',
    term: 'Pagination',
    definition: 'Returning a long list in pages of limited size, with a way to ask for the next page.',
    example: 'The photo grid loads 30 photos at a time as Maya scrolls.',
  },
  {
    id: 'api-versioning',
    term: 'API versioning',
    definition: 'Giving an API numbered or dated versions, so breaking changes ship in a new version while existing clients keep working on the old one.',
    example: 'Partners on /v1/photos keep working after /v2/photos changes the response.',
  },
  {
    id: 'polling',
    term: 'Polling',
    definition: 'Asking a server again and again, on a timer, whether anything has changed, even when nothing has.',
    example: 'The app asking for new notifications every 5 seconds.',
  },
  {
    id: 'long-polling',
    term: 'Long polling',
    definition: 'Polling where the server holds each request open until it has news or a timeout passes; the client then asks again immediately.',
    example: 'A request that waits up to 30 seconds and returns the moment a like arrives.',
  },
  {
    id: 'websocket',
    term: 'WebSocket',
    definition: 'A long-lived, two-way connection, opened with an HTTP request, on which client and server can each send messages at any time.',
    example: 'Snapgram pushes a like notification down Maya’s open WebSocket the moment it happens.',
  },
  {
    id: 'server-sent-events',
    term: 'Server-sent events',
    aka: ['SSE', 'EventSource'],
    definition: 'A one-way stream of events from server to client over an ordinary HTTP response that stays open.',
    example: 'A live like counter on Snapgram’s web page, updated through an EventSource stream.',
  },
  {
    id: 'webhook',
    term: 'Webhook',
    definition: 'An HTTP request one system sends to a URL you registered whenever an event happens, so you do not have to keep asking.',
    example: 'Snapgram sends a POST to a printing partner’s URL whenever someone orders a print.',
  },

  /* Lesson 1.4, TCP vs. UDP */
  {
    id: 'sequence-number',
    term: 'Sequence number',
    definition: 'A number that grows with each message or packet, so the receiver can restore the order and notice gaps. TCP numbers its data this way.',
    example: 'Packets 1 and 3 arrived, so the phone knows packet 2 is missing.',
  },
  {
    id: 'acknowledgment',
    term: 'Acknowledgment',
    aka: ['ACK', 'acknowledgement'],
    definition: 'A short reply telling the sender how much data has arrived, so it knows what it can forget and what it may need to resend.',
    example: 'The phone replies: I have everything up to packet 1, so send packet 2.',
  },
  {
    id: 'head-of-line-blocking',
    term: 'Head-of-line blocking',
    definition: 'When one missing or slow item at the front holds up everything queued behind it, even items that are already there.',
    example: 'Packet 3 has arrived, but the video player cannot have it until packet 2 is resent.',
  },
  {
    id: 'congestion-control',
    term: 'Congestion control',
    definition: 'How TCP slows its sending when packets go missing, a sign of a crowded network, and speeds up again as things clear.',
    example: 'After a loss, an upload over hotel Wi-Fi slows down, then gradually picks up speed.',
  },
  {
    id: 'quic',
    term: 'QUIC',
    definition: 'A transport protocol built on UDP that adds reliability, encryption and independent streams, and connects faster than TCP plus TLS. HTTP/3 runs on it.',
    example: 'A browser fetching a page over HTTP/3 is using QUIC underneath.',
  },

  /* Lesson 1.5, HTTP essentials */
  {
    id: 'json',
    term: 'JSON',
    aka: ['JavaScript Object Notation'],
    definition: 'A simple text format for structured data, made of names and values in curly braces. Most web APIs send and receive it.',
    example: '{"photoId": 123, "likes": 42}',
  },
  {
    id: 'multiplexing',
    term: 'Multiplexing',
    definition: 'Sending several independent requests and responses over one connection at the same time, interleaved, instead of one after another.',
    example: 'HTTP/2 fetches 30 thumbnails over a single connection at once.',
  },

  /* Lesson 1.6, APIs: REST, GraphQL, gRPC */
  {
    id: 'api-resource',
    term: 'Resource',
    aka: ['REST resource'],
    definition: 'A thing an API lets you work with, such as a photo or a user, named by its own address.',
    example: '/v1/users/42/photos is the collection of Maya’s photos; /v1/photos/123 is one photo.',
  },
  {
    id: 'endpoint',
    term: 'Endpoint',
    definition: 'One operation an API offers: a method together with an address, such as GET /v1/photos/123.',
    example: 'PUT /v1/photos/123/likes/me is the endpoint for liking a photo.',
  },
  {
    id: 'offset-pagination',
    term: 'Offset pagination',
    definition: 'Asking for a page by position, such as skip 60 and take 30. Simple, but slow on deep pages and unstable when items are added.',
    example: 'GET /photos?offset=60&limit=30 returns photos 61 to 90.',
  },
  {
    id: 'cursor-pagination',
    term: 'Cursor pagination',
    aka: ['keyset pagination'],
    definition: 'Asking for the page after a bookmark, the cursor, that marks the last item seen. It stays fast and stable as new items arrive.',
    example: 'GET /photos?after=p_9f2c&limit=30 returns the 30 photos after that one.',
  },
  {
    id: 'idempotency-key',
    term: 'Idempotency key',
    definition: 'A unique ID the client attaches to a request, so the server can recognize a retry and return the first result instead of acting twice.',
    example: 'Retrying a print order with the same key creates one order, not two.',
  },
  {
    id: 'breaking-change',
    term: 'Breaking change',
    definition: 'A change to an API that makes existing clients fail, such as removing a field, renaming it or changing its type.',
    example: 'Renaming likes to likeCount would break every partner app that reads likes.',
  },
  {
    id: 'under-fetching',
    term: 'Under-fetching',
    definition: 'Needing several requests to collect what one screen needs, because each endpoint returns only part of it.',
    example: 'The profile screen calls /users/42, then /users/42/photos, then /users/42/followers.',
  },
  {
    id: 'over-fetching',
    term: 'Over-fetching',
    definition: 'Receiving more data than a screen needs, because the endpoint always returns the same full shape.',
    example: 'The profile header needs a name and an avatar but gets the whole user record.',
  },
  {
    id: 'api-schema',
    term: 'API schema',
    definition: 'A precise, machine-readable description of every operation, object and field an API offers, with their types, shared by client and server.',
    example: 'Snapgram’s GraphQL schema says a Photo has an id, a caption and a likeCount.',
  },
  {
    id: 'rpc',
    term: 'RPC',
    aka: ['remote procedure call'],
    definition: 'Calling a function that runs on another machine as if it were a local function call.',
    example: 'The feed service calls GetProfile(42), which runs on the profile service.',
  },
  {
    id: 'protocol-buffers',
    term: 'Protocol Buffers',
    aka: ['protobuf'],
    definition: 'Google’s compact binary format for structured data. A definition file describes the messages, and tools generate code to read and write them.',
    example: 'message Photo { int64 id = 1; string caption = 2; }',
  },

  /* Lesson 1.7, Real-time communication */
  {
    id: 'push-notification',
    term: 'Push notification',
    definition: 'A message a server sends to a phone through Apple’s or Google’s push service, delivered even when the app is closed.',
    example: 'Maya’s lock screen shows that Sam liked her photo.',
  },
  {
    id: 'heartbeat',
    term: 'Heartbeat',
    definition: 'A small message sent at regular intervals to show that a connection or a process is still alive.',
    example: 'Snapgram’s app pings its WebSocket every 30 seconds.',
  },
];
