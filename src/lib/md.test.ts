import { describe, expect, it } from 'vitest';
import { countSentences, linkHrefs, mdToPlain, parseInline, parseMd, termIds } from './md';

describe('parseInline', () => {
  it('parses bold, italic, code and highlight', () => {
    const nodes = parseInline('A **load balancer** sends *each* request to `app-1`, ==quickly==.');
    expect(nodes.map((n) => n.t)).toEqual(['text', 'strong', 'text', 'em', 'text', 'code', 'text', 'mark', 'text']);
  });

  it('parses glossary terms with and without display text', () => {
    const nodes = parseInline('Set a [[TTL|ttl]] and watch the [[cache-hit]] rate.');
    const terms = nodes.filter((n) => n.t === 'term');
    expect(terms).toHaveLength(2);
    expect(terms[0]).toMatchObject({ id: 'ttl', c: [{ t: 'text', v: 'TTL' }] });
    expect(terms[1]).toMatchObject({ id: 'cache-hit', c: [{ t: 'text', v: 'cache hit' }] });
  });

  it('parses links, including lesson links', () => {
    const nodes = parseInline('See [DNS](lesson:dns) and [the paper](https://example.com/a).');
    const links = nodes.filter((n) => n.t === 'link');
    expect(links.map((l) => (l.t === 'link' ? l.href : ''))).toEqual(['lesson:dns', 'https://example.com/a']);
  });

  it('leaves lone asterisks and brackets as text', () => {
    expect(mdToPlain('2 * 3 = 6 [not a link]')).toBe('2 * 3 = 6 [not a link]');
  });

  it('supports escapes', () => {
    expect(mdToPlain('a \\*literal\\* star')).toBe('a *literal* star');
  });
});

describe('parseMd', () => {
  it('splits paragraphs and lists', () => {
    const blocks = parseMd('First paragraph\ncontinues here.\n\n- one\n- two\n\n1. first\n2. second\n\nLast.');
    expect(blocks.map((b) => b.t)).toEqual(['p', 'ul', 'ol', 'p']);
    expect(mdToPlain('First paragraph\ncontinues here.')).toBe('First paragraph continues here.');
  });

  it('starts a list right after a paragraph line', () => {
    const blocks = parseMd('Three options:\n- one\n- two');
    expect(blocks.map((b) => b.t)).toEqual(['p', 'ul']);
  });

  it('collects term ids and link hrefs', () => {
    const src = 'The [[dns]] lookup.\n\n- A [[TLS|tls]] handshake, see [TCP](lesson:tcp-vs-udp).';
    expect(termIds(src)).toEqual(['dns', 'tls']);
    expect(linkHrefs(src)).toEqual(['lesson:tcp-vs-udp']);
  });
});

describe('countSentences', () => {
  it('counts simple sentences', () => {
    expect(countSentences('One. Two! Three? Four.')).toBe(4);
  });

  it('ignores abbreviations and decimals', () => {
    expect(countSentences('Use a cache, e.g. Redis, vs. a database. It takes 0.5 ms.')).toBe(2);
  });

  it('counts a trailing fragment', () => {
    expect(countSentences('Done. And then')).toBe(2);
  });
});
