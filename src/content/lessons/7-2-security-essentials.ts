import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** Logging in once with a password, then the session cookie on every later request. */
const loginFlow: SequenceSpec = {
  actors: [
    { id: 'app', type: 'client', label: 'Snapgram app' },
    { id: 'gw', type: 'gateway', label: 'API gateway' },
    { id: 'login', type: 'service', label: 'Login service' },
    { id: 'store', type: 'cache', label: 'Session store' },
    { id: 'feed', type: 'service', label: 'Feed service' },
  ],
  groups: [
    { label: 'Log in once', from: 1, to: 5 },
    { label: 'Every later request', from: 6, to: 8 },
  ],
  messages: [
    {
      from: 'app',
      to: 'gw',
      label: 'POST /login',
      kind: 'sync',
      caption: 'Maya enters her email and password. The app sends them over Hypertext Transfer Protocol Secure (HTTPS), so nobody on the café network can read them.',
    },
    {
      from: 'gw',
      to: 'login',
      label: 'check password',
      kind: 'sync',
      caption: 'The gateway passes the attempt to the login service, which hashes the password with Maya’s salt and compares the result with the stored hash.',
    },
    {
      from: 'login',
      to: 'store',
      label: 'save session',
      kind: 'sync',
      caption: 'It matches. The login service stores a session record, holding Maya’s user ID and an expiry time, under a long random session ID.',
    },
    {
      from: 'login',
      to: 'gw',
      label: 'session ID',
      kind: 'reply',
      caption: 'The session ID heads back to the app. On its own it means nothing: it is only the key to that record.',
    },
    {
      from: 'gw',
      to: 'app',
      label: 'cookie: session ID',
      kind: 'reply',
      caption: 'The app keeps it in a cookie marked `Secure` and `HttpOnly`, so it travels only over encrypted connections and page scripts cannot read it.',
    },
    {
      from: 'app',
      to: 'gw',
      label: 'GET /feed + cookie',
      kind: 'sync',
      caption: 'From now on, every request carries the cookie. This is the wristband.',
    },
    {
      from: 'gw',
      to: 'store',
      label: 'whose session?',
      kind: 'sync',
      caption: 'The gateway looks the session up, in about a millisecond (ballpark), and learns that the caller is Maya.',
    },
    {
      from: 'gw',
      to: 'feed',
      label: 'GET /feed, user 42',
      kind: 'sync',
      caption: 'It forwards the request with Maya’s user ID. The feed service still checks authorization itself, showing Maya only the posts she may see.',
    },
  ],
};

/** "Sign in with Google": the authorization code flow, simplified. */
const signInWithGoogle: DiagramSpec = {
  grid: { cols: 2, rows: 3 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Snapgram app', sublabel: 'Maya’s phone', x: 0, y: 1 },
    { id: 'google', type: 'external', label: 'Google', sublabel: 'sign-in', x: 1, y: 0 },
    { id: 'login', type: 'service', label: 'Login service', sublabel: 'Snapgram', x: 1, y: 2 },
  ],
  edges: [
    { id: 'phone-google', from: 'phone', to: 'google', kind: 'sync', label: 'sign in' },
    { id: 'phone-login', from: 'phone', to: 'login', kind: 'sync', label: 'code' },
    { id: 'login-google', from: 'login', to: 'google', kind: 'sync', label: 'code + secret' },
  ],
  steps: [
    {
      caption: 'Maya taps “Sign in with Google”. The app opens Google’s sign-in page and says who is asking and what it wants, such as her name and email address.',
      flow: ['phone-google'],
    },
    {
      caption: 'Maya signs in at Google, which checks her password and second factor, and she approves. Google sends the app back a one-time authorization code.',
      flow: [{ edge: 'phone-google', reverse: true, tag: 'code' }],
    },
    {
      caption: 'The app passes the code to Snapgram’s **login service**, which trades it at Google, together with Snapgram’s own client secret, for tokens.',
      flow: ['phone-login', 'login-google', '<login-google'],
    },
    {
      caption:
        'One of them, the ID token, is signed by Google and says who Maya is. The login service checks the signature, finds her account and starts an ordinary Snapgram session.',
      flow: ['<phone-login'],
      notes: [{ target: 'login', text: 'session started', tone: 'signal' }],
    },
  ],
};

