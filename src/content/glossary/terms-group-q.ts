import type { RawTerm } from '../types';

/** New glossary terms from lesson group Q (lessons 6.1 and 6.2). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  // 6.1 Monolith, modular monolith, microservices
  {
    id: 'deploy',
    term: 'Deploy',
    aka: ['deployment', 'release'],
    definition: 'Putting a new version of code onto the servers that run it, so users get the change.',
    example: 'Every change to Snapgram’s core app ships in one deploy, which now takes hours.',
  },
  {
    id: 'coupling',
    term: 'Coupling',
    aka: ['tight coupling'],
    definition: 'How much one part of a system depends on another’s inner details, so that changing one forces changes, tests or releases in the other.',
    example: 'Comments read the feed’s tables directly, so a change to the feed broke comments.',
  },
  {
    id: 'modular-monolith',
    term: 'Modular monolith',
    definition: 'One program with one deploy, whose code is split into modules that each own their data and talk only through public interfaces.',
    example: 'Snapgram’s core app gets photo, feed, notification and Prints modules, each owned by one team.',
  },
  {
    id: 'bounded-context',
    term: 'Bounded context',
    definition: 'A part of the business with its own data, words and rules, which makes a natural boundary for a module or service.',
    example: 'In Prints, an “order” means a photo book with a price and a print shop; the feed never uses the word.',
  },
  {
    id: 'blast-radius',
    term: 'Blast radius',
    definition: 'How much of a system, and how many users, a single failure or bad change can affect.',
    example: 'A crash in the notification service no longer takes login and payments down with it.',
  },
  {
    id: 'database-per-service',
    term: 'Database per service',
    definition: 'The rule that each service keeps its data in a store only it can touch; others ask through its interface or read its events.',
    example: 'Only the payment service reads the payment tables; Prints asks it to charge a card.',
  },
  {
    id: 'distributed-monolith',
    term: 'Distributed monolith',
    definition: 'Services deployed separately but so tangled, through shared tables or chains of calls, that they still must change and release together.',
    example: 'If the feed and photo services both write the same photos table, neither can change it alone.',
  },
  {
    id: 'strangler-fig',
    term: 'Strangler fig pattern',
    aka: ['strangler pattern'],
    definition: 'Replacing an old system piece by piece: a router sends one feature at a time to new code until the old part can be retired.',
    example: 'The gateway sends photo requests to the new photo service, while everything else still reaches the core app.',
  },
  {
    id: 'conways-law',
    term: 'Conway’s law',
    definition: 'The observation that a system’s structure tends to mirror the communication structure of the organization that builds it.',
    example: 'Snapgram’s photo, feed, notification and payment services line up with its four teams.',
  },

  // 6.2 How services find and talk to each other
  {
    id: 'instance',
    term: 'Instance',
    definition: 'One running copy of a service. A busy service runs many identical instances, which start and stop as load changes.',
    example: 'At the evening peak the photo service runs 12 instances; at night, 4.',
  },
  {
    id: 'service-registry',
    term: 'Service registry',
    definition: 'A small, replicated database that maps each service name to the current addresses of its healthy instances.',
    example: 'The registry says “photos” is at 10.0.3.17 and 10.0.3.24, port 8080.',
  },
  {
    id: 'client-side-discovery',
    term: 'Client-side discovery',
    definition: 'Service discovery where the caller asks the registry for a service’s instances and picks one itself.',
    example: 'The feed gets three photo addresses and takes turns calling them.',
  },
  {
    id: 'server-side-discovery',
    term: 'Server-side discovery',
    definition: 'Service discovery where the caller sends requests to one stable name, and a load balancer or the platform picks a healthy instance.',
    example: 'The feed just calls “photos”, and the platform forwards each call to a live instance.',
  },
  {
    id: 'synchronous-communication',
    term: 'Synchronous communication',
    aka: ['synchronous call', 'request-response'],
    definition: 'The caller sends a request and waits for the reply before carrying on, as in a REST or gRPC call.',
    example: 'The feed waits for the photo service’s answer before it builds the page.',
  },
  {
    id: 'asynchronous-communication',
    term: 'Asynchronous communication',
    aka: ['asynchronous messaging'],
    definition: 'The sender hands off a message or event and carries on without waiting; receivers handle it later, in their own time.',
    example: 'The upload service publishes “photo uploaded” and answers Maya at once; search indexes the photo a moment later.',
  },
  {
    id: 'message-broker',
    term: 'Message broker',
    aka: ['broker'],
    definition: 'A server that receives messages or events from producers, stores them safely and delivers them to consumers, such as Kafka or RabbitMQ.',
    example: 'Snapgram’s broker holds “photo uploaded” events until search is ready for them.',
  },
  {
    id: 'kubernetes',
    term: 'Kubernetes',
    aka: ['K8s'],
    definition: 'An open-source platform that runs containers across many machines, restarting, scaling and connecting them, with built-in service discovery.',
    example: 'Snapgram’s services run on Kubernetes, which gives each one a stable name.',
  },
  {
    id: 'sidecar',
    term: 'Sidecar',
    aka: ['sidecar proxy'],
    definition: 'A helper process, usually a proxy, that runs beside each instance of a service and handles shared jobs such as retries and encryption.',
    example: 'Every photo instance gets a sidecar that encrypts and retries its calls to the feed.',
  },
  {
    id: 'control-plane',
    term: 'Control plane',
    aka: ['data plane'],
    definition: 'The part of a system that decides and distributes the rules, such as routes and limits, while the data plane carries the actual traffic.',
    example: 'The mesh’s control plane tells every sidecar to send 5% of feed traffic to the new version.',
  },
];
