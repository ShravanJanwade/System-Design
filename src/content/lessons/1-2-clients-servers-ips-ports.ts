import type { DiagramSpec, Lesson } from '../types';

/** Static, labeled: one machine at 203.0.113.10 running three programs on three ports. */
const firstServer: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Maya’s phone', x: 0, y: 0 },
    { id: 'web', type: 'service', label: 'Web server', sublabel: 'port 443', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'port 5432, localhost only', x: 2, y: 0 },
    { id: 'laptop', type: 'client', label: 'Founder’s laptop', x: 0, y: 1 },
    { id: 'ssh', type: 'service', label: 'SSH server', sublabel: 'port 22', x: 1, y: 1 },
  ],
  edges: [
    { id: 'phone-web', from: 'phone', to: 'web', kind: 'sync', label: '203.0.113.10:443' },
    { id: 'web-db', from: 'web', to: 'db', kind: 'sync', label: 'localhost:5432' },
    { id: 'laptop-ssh', from: 'laptop', to: 'ssh', kind: 'sync', label: '203.0.113.10:22' },
  ],
  description:
    'Snapgram’s first server has one public address, 203.0.113.10, and runs three programs. Maya’s phone reaches the web server on port 443. A founder’s laptop reaches the SSH server on port 22. The web server reaches the database at localhost:5432, which accepts connections only from the same machine.',
};

/** Animated: one request finds its program, and a stranger is turned away. */
const findsItsProgram: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Maya’s phone', sublabel: 'port 52814', x: 0, y: 0 },
    { id: 'web', type: 'service', label: 'Web server', sublabel: 'port 443', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'localhost:5432', x: 2, y: 0 },
    { id: 'stranger', type: 'client', label: 'Stranger', sublabel: 'anywhere online', x: 2, y: 1 },
  ],
  edges: [
    { id: 'phone-web', from: 'phone', to: 'web', kind: 'sync' },
    { id: 'web-db', from: 'web', to: 'db', kind: 'sync' },
    { id: 'stranger-db', from: 'stranger', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Maya opens a photo. Her phone has Snapgram’s address, `203.0.113.10`, from a name lookup, and the port from the link: `https` means 443 unless the link says otherwise. Her end of the connection gets an ephemeral port, here 52814.',
      focus: ['phone'],
    },
    {
      caption:
        'The request travels to `203.0.113.10:443`. The server’s operating system sees port 443 and hands the data to the program listening there: the **web server**.',
      flow: ['phone-web'],
    },
    {
      caption: 'To build the page, the web server queries the **database** at `localhost:5432`. That connection never leaves the machine.',
      flow: ['web-db', '<web-db'],
    },
    {
      caption:
        'The response goes back to the address and port the request came from, port 52814 on Maya’s side, so it reaches the right app on her phone.',
      flow: ['<phone-web'],
    },
    {
      caption:
        'Meanwhile, a scanner tries `203.0.113.10:5432`, hoping to find an open database. Nothing listens on that port at the public address, so the connection is refused.',
      add: ['stranger'],
      flow: [{ edge: 'stranger-db', tag: 'refused', tone: 'alert' }],
    },
  ],
};

