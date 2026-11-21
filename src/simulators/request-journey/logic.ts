/**
 * Request journey: every hop a browser makes to load one Snapgram photo page,
 * with ballpark latencies. The user is on another continent from Snapgram's servers.
 *
 * All numbers are rough orders of magnitude, chosen to be typical rather than exact.
 */
import type { DiagramSpec } from '@/content/types';

export type JourneyOptions = {
  /** A nearby DNS cache (the resolver's) already knows snapgram.com. */
  dnsCached: boolean;
  /** Photos and connections go through a nearby CDN edge. */
  cdn: boolean;
};

export type HopPhase = 'dns' | 'connect' | 'request' | 'server' | 'response' | 'asset' | 'render';

export type Hop = {
  id: string;
  phase: HopPhase;
  /** Short label for the hop list. */
  label: string;
  /** One sentence on what happens. */
  detail: string;
  ms: number;
  /** Edge in the journey diagram that this hop travels, and in which direction. */
  edge?: string;
  reverse?: boolean;
  /** Node where the time is spent, for hops that do work rather than travel. */
  at?: string;
  /** The hop goes there and back (a full round trip) rather than one way. */
  roundTrip?: boolean;
  startMs: number;
};

/** Ballpark latencies, in milliseconds. */
export const LATENCY = {
  resolverRtt: 10,
  rootRtt: 20,
  tldRtt: 30,
  authRtt: 40,
  originRtt: 150,
  edgeRtt: 10,
  appWork: 5,
  dbQuery: 3,
  photoRead: 5,
  edgeHit: 1,
  render: 50,
} as const;

type RawHop = Omit<Hop, 'startMs'>;

export function buildJourney(opts: JourneyOptions): { hops: Hop[]; totalMs: number; byPhase: Record<HopPhase, number> } {
  const L = LATENCY;
  const raw: RawHop[] = [];

  // 1. DNS
  if (opts.dnsCached) {
    raw.push({
      id: 'dns-cached', roundTrip: true,
      phase: 'dns',
      label: 'DNS answer from cache',
      detail: 'The resolver already knows snapgram.com, so one short round trip returns the IP address.',
      ms: L.resolverRtt,
      edge: 'browser-resolver',
    });
  } else {
    raw.push(
      {
        id: 'dns-ask',
        phase: 'dns',
        label: 'Ask the resolver',
        detail: 'The browser asks its DNS resolver for snapgram.com. The resolver has no cached answer.',
        ms: L.resolverRtt / 2,
        edge: 'browser-resolver',
      },
      {
        id: 'dns-root', roundTrip: true,
        phase: 'dns',
        label: 'Root server',
        detail: 'The resolver asks a root server, which replies: ask the .com servers.',
        ms: L.rootRtt,
        edge: 'resolver-root',
      },
      {
        id: 'dns-tld', roundTrip: true,
        phase: 'dns',
        label: '.com TLD server',
        detail: 'The .com server replies: ask Snapgram’s authoritative name servers.',
        ms: L.tldRtt,
        edge: 'resolver-tld',
      },
      {
        id: 'dns-auth', roundTrip: true,
        phase: 'dns',
        label: 'Authoritative server',
        detail: 'Snapgram’s name server gives the final answer: the IP address, valid for its TTL.',
        ms: L.authRtt,
        edge: 'resolver-auth',
      },
      {
        id: 'dns-reply',
        phase: 'dns',
        label: 'Answer to the browser',
        detail: 'The resolver caches the answer and passes it back to the browser.',
        ms: L.resolverRtt / 2,
        edge: 'browser-resolver',
        reverse: true,
      },
    );
  }

  const rtt = opts.cdn ? L.edgeRtt : L.originRtt;
  const peer = opts.cdn ? 'CDN edge' : 'web server';
  const firstEdge = opts.cdn ? 'browser-edge' : 'browser-server';

  // 2. Connection setup
  raw.push(
    {
      id: 'tcp', roundTrip: true,
      phase: 'connect',
      label: 'TCP handshake',
      detail: `One round trip to the ${peer} to open a reliable connection.`,
      ms: rtt,
      edge: firstEdge,
    },
    {
      id: 'tls', roundTrip: true,
      phase: 'connect',
      label: 'TLS handshake',
      detail: `One more round trip (TLS 1.3) to agree on encryption keys with the ${peer}.`,
      ms: rtt,
      edge: firstEdge,
    },
  );

  // 3. The page request
  if (opts.cdn) {
    raw.push(
      {
        id: 'req-edge',
        phase: 'request',
        label: 'Request to the edge',
        detail: 'GET /photo/123 travels to the nearby CDN edge.',
        ms: L.edgeRtt / 2,
        edge: 'browser-edge',
      },
      {
        id: 'req-origin',
        phase: 'request',
        label: 'Edge forwards to origin',
        detail: 'The page is personal, so the edge cannot cache it. It forwards the request over a connection it keeps open.',
        ms: L.originRtt / 2,
        edge: 'edge-server',
      },
    );
  } else {
    raw.push({
      id: 'req',
      phase: 'request',
      label: 'Request travels',
      detail: 'GET /photo/123 crosses the ocean to the web server: half a round trip.',
      ms: L.originRtt / 2,
      edge: 'browser-server',
    });
  }

  // 4. Server work
  raw.push(
    {
      id: 'app',
      phase: 'server',
      label: 'App code runs',
      detail: 'The web server checks the session and builds the page.',
      ms: L.appWork,
      at: 'server',
    },
    {
      id: 'db', roundTrip: true,
      phase: 'server',
      label: 'Database query',
      detail: 'A query in the same data center: about half a millisecond each way plus the query itself.',
      ms: L.dbQuery,
      edge: 'server-db',
    },
  );

  // 5. Response
  if (opts.cdn) {
    raw.push(
      {
        id: 'res-origin',
        phase: 'response',
        label: 'Response to the edge',
        detail: 'The HTML travels back to the edge.',
        ms: L.originRtt / 2,
        edge: 'edge-server',
        reverse: true,
      },
      {
        id: 'res-edge',
        phase: 'response',
        label: 'Response to the browser',
        detail: 'The edge hands the HTML to the browser.',
        ms: L.edgeRtt / 2,
        edge: 'browser-edge',
        reverse: true,
      },
    );
  } else {
    raw.push({
      id: 'res',
      phase: 'response',
      label: 'Response travels back',
      detail: '200 OK and the HTML cross the ocean back to the browser.',
      ms: L.originRtt / 2,
      edge: 'browser-server',
      reverse: true,
    });
  }

  // 6. The photo itself
  raw.push(
    opts.cdn
      ? {
          id: 'photo', roundTrip: true,
          phase: 'asset',
          label: 'Photo from the edge',
          detail: 'The photo is the same for everyone, so the edge has a cached copy: one short round trip.',
          ms: L.edgeRtt + L.edgeHit,
          edge: 'browser-edge',
        }
      : {
          id: 'photo', roundTrip: true,
          phase: 'asset',
          label: 'Photo from origin',
          detail: 'The browser reuses the open connection, but the photo still makes a full ocean round trip.',
          ms: L.originRtt + L.photoRead,
          edge: 'browser-server',
        },
  );

  // 7. Render
  raw.push({
    id: 'render',
    phase: 'render',
    label: 'Render',
    detail: 'The browser lays out the page and paints the photo.',
    ms: L.render,
    at: 'browser',
  });

  let t = 0;
  const hops: Hop[] = raw.map((h) => {
    const hop = { ...h, startMs: t };
    t += h.ms;
    return hop;
  });

  const byPhase: Record<HopPhase, number> = { dns: 0, connect: 0, request: 0, server: 0, response: 0, asset: 0, render: 0 };
  for (const h of hops) byPhase[h.phase] += h.ms;

  return { hops, totalMs: t, byPhase };
}

