import { describe, expect, it } from 'vitest';
import { lintDiagram } from '@/diagram/chips';
import { PHONE_MIN_SCALE, phoneScale } from '@/diagram/phone';
import { LATENCY, buildJourney, journeyDiagram } from './logic';

const all = [
  { dnsCached: false, cdn: false },
  { dnsCached: true, cdn: false },
  { dnsCached: false, cdn: true },
  { dnsCached: true, cdn: true },
];

describe('buildJourney', () => {
  it('adds up hop times into the total, with contiguous start times', () => {
    for (const opts of all) {
      const { hops, totalMs } = buildJourney(opts);
      expect(hops.reduce((s, h) => s + h.ms, 0)).toBe(totalMs);
      for (let i = 1; i < hops.length; i++) expect(hops[i]!.startMs).toBe(hops[i - 1]!.startMs + hops[i - 1]!.ms);
    }
  });

  it('a cold DNS lookup visits root, TLD and authoritative servers', () => {
    const ids = buildJourney({ dnsCached: false, cdn: false }).hops.map((h) => h.id);
    expect(ids).toEqual(expect.arrayContaining(['dns-root', 'dns-tld', 'dns-auth']));
    expect(ids.indexOf('dns-root')).toBeLessThan(ids.indexOf('dns-tld'));
    expect(ids.indexOf('dns-tld')).toBeLessThan(ids.indexOf('dns-auth'));
  });

  it('a cached DNS answer saves the cold-lookup time', () => {
    const cold = buildJourney({ dnsCached: false, cdn: false });
    const warm = buildJourney({ dnsCached: true, cdn: false });
    expect(cold.byPhase.dns - warm.byPhase.dns).toBe(LATENCY.rootRtt + LATENCY.tldRtt + LATENCY.authRtt);
  });

  it('DNS always happens before the TCP handshake, and TCP before TLS', () => {
    for (const opts of all) {
      const ids = buildJourney(opts).hops.map((h) => h.id);
      const lastDns = Math.max(...ids.map((id, i) => (id.startsWith('dns') ? i : -1)));
      expect(lastDns).toBeLessThan(ids.indexOf('tcp'));
      expect(ids.indexOf('tcp')).toBeLessThan(ids.indexOf('tls'));
    }
  });

  it('the CDN shortens the handshakes and the photo but not the trip to the origin', () => {
    const direct = buildJourney({ dnsCached: true, cdn: false });
    const cdn = buildJourney({ dnsCached: true, cdn: true });
    expect(cdn.byPhase.connect).toBe(2 * LATENCY.edgeRtt);
    expect(direct.byPhase.connect).toBe(2 * LATENCY.originRtt);
    expect(cdn.byPhase.asset).toBeLessThan(direct.byPhase.asset);
    // The personalized page still crosses the ocean once each way.
    expect(cdn.byPhase.request + cdn.byPhase.response).toBeGreaterThanOrEqual(LATENCY.originRtt);
  });

  it('the fastest setting is roughly three times faster than the slowest', () => {
    const slow = buildJourney({ dnsCached: false, cdn: false }).totalMs;
    const fast = buildJourney({ dnsCached: true, cdn: true }).totalMs;
    expect(slow / fast).toBeGreaterThan(2.5);
    expect(slow / fast).toBeLessThan(3.5);
  });

  it('every travelling hop names an edge that exists in the diagram', () => {
    for (const opts of all) {
      const edges = new Set(journeyDiagram(opts).edges.map((e) => e.id));
      for (const hop of buildJourney(opts).hops) if (hop.edge) expect(edges.has(hop.edge)).toBe(true);
    }
  });
});

describe('journeyDiagram', () => {
  it('lays out cleanly with and without the CDN', () => {
    for (const opts of all) {
      for (const mode of ['wide', 'compact', 'narrow'] as const) {
        expect(lintDiagram(journeyDiagram(opts), [mode])).toEqual([]);
        expect(phoneScale(journeyDiagram(opts))).toBeGreaterThanOrEqual(PHONE_MIN_SCALE);
      }
    }
  });
});
