import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** One like, from tap to answer, including the expired-session case behind Snapgram's bug. */
const likeFlow: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Snapgram app', sublabel: 'Maya’s phone', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'App server', sublabel: 'Oregon', x: 1, y: 1 },
    { id: 'sessions', type: 'cache', label: 'Session store', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'likes', x: 2, y: 2 },
  ],
  edges: [
    { id: 'phone-app', from: 'phone', to: 'app', kind: 'sync' },
    { id: 'app-sessions', from: 'app', to: 'sessions', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Maya taps the heart. The app sends a request, `POST /v1/photos/123/likes`, to the **app server**, along with a small piece of text that says who she is.',
      flow: ['phone-app'],
      focus: ['phone', 'app'],
    },
    {
      caption: 'The server keeps no memory of Maya between requests, so it looks that text up in the **session store** to find out who is asking.',
      flow: ['app-sessions', { edge: 'app-sessions', reverse: true, tag: 'Maya' }],
      focus: ['app', 'sessions'],
    },
    {
      caption: 'It saves the like in the **database**, a few milliseconds away in the same data center.',
      flow: ['app-db', '<app-db'],
      focus: ['app', 'db'],
    },
    {
      caption: 'The server answers with a status code, `201 Created`, and a small body holding the new like count. Only now does the heart turn red.',
      flow: [{ edge: 'phone-app', reverse: true, tag: '201' }],
      focus: ['phone', 'app'],
    },
    {
      caption: 'Had Maya’s session expired, the lookup would fail and the answer would be `401 Unauthorized`. The old app ignored that answer, which is exactly the bug Maya saw.',
      flow: ['phone-app', { edge: 'app-sessions', tag: 'expired' }, '<app-sessions', { edge: 'phone-app', reverse: true, tag: '401', tone: 'alert' }],
      focus: ['phone', 'app', 'sessions'],
    },
  ],
};

/** Logging in once, then sending the session cookie with every later request. */
const login: SequenceSpec = {
  actors: [
    { id: 'phone', type: 'client', label: 'Snapgram app' },
    { id: 'app', type: 'service', label: 'App server' },
    { id: 'sessions', type: 'cache', label: 'Session store' },
  ],
  groups: [
    { label: 'Log in', from: 1, to: 3 },
    { label: 'Later requests', from: 4, to: 6 },
  ],
  messages: [
    {
      from: 'phone',
      to: 'app',
      label: 'POST /login',
      kind: 'sync',
      caption: 'Maya types her email and password, and the app sends them in the body of a `POST` request, encrypted on the way.',
    },
    {
      from: 'app',
      to: 'sessions',
      label: 'Save session',
      kind: 'sync',
      caption: 'The password checks out, so the server creates a session: a record saying that a long random ID belongs to Maya for the next 30 days.',
    },
    {
      from: 'app',
      to: 'phone',
      label: '200 OK, Set-Cookie',
      kind: 'reply',
      caption: 'The response carries a `Set-Cookie` header with the session ID. The app stores the cookie, so the password never needs to travel again.',
    },
    {
      from: 'phone',
      to: 'app',
      label: 'Like, with cookie',
      kind: 'sync',
      caption: 'Every later request carries the ID back in a `Cookie` header. That is how a stateless protocol remembers who you are.',
    },
    {
      from: 'app',
      to: 'sessions',
      label: 'Look up ID',
      kind: 'sync',
      caption: 'The server looks the ID up in the session store, which answers in about a millisecond: it is Maya, and the session is still valid.',
    },
    {
      from: 'app',
      to: 'phone',
      label: '201 Created',
      kind: 'reply',
      caption: 'The like is saved, and the server answers `201 Created`. To log Maya out, the server only has to delete the session.',
    },
  ],
};