const lesson: Lesson = {
  id: 'clients-servers-ips-ports',
  module: 'm1',
  order: 2,
  title: 'Clients, servers, IPs and ports',
  idea: 'Every machine on a network has an Internet Protocol (IP) address, each program that accepts connections listens on a numbered port, and a client needs both to reach the right program on the right machine.',
  minutes: 12,
  prerequisites: ['life-of-a-request'],
  outcomes: [
    'Explain what makes a program a client or a server, and why one machine can run many servers.',
    'Read an address like `203.0.113.10:443` and say which part finds the machine and which finds the program.',
    'Tell localhost, private and public addresses apart, and say who can reach a program listening on each.',
  ],
  analogy: {
    title: 'A street address and an apartment number',
    body: 'A courier delivering a parcel to a big apartment building needs two things. The street address gets the parcel to the right building, and the apartment number gets it to the right door inside. With only the street address, the parcel sits in the lobby.\n\nNetworks work the same way. The IP address is the street address: it finds the machine. The port is the apartment number: it finds the program inside that should get the message, and some doors open only to people already inside the building.',
  },
  whyItMatters:
    'The founders rent Snapgram’s first [[server|server]], a machine in a [[data center|data-center]] in Oregon. The hosting company gives it a [[public IP address|public-ip-address]], `203.0.113.10`, that anyone on the internet can reach. On it they run two programs: the web server that answers browsers, and PostgreSQL, the [[database|database]].\n\nTwo questions come up right away. When a request arrives at `203.0.113.10`, how does it reach the web server and not the database? And how do they stop strangers on the internet from connecting to the database directly? The answers are ports, and the difference between localhost and the internet.',
  body: [
    { kind: 'heading', text: 'Clients and servers' },
    {
      kind: 'prose',
      md: 'A server is a program that waits for requests and answers them. A [[client|client]] is the program that starts the conversation: a browser, a phone app, or another server. The word server also names the machine the program runs on, which is why people say “the server” for both.\n\nThe roles are about who asks, not about hardware. Snapgram’s **web server** is a server to Maya’s phone, but a client when it asks the **database** for a photo’s details.',
    },
    { kind: 'heading', text: 'IP addresses find the machine' },
    {
      kind: 'prose',
      md: 'Every machine on a network has an [[IP address|ip-address]]. The classic form, [[IPv4|ipv4]], is four numbers from 0 to 255, like `203.0.113.10`: 32 bits, about 4.3 billion addresses in all. That is fewer than the devices online, so the newer [[IPv6|ipv6]] uses 128 bits, written in hexadecimal groups like `2001:db8::10`.\n\nAddresses also differ in who can reach them. A public address can receive traffic from anywhere on the internet. A [[private IP address|private-ip-address]], from ranges such as `10.x.x.x` or `192.168.x.x`, works only inside a local network, and a router uses [[network address translation|nat]] (NAT) to share one public address among many private ones.',
    },
    { kind: 'heading', text: 'Ports find the program' },
    {
      kind: 'prose',
      md: 'One machine runs many programs, so an address alone is not enough. A [[port|port]] is a number from 0 to 65,535 that picks one program on the machine. A program **listens** on a port, and when data arrives for that port, the operating system hands it to that program. Common services have standard ports, so clients know where to knock.\n\nThe client’s side of a connection needs a port too: the operating system picks an [[ephemeral port|ephemeral-port]], a temporary number for that one connection. A connection is identified by four values, both addresses and both ports, which is how one web server keeps thousands of visitors apart on the same port 443.',
    },
    {
      kind: 'table',
      columns: ['Port', 'Service', 'What it is for'],
      rows: [
        ['22', 'SSH (Secure Shell)', 'Logging in to a server to manage it'],
        ['53', 'DNS (Domain Name System)', 'Looking up names, covered in the next lesson'],
        ['80', 'HTTP (Hypertext Transfer Protocol)', 'Web pages without encryption'],
        ['443', 'HTTPS (encrypted HTTP)', 'Web pages and app traffic, encrypted'],
        ['5432', 'PostgreSQL', 'A widely used open-source database'],
        ['6379', '[[Redis|redis]]', 'A popular in-memory cache'],
      ],
      caption: 'Default ports for common services. Any program can use any free port; these are conventions.',
    },
    {
      kind: 'prose',
      md: 'The program behind each port speaks a [[protocol|protocol]]: an agreed set of rules for who says what, in what order. Port 443 expects HTTPS. Send it something else and it answers with an error or hangs up.',
    },
    { kind: 'heading', text: 'Localhost and the internet' },
    {
      kind: 'prose',
      md: 'Every machine also has a name for itself: [[localhost|localhost]], at address `127.0.0.1`. Traffic sent there never leaves the machine. So a program listening on `127.0.0.1` accepts connections only from programs on the same machine, while a program listening on `0.0.0.0` accepts them on every address the machine has, including its public one.\n\nThat choice keeps Snapgram’s database private. The **web server** listens on all addresses at port 443, and the **database** listens on `127.0.0.1:5432`, so the web server can reach it but nobody else can. A [[firewall|firewall]] adds a second layer by blocking every port the founders have not opened on purpose.',
    },
    {
      kind: 'annotated',
      title: 'What is listening on Snapgram’s server',
      caption: 'Simplified output of `ss -ltn`, a Linux command that lists the ports programs are listening on.',
      lines: [
        { code: 'State   Local address:port' },
        { code: 'LISTEN  0.0.0.0:443', note: 'The web server, reachable on every address the machine has, including the public one.' },
        { code: 'LISTEN  0.0.0.0:22', note: 'SSH, so the founders can log in and manage the machine.' },
        { code: 'LISTEN  127.0.0.1:5432', note: 'The database, reachable only from this machine.' },
      ],
    },
    {
      kind: 'diagram',
      title: 'Snapgram’s first server',
      caption: 'One machine, one public address, three programs on three ports. Only the database is limited to localhost.',
      spec: firstServer,
    },
    {
      kind: 'diagram',
      title: 'A request finds its program',
      caption: 'The address gets the request to the machine; the port gets it to the program. Use Play, or the arrow keys.',
      spec: findsItsProgram,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson skips how packets find their way across the internet, how NAT keeps track of connections, and most of IPv6. It also treats the firewall as a simple list of open ports; cloud providers offer richer versions, often called security groups.',
    },
  ],
  tradeoffs: {
    caption: 'Where a program listens, and who can reach it.',
    rows: [
      {
        option: 'Localhost only',
        goodAt: 'Nothing outside the machine can connect, whatever the firewall says.',
        badAt: 'Only programs on the same machine can use it.',
        pickWhen: 'A database or admin tool that one server uses, like Snapgram’s first database.',
      },
      {
        option: 'A private address',
        goodAt: 'Other servers on the same network can connect; the internet cannot.',
        badAt: 'Needs a private network between servers, with access rules inside it.',
        pickWhen: 'Several app servers share one database or cache.',
      },
      {
        option: 'A public address',
        goodAt: 'Anyone on the internet can connect.',
        badAt: 'Anyone on the internet can connect, including scanners looking for weak spots.',
        pickWhen: 'The program must serve users directly, like a web server or load balancer.',
      },
      {
        option: 'Public, behind a firewall',
        goodAt: 'Only the ports you open are reachable.',
        badAt: 'One wrong rule exposes a port you meant to keep closed.',
        pickWhen: 'Always, for any machine with a public address.',
      },
    ],
  },
  realWorld: {
    title: 'The internet ran out of IPv4 addresses',
    body: 'IPv4 has room for about 4.3 billion addresses, fewer than the devices online today. In February 2011, the body that hands out address blocks [gave its last ones](https://www.nro.net/ipv4-free-pool-depleted/) to the five regional registries, which announced that deploying IPv6 was now a requirement rather than an option.\n\nThe scarcity now shows up on bills. In 2023, Amazon Web Services announced a charge of $0.005 per hour for every public IPv4 address from February 2024, noting that the cost of acquiring one had risen more than 300% in five years. That is about $44 a year per address, and one more reason to give public addresses only to machines that must face the internet.',
    sourceUrl: 'https://aws.amazon.com/blogs/aws/new-aws-public-ipv4-address-charge-public-ip-insights/',
    sourceLabel: 'Jeff Barr, “New – AWS Public IPv4 Address Charge + Public IP Insights,” AWS News Blog (2023)',
  },
  interview: {
    whenToMention:
      'When you draw the high-level design, and whenever security comes up. You rarely say port numbers aloud, but you should know which parts face the internet (the load balancer, the content delivery network) and which sit on private addresses (app servers, caches, databases). Saying so shows you think about what attackers can reach, not just about boxes.',
    sayItLikeThis: [
      'Only the load balancer gets a public IP address. The app servers, the cache and the database sit on private addresses, so the internet can’t reach them directly.',
      'Each service listens on its own port, so while we’re small we can run several on one machine, and later split them onto separate machines without changing how they talk.',
    ],
    followUps: [
      {
        q: 'How does one server keep thousands of connections apart when they all use port 443?',
        a: 'Each connection is identified by four values: the client’s address and port and the server’s address and port. Every client differs in its address or its ephemeral port, so every connection is unique even though they share 443.',
      },
      {
        q: 'Why not give every server a public IP address?',
        a: 'Every public address can be reached by anyone, including automated scanners, so each machine would need hardening and constant patching. Public IPv4 addresses also cost money. One public entry point, such as a load balancer, with private addresses behind it keeps the exposed surface small.',
      },
      {
        q: 'What is the difference between listening on 127.0.0.1 and on 0.0.0.0?',
        a: 'On 127.0.0.1, only programs on the same machine can connect. On 0.0.0.0, the program accepts connections on every address the machine has, including public ones, so outside machines can connect unless a firewall blocks them.',
      },
    ],
    redFlags: [
      'Putting the database on a public address so the app servers can reach it.',
      'Believing one IP address can run only one service.',
      'Assuming a setup that worked on localhost is safe on a public server.',
    ],
  },
  mistakes: [
    '**Exposing the database.** Automated scanners probe public addresses all the time, so a database listening on one will be found. Keep it on localhost or a private network.',
    '**Mixing up machine and program.** A server machine runs many programs, and the port says which one you mean.',
    '**Trusting “it works on my laptop”.** On localhost, browser and server share a machine, so firewalls, addresses and ports never get in the way. Once deployed, they all matter.',
    '**Hard-coding IP addresses.** Addresses change when servers move. Use names and let DNS translate them, as the next lesson shows.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'In `203.0.113.10:5432`, what does `5432` identify?',
      options: [
        { text: 'A program on that machine, here the database', correct: true, why: 'The port picks the program; the address before the colon picks the machine.' },
        { text: 'The machine on the network', correct: false, why: 'That is the job of the IP address, `203.0.113.10`.' },
        { text: 'The client’s side of the connection', correct: false, why: 'The client has its own ephemeral port. This one belongs to the server.' },
        { text: 'The data center', correct: false, why: 'Addresses and ports identify machines and programs, not buildings.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'Snapgram’s database listens on `127.0.0.1:5432`. Who can connect to it?',
      options: [
        { text: 'Only programs on the same machine', correct: true, why: 'Traffic to 127.0.0.1 never leaves the machine, so only local programs, like the web server, can reach it.' },
        { text: 'Anyone who knows the server’s public address', correct: false, why: 'The database does not listen on the public address, so those connections are refused.' },
        { text: 'Any machine in the same data center', correct: false, why: 'That would need the database to listen on a private address, not on localhost.' },
        { text: 'Nobody, until a firewall rule allows it', correct: false, why: 'Local programs connect without crossing the firewall at all.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these addresses are private, so the internet cannot send traffic to them directly?',
      options: [
        { text: '`10.0.0.5`', correct: true, why: 'Everything from 10.0.0.0 to 10.255.255.255 is a private range.' },
        { text: '`192.168.1.20`', correct: true, why: 'The 192.168.x.x range is private, which is why so many home routers use it.' },
        { text: '`172.16.4.2`', correct: true, why: 'The range from 172.16.0.0 to 172.31.255.255 is private too.' },
        { text: '`8.8.8.8`', correct: false, why: 'A public address, used by Google’s public DNS service.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of Maya’s photo request in order.',
      items: [
        'Her phone looks up snapgram.com and gets `203.0.113.10`',
        'Her phone connects to `203.0.113.10:443` from an ephemeral port',
        'The operating system hands the data to the program on port 443',
        'The web server queries the database at `localhost:5432`',
        'The response returns to her phone’s ephemeral port',
      ],
      why: 'The phone needs an address before it can connect, the machine must route the data to a program before any code runs, and the reply can only be addressed once the request has arrived.',
    },
    {
      kind: 'numeric',
      prompt: 'IPv4 addresses are 32 bits long. About how many different addresses is that, in billions?',
      answer: 4.3,
      unit: 'billion',
      tolerance: 1.1,
      solution: [
        '2 to the power of 32 is 4,294,967,296.',
        'That is about 4.3 billion addresses.',
        'It is fewer than the devices online, which is why addresses are shared and IPv6 exists.',
      ],
    },
  ],
  takeaways: [
    'A server is a program that waits for requests, a client starts them, and one machine can run many servers.',
    'The IP address finds the machine and the port finds the program, so `203.0.113.10:443` names one program on one machine.',
    'A program listening on localhost is reachable only from its own machine, which is where a database that only the app needs should stay.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**IPv6 changes the picture.** With 128-bit addresses, every device can have its own public address, so sharing through NAT is no longer needed. Whether a device is reachable then depends on firewalls rather than on scarcity, which makes them more important, not less.',
    },
    {
      kind: 'prose',
      md: '**Privileged ports.** On Linux, a program needs special permission to listen on ports below 1024. That is one reason web servers often start with extra rights and drop them, or sit behind a load balancer that listens on 443 for them.',
    },
    {
      kind: 'prose',
      md: '**Containers have their own localhost.** Inside a container, `127.0.0.1` is the container itself, not the machine it runs on. A database container listening only on localhost cannot be reached from the app container next to it, a classic first-day puzzle.',
    },
  ],
  flashcards: [
    { front: 'What is a server, and what is a client?', back: 'A server is a program that waits for requests and answers them; a client is the program that starts the conversation.' },
    { front: 'What does an IP address identify? What does a port identify?', back: 'The IP address identifies a machine on a network; the port identifies one program on that machine.' },
    { front: 'What is localhost?', back: 'A machine’s name for itself, usually 127.0.0.1. Connections to it never leave the machine.' },
    { front: 'What are the default ports for SSH, HTTP, HTTPS and PostgreSQL?', back: '22, 80, 443 and 5432.' },
    { front: 'Which IPv4 ranges are private?', back: '10.0.0.0 to 10.255.255.255, 172.16.0.0 to 172.31.255.255, and 192.168.0.0 to 192.168.255.255.' },
    { front: 'What does listening on 0.0.0.0 mean?', back: 'Accepting connections on every address the machine has, including public ones, unless a firewall blocks them.' },
    { front: 'Why do most devices share a public IPv4 address?', back: 'IPv4 has only about 4.3 billion addresses, so routers use NAT to share one public address among many private ones.' },
  ],
  related: ['life-of-a-request', 'dns', 'tcp-vs-udp', 'http-essentials', 'load-balancers', 'security-essentials'],
  glossaryTerms: [
    'server',
    'data-center',
    'public-ip-address',
    'database',
    'client',
    'ip-address',
    'ipv4',
    'ipv6',
    'private-ip-address',
    'nat',
    'port',
    'ephemeral-port',
    'redis',
    'protocol',
    'localhost',
    'firewall',
  ],
};

export default lesson;