/** The diagram the simulator animates: the classic journey, plus a CDN edge when it is on. */
export function journeyDiagram(opts: JourneyOptions): DiagramSpec {
  const nodes: DiagramSpec['nodes'] = [
    { id: 'browser', type: 'client', label: 'Browser', sublabel: 'Singapore', x: 0, y: 1 },
    { id: 'resolver', type: 'dns', label: 'DNS resolver', x: 1, y: 0 },
    { id: 'root', type: 'dns', label: 'Root server', x: 2, y: 0 },
    { id: 'tld', type: 'dns', label: '.com TLD server', x: 2, y: 1 },
    { id: 'auth', type: 'dns', label: 'Authoritative', sublabel: 'snapgram.com', x: 2, y: 2 },
    { id: 'server', type: 'service', label: 'Web server', sublabel: 'Oregon', x: opts.cdn ? 2 : 1, y: 3 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: opts.cdn ? 3 : 2, y: 3 },
  ];
  const edges: DiagramSpec['edges'] = [
    { id: 'browser-resolver', from: 'browser', to: 'resolver', kind: 'sync' },
    { id: 'resolver-root', from: 'resolver', to: 'root', kind: 'sync' },
    { id: 'resolver-tld', from: 'resolver', to: 'tld', kind: 'sync' },
    { id: 'resolver-auth', from: 'resolver', to: 'auth', kind: 'sync' },
    { id: 'server-db', from: 'server', to: 'db', kind: 'sync' },
  ];
  if (opts.cdn) {
    nodes.push({ id: 'edge', type: 'cdn', label: 'CDN edge', sublabel: 'Singapore', x: 1, y: 3 });
    edges.push(
      { id: 'browser-edge', from: 'browser', to: 'edge', kind: 'sync' },
      { id: 'edge-server', from: 'edge', to: 'server', kind: 'sync' },
    );
  } else {
    edges.push({ id: 'browser-server', from: 'browser', to: 'server', kind: 'sync' });
  }
  // Phones: the browser on top, the resolver and the DNS servers down the left and middle, the request path on the right.
  const narrow = {
    grid: { cols: 3, rows: 5 },
    positions: {
      browser: { x: 1, y: 0 },
      resolver: { x: 0, y: 1 },
      root: { x: 1, y: 2 },
      tld: { x: 1, y: 3 },
      auth: { x: 1, y: 4 },
      ...(opts.cdn ? { edge: { x: 2, y: 1 }, server: { x: 2, y: 2 }, db: { x: 2, y: 3 } } : { server: { x: 2, y: 1 }, db: { x: 2, y: 2 } }),
    },
  };
  return { grid: { cols: opts.cdn ? 4 : 3, rows: 4 }, nodes, edges, narrow };
}