const lesson: Lesson = {
  id: 'http-essentials',
  module: 'm1',
  order: 5,
  title: 'HTTP essentials',
  idea: 'The [[Hypertext Transfer Protocol|http]] (HTTP) is the request-and-response language of the web: a client sends a method, a path, headers and sometimes a body, and the server answers with a status code, headers and sometimes a body.',
  minutes: 15,
  prerequisites: ['life-of-a-request', 'tcp-vs-udp'],
  outcomes: [
    'Read an HTTP request and response line by line and say what each part does.',
    'Choose the right method and status code for an action, such as liking a photo.',
    'Explain how cookies and sessions keep a user logged in when HTTP itself remembers nothing.',
  ],
  analogy: {
    title: 'A restaurant order slip',
    body: 'A waiter writes your order on a slip: the table number, the dishes, and notes like “no onions”. The kitchen does not remember you, so everything it needs must be on the slip. When the food comes out, it carries a slip of its own: the table, the dish, and maybe a note that the soup has run out.\n\nOrder dessert an hour later and the waiter writes a fresh slip, table number and all, because the kitchen still does not remember you. HTTP works the same way: every request is a complete slip, and something like that table number tells the server who you are.',
  },
  whyItMatters:
    'Snapgram’s mobile app talks to its servers in HTTP, just like the website. Tapping the heart under a photo sends one request, and scrolling the feed sends a few more. Lately, users report a strange bug: Maya likes a photo, the heart turns red, and the next day it is grey again.\n\nThe server logs show that the like came back with the [[status code|status-code]] `401 Unauthorized`. Maya’s login had expired, the server refused the like, and the app ignored the answer and painted the heart red anyway. Fixing it starts with reading HTTP the way the server does.',
  body: [
    {
      kind: 'prose',
      md: 'Snapgram’s app and website both talk to the same [[application programming interface|api]] (API): a set of operations the app can ask for over HTTP. Every exchange is one request and one response. Follow a single like from Maya’s phone to the server and back.',
    },
    {
      kind: 'diagram',
      title: 'One like, request to response',
      caption: 'What happens when Maya taps the heart. Use Play, or the arrow keys.',
      spec: likeFlow,
    },
    { kind: 'heading', text: 'Reading a request' },
    {
      kind: 'prose',
      md: 'A request names what to do and what to do it to. The first word is the [[method|http-method]], a verb like `GET` or `POST`, and next comes the path, the part of the web address after the domain. Below that sit the [[headers|http-header]], name and value pairs that carry everything else, and then an optional body.',
    },
    {
      kind: 'annotated',
      title: 'The request: Maya likes photo 123',
      caption: 'Simplified. Real requests carry a few more headers.',
      lines: [
        { code: 'POST /v1/photos/123/likes HTTP/1.1', note: 'The request line: the method (what to do), the path (what to do it to) and the version of HTTP.' },
        { code: 'Host: api.snapgram.com', note: 'Which site this is for, since one server can host many.' },
        { code: 'Cookie: session=7f3a9c…', note: 'Who is asking: a random identifier (ID) the app received when Maya logged in.' },
        { code: 'Accept: application/json', note: 'The format the app wants back: [[JSON|json]] (JavaScript Object Notation), a simple text format for data.' },
        { code: 'Content-Length: 0', note: 'The body’s size in bytes. A like needs no body, because the path says it all.' },
        { code: '', note: 'A blank line ends the headers. A body, if any, would follow.' },
      ],
    },
    {
      kind: 'prose',
      md: 'The method matters because browsers, apps and caches act on it. `GET` must be safe, meaning it changes nothing, so it can be cached, prefetched and retried freely. Anything that changes data uses another method.',
    },
    {
      kind: 'table',
      columns: ['Method', 'Asks the server to', 'Snapgram example', 'Same effect if repeated?'],
      rows: [
        ['`GET`', 'Read something and change nothing', '`GET /v1/photos/123`', 'Yes'],
        ['`POST`', 'Create something, or start an action', '`POST /v1/photos/123/comments`', 'No: two comments'],
        ['`PUT`', 'Replace something with the version sent', '`PUT /v1/users/42/bio`', 'Yes'],
        ['`PATCH`', 'Change part of something', '`PATCH /v1/users/42`', 'Not guaranteed'],
        ['`DELETE`', 'Remove something', '`DELETE /v1/photos/123`', 'Yes: it stays deleted'],
      ],
      caption: 'Methods with the same effect when repeated are [[idempotent|idempotent]], which makes them safe to retry.',
    },
    { kind: 'heading', text: 'Reading a response' },
    {
      kind: 'prose',
      md: 'The response opens with a status code: three digits that say how it went, grouped by the first digit. Clients, caches and monitoring tools act on the code without reading the body, so sending the right one matters as much as sending the right data. Headers and a body follow, just as in the request.',
    },
    {
      kind: 'annotated',
      title: 'The response',
      lines: [
        { code: 'HTTP/1.1 201 Created', note: 'The status line: 201 means it worked and something new now exists.' },
        { code: 'Content-Type: application/json', note: 'The body is JSON.' },
        {
          code: 'Cache-Control: no-store',
          note: 'This answer is personal, so no cache should keep a copy. [[Cache-Control|cache-control]] headers steer every cache on the way.',
        },
        { code: 'Content-Length: 39', note: 'The body is 39 bytes long.' },
        { code: '', note: 'A blank line, then the body.' },
        { code: '{"photoId":123,"likes":42,"liked":true}', note: 'The body: the new like count, so the app can update the screen.' },
      ],
    },
    {
      kind: 'table',
      columns: ['Code', 'Meaning', 'Snapgram example'],
      rows: [
        ['`200 OK`', 'It worked; here is the result', 'The feed loads'],
        ['`201 Created`', 'It worked; something new exists', 'A like or comment is saved'],
        ['`304 Not Modified`', 'Your cached copy is still good', 'A profile unchanged since the last visit'],
        ['`400 Bad Request`', 'The request itself is malformed', 'A comment with no text'],
        ['`401 Unauthorized`', 'I do not know who you are', 'Maya’s session has expired'],
        ['`403 Forbidden`', 'I know who you are, and the answer is no', 'Deleting someone else’s photo'],
        ['`404 Not Found`', 'Nothing lives at this path', 'A photo that was deleted'],
        ['`429 Too Many Requests`', 'Slow down', 'A script liking 1,000 photos a minute'],
        ['`500 Internal Server Error`', 'The server broke', 'A bug in the like handler'],
        ['`503 Service Unavailable`', 'The server cannot cope right now', 'Overload during a celebrity post'],
      ],
      caption: 'The first digit is the class: 2xx success, 3xx look elsewhere, 4xx the client’s mistake, 5xx the server’s.',
    },
    { kind: 'heading', text: 'Stateless, so cookies remember' },
    {
      kind: 'prose',
      md: 'Here is the catch: HTTP is [[stateless|stateless]]. The server keeps no memory of earlier requests, so each request must carry everything needed to handle it, just like an order slip. That lets any server answer any request, but it means HTTP alone cannot remember that Maya logged in.\n\nThe fix is a [[session|session]]. At login, the server stores a record for Maya under a long random ID and sends that ID back in a [[cookie|cookie]], a small value the client keeps and returns with every later request to the same site. Sessions live in a shared [[session store|session-store]], so every app server can look them up.',
    },
    {
      kind: 'sequence',
      title: 'Logging in with a cookie-based session',
      caption: 'One login, then a cookie on every request. Step through it with Play or the arrow keys.',
      spec: login,
    },
    {
      kind: 'prose',
      md: 'So the team fixes the bug in two places. The app now checks every status code, and on a `401` it shows the login screen instead of faking a red heart. Sessions now last 30 days and renew whenever Maya uses the app, so she rarely sees that screen at all.',
    },
    { kind: 'heading', text: 'HTTPS and the versions of HTTP' },
    {
      kind: 'prose',
      md: 'Everything above travels inside [[HTTPS|https]] (HTTP over TLS). The [[Transport Layer Security|tls]] (TLS) handshake checks the server’s certificate, a digital ID signed by an authority the phone already trusts, and then encrypts the whole conversation. Without it, anyone on Maya’s café Wi-Fi could read her password, or copy her session cookie and become her.\n\n**HTTP/1.1, 2 and 3.** HTTP/1.1 (1997) sends readable text and handles one request at a time per connection, so browsers open several connections to each site. HTTP/2 (2015) switches to a compact binary format and [[multiplexes|multiplexing]] many requests over one [[Transmission Control Protocol|tcp]] (TCP) connection, but a single lost packet still stalls them all. HTTP/3 (2022) runs over [[QUIC|quic]], which is built on the [[User Datagram Protocol|udp]] (UDP), so a loss stalls only its own request; the methods, status codes and headers stay the same in all three.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real requests carry more headers than shown here, and many apps send a token in an `Authorization` header instead of a cookie. Storing passwords safely and protecting sessions from theft are covered in [Security essentials](lesson:security-essentials).',
    },
  ],
  tradeoffs: {
    caption: 'Three ways to remember who is logged in, on a protocol that forgets every request.',
    rows: [
      {
        option: 'Session ID in a cookie',
        goodAt: 'The cookie holds only a random ID, and logging someone out just means deleting the session.',
        badAt: 'Every request needs a lookup, and every server must reach the same session store.',
        pickWhen: 'Most apps with logins. The usual default.',
      },
      {
        option: 'Signed token in each request',
        goodAt: 'Any server can check the signature without a lookup, so there is no session store to run.',
        badAt: 'Hard to revoke before it expires, and larger than an ID, so every request carries more bytes.',
        pickWhen: 'Many separate services need to know who the user is.',
      },
      {
        option: 'Session in one server’s memory',
        goodAt: 'Simplest and fastest: no store at all.',
        badAt: 'Logins vanish when the server restarts or a request lands on a different server.',
        pickWhen: 'A single server, and you accept losing logins on a restart.',
      },
    ],
  },
  realWorld: {
    title: 'GitHub’s API speaks in headers and status codes',
    body: 'GitHub’s public API shows HTTP’s headers and status codes doing real work. Most responses carry an `etag` header, a fingerprint of the response; send it back in an `if-none-match` header next time, and if nothing has changed, GitHub replies `304 Not Modified` with no body. GitHub’s documentation notes that such a conditional request does not count against your primary [[rate limit|rate-limiting]].\n\nThe rate limits themselves travel in headers. `x-ratelimit-remaining` says how many requests you have left and `x-ratelimit-reset` says when the window resets, and going over the limit gets you a `403` or `429` status code. According to [GitHub’s rate limit page](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), signed-in users get 5,000 requests per hour and anonymous callers 60, so a client that reads its headers can slow down before it is cut off.',
    sourceUrl: 'https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api',
    sourceLabel: 'GitHub Docs, “Best practices for using the REST API”',
  },
  interview: {
    whenToMention:
      'Right after the requirements, when you sketch the API. Give each operation a method, a path and the status codes it can return, and say where login state lives. Saying that the servers are stateless, with sessions in a shared store, also sets up scaling out later.',
    sayItLikeThis: [
      'Liking a photo is a POST to /v1/photos/{id}/likes. It returns 201 Created, or 401 if the session is missing or expired, and reading a photo is a GET, so it can be cached and retried safely.',
      'HTTP is stateless, so the app servers keep nothing in memory between requests. Sessions live in a shared store and the client sends the ID in a cookie, so any server can handle any request.',
    ],
    followUps: [
      {
        q: 'What is the difference between 401 and 403?',
        a: '401 Unauthorized means the server does not know who you are, perhaps because the session expired, so logging in again fixes it. 403 Forbidden means it knows exactly who you are and you are not allowed, such as deleting someone else’s photo. Logging in again will not help with a 403.',
      },
      {
        q: 'Why does it matter which methods are idempotent?',
        a: 'Networks fail mid-request, and clients and proxies retry. Retrying a GET, PUT or DELETE is safe because the end result is the same, but retrying a POST can create a second comment or a second payment. POSTs that must not repeat need an idempotency key, which [the API styles lesson](lesson:api-styles) covers.',
      },
      {
        q: 'Where do sessions live once there are several app servers?',
        a: 'Not in one server’s memory, or users get logged out whenever a request lands on a different server. Keep them in a shared store such as [[Redis|redis]], or switch to signed tokens that any server can check. [Stateless vs. stateful services](lesson:stateless-vs-stateful) goes deeper.',
      },
    ],
    redFlags: [
      'Changing data with a GET, such as `GET /deletePhoto?id=123`, which crawlers and link previews will happily trigger.',
      'Returning `200 OK` with an error message in the body, so clients, caches and monitoring all think it worked.',
      'Keeping sessions in one server’s memory without saying what happens when a second server is added.',
    ],
  },
  mistakes: [
    '**Ignoring status codes.** An app that treats every response as a success shows hearts that were never saved, as Snapgram’s did.',
    '**Changing data with GET.** Browsers, caches and link previews assume GET is safe and may call it on their own.',
    '**Mixing up 401 and 403.** One means log in again and the other means you may not; mixing them up confuses both apps and users.',
    '**Session cookies without Secure and HttpOnly.** A cookie sent over plain HTTP, or readable by page scripts, can be stolen and used to impersonate the user.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Maya edits her bio, and the app sends the complete new profile to replace the old one. Which method fits best?',
      options: [
        {
          text: '`PUT`',
          correct: true,
          why: 'PUT replaces a resource with the version you send, and sending it twice leaves the same result.',
        },
        {
          text: '`POST`',
          correct: false,
          why: 'POST usually creates something new, so a retry could create a duplicate. PUT says: replace this exact resource.',
        },
        { text: '`GET`', correct: false, why: 'GET only reads. It must never change data.' },
        { text: '`DELETE`', correct: false, why: 'DELETE would remove the profile instead of updating it.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these requests are idempotent, so retrying them is safe?',
      options: [
        {
          text: '`GET /v1/photos/123`',
          correct: true,
          why: 'Reading changes nothing, so any number of reads leaves the same state.',
        },
        {
          text: '`DELETE /v1/photos/123`',
          correct: true,
          why: 'After the first call the photo is gone, and repeats leave it gone, even if they return 404.',
        },
        {
          text: '`PUT /v1/users/42/bio` with the full new bio',
          correct: true,
          why: 'Replacing the bio with the same text again changes nothing.',
        },
        {
          text: '`POST /v1/photos/123/comments`',
          correct: false,
          why: 'Each call adds another comment, so a retry can post a duplicate.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'A like request comes back `401 Unauthorized`. What should the app do?',
      options: [
        {
          text: 'Ask Maya to log in again, then retry the like',
          correct: true,
          why: '401 means the server does not know who is asking, usually because the session is missing or expired.',
        },
        {
          text: 'Retry the same request a few times',
          correct: false,
          why: 'Nothing changes between tries: the session is still expired, so every retry gets another 401.',
        },
        { text: 'Show the heart as liked anyway', correct: false, why: 'That is exactly Snapgram’s bug. The like was never saved.' },
        {
          text: 'Report that the server crashed',
          correct: false,
          why: 'Server failures are 5xx codes. A 4xx code means the problem is with the request itself.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of a cookie-based login in order.',
      items: [
        'The app sends Maya’s email and password in a POST request',
        'The server checks the password and creates a session',
        'The server replies with a Set-Cookie header holding the session ID',
        'The app sends the cookie with its next request',
        'The server looks up the session and knows it is Maya',
      ],
      why: 'The server can only hand out a cookie after creating the session, and it can only recognize Maya when the cookie comes back with a later request.',
    },
    {
      kind: 'multi',
      prompt: 'Which of these usually travel in HTTP headers rather than in the body?',
      options: [
        { text: 'The session cookie', correct: true, why: 'Cookies travel in the `Cookie` request header and the `Set-Cookie` response header.' },
        { text: 'The format of the body, such as JSON', correct: true, why: 'That is the `Content-Type` header.' },
        { text: 'How long a copy may be cached', correct: true, why: 'That is the `Cache-Control` header.' },
        {
          text: 'The photo itself',
          correct: false,
          why: 'The photo is the body. Headers only describe it: its type, its size and how long to cache it.',
        },
      ],
    },
  ],
  takeaways: [
    'An HTTP request is a method, a path, headers and an optional body; a response is a status code, headers and an optional body.',
    'Methods and status codes carry meaning that clients and caches act on: GET is safe to repeat, 4xx means the request was wrong and 5xx means the server failed.',
    'HTTP is stateless, so a cookie carrying a session ID is what keeps a user logged in from one request to the next.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Caching with headers.** `Cache-Control` tells browsers and [[content delivery networks|cdn]] (CDNs) how long a response stays fresh, and an `ETag` lets a client ask whether its copy is still current. A `304 Not Modified` reply saves sending the body again, and [CDNs](lesson:cdns) builds on this.',
    },
    {
      kind: 'prose',
      md: '**Cookie settings that matter.** `HttpOnly` hides a cookie from page scripts, `Secure` sends it only over HTTPS, and `SameSite` stops other sites from making the browser send it along. `Max-Age` sets when it expires.',
    },
    {
      kind: 'prose',
      md: '**Redirects.** A `301` or `302` status with a `Location` header sends the client somewhere else. That is how sites move pages, and how `http://` addresses get bumped to `https://`.',
    },
  ],
  flashcards: [
    { front: 'What are the parts of an HTTP request?', back: 'A request line (method, path, version), headers, a blank line, and an optional body.' },
    { front: 'What do the status code classes mean?', back: '1xx informational, 2xx success, 3xx redirect, 4xx the client’s error, 5xx the server’s error.' },
    {
      front: 'What is the difference between 401 and 403?',
      back: '401: the server does not know who you are, so log in. 403: it knows you, and you are not allowed.',
    },
    { front: 'Which common HTTP methods are idempotent?', back: 'GET, PUT and DELETE. POST is not, and PATCH is not guaranteed to be.' },
    {
      front: 'What does it mean that HTTP is stateless?',
      back: 'The server keeps no memory of earlier requests, so each request must carry everything needed, such as a session cookie.',
    },
    {
      front: 'How does a cookie-based session keep you logged in?',
      back: 'At login, the server saves a session and sends its ID in Set-Cookie. The client sends that cookie with every later request.',
    },
    {
      front: 'What did HTTP/2 and HTTP/3 change?',
      back: 'HTTP/2 multiplexes many requests over one TCP connection. HTTP/3 does the same over QUIC on UDP, so one lost packet stalls only its own request.',
    },
  ],
  related: ['life-of-a-request', 'tcp-vs-udp', 'api-styles', 'stateless-vs-stateful', 'security-essentials'],
  glossaryTerms: [
    'http',
    'status-code',
    'api',
    'http-method',
    'http-header',
    'json',
    'idempotent',
    'cache-control',
    'stateless',
    'session',
    'cookie',
    'session-store',
    'https',
    'tls',
    'multiplexing',
    'tcp',
    'quic',
    'udp',
    'rate-limiting',
    'redis',
    'cdn',
  ],
};

export default lesson;