const lesson: Lesson = {
  id: 'security-essentials',
  module: 'm7',
  order: 2,
  title: 'Security essentials',
  idea: 'Security for a system designer comes down to a few habits: prove who is calling, check what they may do, encrypt data on the wire and on disk, keep secrets out of code, give every part the least access it needs, and make abuse expensive.',
  minutes: 15,
  prerequisites: ['http-essentials', 'reverse-proxies-gateways'],
  outcomes: [
    'Explain the difference between authentication and authorization, and choose between server-side sessions and signed tokens.',
    'Describe how “Sign in with Google” works through OAuth 2.0, and where Transport Layer Security (TLS), encryption at rest and a secrets manager fit in a design.',
    'Apply least privilege and layered defenses, such as rate limits, to slow down attacks like credential stuffing.',
  ],
  analogy: {
    title: 'The gate check and the wristband',
    body: 'At a music festival, the gate checks your identity card and your ticket once. That is the slow, careful step: a guard compares your face with the photo, scans the ticket and confirms you are on the list. Then you get a wristband, and for the rest of the weekend every bar and stage just glances at it.\n\nThe wristband also says what you may do: a plain band gets you onto the grounds, and a gold one also opens the backstage area. Checking who you are happens once, at the gate, while checking what you may do happens at every door. A wristband that could be copied, or that never expired, would undo all the care taken at the gate.',
  },
  whyItMatters:
    'With about 100 million daily users, Snapgram is now worth attacking. One Sunday night the login service sees ten times its usual traffic: millions of attempts, each with a different email and password, from thousands of addresses. Most fail, but a few hundred succeed, because those people reused a password that leaked from another website years ago.\n\nThe same week, an engineer finds a database password in a configuration file in the code repository, readable by everyone in the company. And a new partner integration asked for every permission, because that was easier than working out which ones it needs. None of this is a clever hack; each is a basic habit that slipped.',
  body: [
    { kind: 'heading', text: 'Who you are, and what you may do' },
    {
      kind: 'prose',
      md: '[[Authentication|authentication]] establishes who is calling: Maya, proven by her password or a code from her phone. [[Authorization|authorization]] decides what that caller may do: Maya may edit her own captions but not yours, and only the Prints support team may issue refunds. Authentication happens at login and is cheap to confirm afterwards, while authorization happens on every request, in the service that owns the data.',
    },
    {
      kind: 'prose',
      md: 'Never store passwords themselves. Store a [[password hash|password-hashing]]: the output of a deliberately slow one-way function such as Argon2id or bcrypt, mixed with a random [[salt|salt]] per user. A stolen table then reveals no passwords, and every guess costs the attacker real time. Add [[multi-factor authentication|multi-factor-authentication]] (MFA), a second proof such as a code from an app, and a leaked password alone no longer opens the account.',
    },
    { kind: 'heading', text: 'Staying logged in: sessions or tokens' },
    {
      kind: 'prose',
      md: 'After login, Snapgram must recognize Maya on every request without asking for her password again. That is the wristband, and it comes in two common forms. The classic one is a [[session|session]]: a random session identifier (ID), sent back in a [[cookie|cookie]], that points to a record in a shared [[session store|session-store]].',
    },
    {
      kind: 'sequence',
      title: 'Logging in, then staying logged in',
      caption: 'The password is checked once. After that, a session ID in a cookie identifies Maya on every request.',
      spec: loginFlow,
    },
    {
      kind: 'compare',
      left: {
        title: 'Server-side session',
        summary: 'A random key to a record the server keeps',
        points: [
          'Logging out or banning a user works at once: delete the record.',
          'The cookie holds nothing useful beyond the key itself.',
          'Every request costs a quick lookup in a store that must stay up.',
        ],
      },
      right: {
        title: 'Signed token',
        summary: 'A signed note the client carries',
        points: [
          'A [[JSON Web Token|jwt]] (JWT), named after the JavaScript Object Notation (JSON) text format, holds the user ID, permissions and an expiry time, signed with Snapgram’s key.',
          'Any service can check the signature without a lookup.',
          'It cannot be recalled before it expires, so it should live minutes, not days, and anyone holding it can read what is inside.',
        ],
      },
      caption: 'Many systems combine them: a session or a long-lived refresh token at the edge, and short-lived signed tokens for calls between services.',
    },
    { kind: 'heading', text: 'Sign in with Google: OAuth 2.0 at a glance' },
    {
      kind: 'prose',
      md: 'Many people would rather not create another password. “Sign in with Google” is built on [[OAuth 2.0|oauth]], a standard that lets one service vouch for a user to another through tokens, so Snapgram never sees Maya’s Google password. The identity part, which tells Snapgram who she is, comes from [[OpenID Connect|openid-connect]], a layer on top of OAuth.',
    },
    {
      kind: 'diagram',
      title: 'Sign in with Google',
      caption: 'The code is useless without Snapgram’s client secret, which never leaves its servers. Step through the flow.',
      spec: signInWithGoogle,
    },
    {
      kind: 'prose',
      md: 'OAuth also works the other way round. A partner app that posts to Snapgram for Maya gets an [[access token|access-token]] limited to the permissions she approved, which expires within an hour or so, plus a [[refresh token|refresh-token]] to get new ones. She can revoke the partner’s access at any time without changing her password.',
    },
    { kind: 'heading', text: 'Encryption in transit and at rest' },
    {
      kind: 'prose',
      md: '[[TLS|tls]] encrypts everything on the wire and proves the server’s identity with a [[certificate|certificate]]. Use [[HTTPS|https]] on every public endpoint and TLS between internal services too, because an attacker who gets inside the network should still read nothing. [[Mutual TLS|mutual-tls]], where both sides present certificates, also tells each service exactly who is calling.',
    },
    {
      kind: 'prose',
      md: '[[Encryption at rest|encryption-at-rest]] protects stored data: photo storage, database disks and backups are all encrypted, so a lost disk or a leaked backup is unreadable. The hard part is the keys. They live in a [[key management service|key-management-service]] (KMS), which never hands out its master keys and logs every use, so data and the keys that unlock it are never kept together.',
    },
    { kind: 'heading', text: 'Secrets and least privilege' },
    {
      kind: 'prose',
      md: 'A [[secret|secret]] is any credential a service needs: a database password, a signing key, or an [[API key|api-key]] for a partner’s application programming interface (API). Secrets never belong in code or in config files in the repository, where every engineer, laptop and backup can see them. Keep them in a [[secrets manager|secrets-manager]] that gives each service only its own secrets, logs every read and makes rotating a leaked one routine.',
    },
    {
      kind: 'prose',
      md: '[[Least privilege|least-privilege]] means each person, service and key gets only the permissions its job needs. The thumbnail service may read new uploads and write thumbnails, and nothing else, so if it is ever compromised the damage stops there. People are treated the same way: engineers get production access only when they need it, for a limited time, and every use is logged.',
    },
    { kind: 'heading', text: 'Making abuse expensive' },
    {
      kind: 'prose',
      md: '[[Credential stuffing|credential-stuffing]] is the attack from the story: trying username and password pairs leaked from other sites, betting that people reuse passwords. No single defense stops it, so you stack several, starting with the [[rate limits|rate-limiting]] from [Rate limiting](lesson:rate-limiting):\n\n- **Limits per account, device and address.** [[Token buckets|token-bucket]] at the gateway give each account, device and Internet Protocol (IP) address a handful of guesses a minute instead of thousands.\n- **A second factor**, so a correct password alone is not enough.\n- **Leaked-password checks** that refuse passwords known from earlier breaches.\n- **Extra challenges for risky logins**, such as a new device or an unusual country.\n- **Alerts** when the login failure rate jumps, so people see the attack while it happens.',
    },
    {
      kind: 'prose',
      md: 'The same tools, limits per user and per key plus alerts on unusual patterns, also slow down [[scrapers|scraper]] and spam bots.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Security is a field of its own, and this lesson covers only what a system designer is expected to know. It leaves out web attacks such as cross-site scripting and injection, how certificates are issued and renewed, and the details of each OAuth flow.',
    },
  ],
  tradeoffs: {
    caption: 'Ways to keep a user signed in.',
    rows: [
      {
        option: 'Server-side sessions',
        goodAt: 'Instant logout and bans, and a cookie that holds only a random key.',
        badAt: 'A lookup in a shared store on every request, and that store must stay fast and available.',
        pickWhen: 'Most web and mobile apps, and whenever you must be able to cut a user off at once.',
      },
      {
        option: 'Long-lived signed tokens',
        goodAt: 'No lookups: any service can verify them on its own.',
        badAt: 'Cannot be revoked before they expire, so a stolen token works for its whole life.',
        pickWhen: 'Rarely. Prefer short lifetimes.',
      },
      {
        option: 'Short-lived tokens with refresh tokens',
        goodAt: 'Cheap checks everywhere, and access ends within minutes once the refresh token is revoked.',
        badAt: 'More moving parts: refresh logic, signing-key rotation and clock differences between servers.',
        pickWhen: 'Many services must verify callers cheaply, or partner apps call your API.',
      },
      {
        option: 'Sign in with an outside provider',
        goodAt: 'No passwords to store, and users get the provider’s second factor.',
        badAt: 'You depend on the provider, and the flow has subtle security details.',
        pickWhen: 'Consumer apps whose users already have Google or Apple accounts, offered alongside your own login.',
      },
    ],
  },
  realWorld: {
    title: 'OWASP’s defenses against credential stuffing',
    body: 'The Open Worldwide Application Security Project (OWASP) publishes free security guidance, including a cheat sheet on preventing credential stuffing. It defines the attack as testing username and password pairs taken from another site’s breach. It calls multi-factor authentication by far the best defense, citing a Microsoft analysis that it would have stopped 99.9% of account compromises.\n\nBecause no defense is perfect, the cheat sheet recommends layers: challenges for suspicious logins, temporary limits on suspicious addresses, device fingerprinting, checking new passwords against known breaches and telling users about unusual sign-ins. It also advises assuming that any single control will eventually be bypassed.',
    sourceUrl: 'https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html',
    sourceLabel: 'OWASP Cheat Sheet Series, “Credential Stuffing Prevention Cheat Sheet”',
  },
  interview: {
    whenToMention:
      'Briefly in every design, when you draw the gateway: say where authentication happens, how sessions or tokens work, and that traffic is encrypted. Go deeper when the prompt involves money, private data or a public API, or when the interviewer asks how you would stop abuse.',
    sayItLikeThis: [
      'Clients authenticate at the gateway with a session cookie; the gateway passes a verified user ID on, and each service still checks authorization for the data it owns.',
      'Everything travels over TLS, including calls between services, and photos and backups are encrypted at rest with keys held in a key management service.',
      'Login is rate-limited per account and per IP address, risky logins get a second factor, and new passwords are checked against known breaches.',
    ],
    followUps: [
      {
        q: 'Would you use sessions or JWTs?',
        a: 'Sessions for the app’s users, because logouts and bans must take effect at once and a lookup costs about a millisecond. Between services, short-lived signed tokens let each service verify the caller without calling back. Long-lived tokens are the risky choice, because nothing can recall them.',
      },
      {
        q: 'How do you store passwords?',
        a: 'Never in plain text and never with a fast hash. I’d use a slow, salted password hash such as Argon2id, so every guess costs the attacker real time and equal passwords hash differently. Better still, offer multi-factor authentication and sign-in with Google or Apple, so fewer passwords matter.',
      },
      {
        q: 'A service’s database password leaks. What limits the damage, and what do you do?',
        a: 'Least privilege limits it: that password reaches only that service’s own tables, and only from inside the network. I’d rotate it through the secrets manager, restart the service to pick up the new one, and check the access logs for what was read.',
      },
    ],
    redFlags: [
      'Mixing up authentication and authorization, or checking authorization only at the gateway.',
      'Storing passwords encrypted, or with a fast general-purpose hash, instead of a slow, salted password hash.',
      'Putting secrets in code, in config files or inside tokens the client can read.',
    ],
  },
  mistakes: [
    '**Checking authorization only at the gateway.** A service that trusts every internal call hands anyone’s data to an attacker who gets one foothold inside.',
    '**Long-lived tokens.** A signed token cannot be recalled, so a stolen one that lasts a month gives the attacker a month.',
    '**Secrets in the repository.** Code is copied to laptops, build systems and backups, and a secret stays in the history even after the line is deleted.',
    '**One all-powerful account.** If every service connects as the same database user with full rights, one bug or leak exposes everything.',
    '**Fast password hashes.** General-purpose hashes are built for speed, which lets an attacker test enormous numbers of guesses against a stolen table.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Maya is logged in and tries to delete a photo that belongs to someone else. Which check should stop her?',
      options: [
        {
          text: 'Authorization in the photo service',
          correct: true,
          why: 'She is who she says she is. The question is what she may do, and the service that owns the photo must decide.',
        },
        { text: 'Authentication at the gateway', correct: false, why: 'Authentication already succeeded. It proves who she is, not what she may change.' },
        { text: 'TLS', correct: false, why: 'Encryption protects the request on the wire; it does not decide permissions.' },
        { text: 'Rate limiting', correct: false, why: 'Limits control how often she can act, not what she is allowed to do.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which are good reasons to choose server-side sessions over long-lived signed tokens?',
      options: [
        { text: 'You must be able to log a user out everywhere at once', correct: true, why: 'Deleting the session record ends it on the very next request.' },
        {
          text: 'A stolen session can be cut off right away',
          correct: true,
          why: 'Delete the record and the stolen ID stops working, while a signed token stays valid until it expires.',
        },
        { text: 'Services must verify callers without any lookup', correct: false, why: 'That favors signed tokens, which carry their own proof.' },
        { text: 'Sessions need no shared store', correct: false, why: 'They do need one, so that any server can find the record.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of “Sign in with Google” in order.',
      items: [
        'The app sends Maya to Google with the access it wants',
        'Maya signs in at Google and approves',
        'Google sends the app a one-time code',
        'Snapgram’s server trades the code and its client secret for tokens',
        'Snapgram checks the ID token and starts its own session',
      ],
      why: 'Google proves who Maya is, the one-time code carries that result back, and only Snapgram’s server, which holds the client secret, can turn the code into tokens.',
    },
    {
      kind: 'single',
      prompt: 'Where should Snapgram’s database password live?',
      options: [
        {
          text: 'In a secrets manager that hands it to the service at startup',
          correct: true,
          why: 'Only that service can read it, every read is logged, and rotating it is routine.',
        },
        {
          text: 'In a config file in the code repository',
          correct: false,
          why: 'Everyone with the code, and every copy of it, then has the password, and it stays in the history forever.',
        },
        {
          text: 'Typed by hand into each server’s settings',
          correct: false,
          why: 'Better than the repository, but nothing logs who read it, and rotating it means touching every server.',
        },
        { text: 'Inside the signed tokens the app holds', correct: false, why: 'Anyone holding a token can read what is inside it, so tokens must never carry secrets.' },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'Login attempts are limited to 5 per minute per IP (Internet Protocol) address. How many addresses would an attacker need to try 1 million leaked passwords in one hour?',
      answer: 3333,
      unit: 'addresses',
      tolerance: 1.1,
      solution: [
        'Each address gets 5 × 60 = 300 attempts per hour.',
        '1,000,000 ÷ 300 ≈ 3,333 addresses.',
        'Attackers can borrow that many addresses from hijacked devices and proxy services, which is why limits per address must be combined with limits per account and a second factor.',
      ],
    },
  ],
  takeaways: [
    'Authenticate once with a session or a short-lived token, and check authorization in every service, close to the data.',
    'Encrypt data in transit with TLS and at rest with keys kept apart from it, and keep secrets in a secrets manager, never in code.',
    'Give every service and person the least privilege they need, and make abuse expensive with layered defenses such as rate limits and multi-factor authentication.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**The roles in OAuth.** The standard, [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749) (Request for Comments 6749, from 2012), names four roles: the resource owner (Maya), the client (the app), the authorization server that issues tokens, and the resource server that holds the data. It describes an access token as standing for a specific scope and duration of access, and refresh tokens are never sent to resource servers. Mobile apps add Proof Key for Code Exchange (PKCE), so an intercepted code is useless on its own.',
    },
    {
      kind: 'prose',
      md: '**Envelope encryption.** Each file is encrypted with its own data key, and that data key is stored encrypted under a master key that never leaves the key management service. Reading a photo means asking the service to unwrap one small key, and rotating the master key means rewrapping small keys, not every photo.',
    },
    {
      kind: 'prose',
      md: '**Choosing a password hash.** OWASP’s [Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) recommends Argon2id first, scrypt when Argon2id is unavailable, and bcrypt only for older systems, each with a unique random salt per password.',
    },
  ],
  flashcards: [
    {
      front: 'What is the difference between authentication and authorization?',
      back: 'Authentication checks who the caller is; authorization checks what that caller may do, on every request.',
    },
    {
      front: 'Session or signed token: which can you cut off instantly?',
      back: 'A server-side session: delete its record and the next request fails. A signed token stays valid until it expires.',
    },
    { front: 'How should passwords be stored?', back: 'As a slow, salted password hash such as Argon2id, never in plain text and never with a fast general-purpose hash.' },
    {
      front: 'What does OAuth 2.0 let an app do?',
      back: 'Get limited, revocable access to a user’s account at another service through tokens, without ever seeing the user’s password.',
    },
    { front: 'Where do secrets belong?', back: 'In a secrets manager that gives each service only its own secrets and logs every read, never in code or config files.' },
    { front: 'What is least privilege?', back: 'Giving every person, service and key only the permissions its job needs, so a compromise stays small.' },
    {
      front: 'What is credential stuffing, and what stops it best?',
      back: 'Trying username and password pairs leaked from other sites. Multi-factor authentication stops most of it, with rate limits and leaked-password checks as extra layers.',
    },
  ],
  related: ['http-essentials', 'reverse-proxies-gateways', 'stateless-vs-stateful', 'rate-limiting', 'api-styles', 'multi-region-dr'],
  glossaryTerms: [
    'authentication',
    'authorization',
    'password-hashing',
    'salt',
    'multi-factor-authentication',
    'session',
    'cookie',
    'session-store',
    'jwt',
    'oauth',
    'openid-connect',
    'access-token',
    'refresh-token',
    'tls',
    'certificate',
    'https',
    'mutual-tls',
    'encryption-at-rest',
    'key-management-service',
    'secret',
    'api-key',
    'secrets-manager',
    'least-privilege',
    'credential-stuffing',
    'rate-limiting',
    'token-bucket',
    'scraper',
  ],
};

export default lesson;
