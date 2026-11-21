/**
 * A deliberately small markdown dialect for lesson content.
 *
 * Blocks: paragraphs (blank-line separated), "- " bullet lists, "1. " numbered lists.
 * Inline: **bold**, *italic*, `code`, ==highlight==, [text](href),
 *         [[term-id]] or [[shown text|term-id]] for glossary terms.
 * Links whose href starts with "lesson:" point at another lesson by id.
 * A backslash escapes the next character.
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'mark'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'term'; id: string; c: Inline[] };

export type MdBlock =
  | { t: 'p'; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; start: number; items: Inline[][] };

const BULLET = /^\s*[-*]\s+/;
const NUMBERED = /^\s*(\d+)\.\s+/;

export function parseMd(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  let list: { kind: 'ul' | 'ol'; start: number; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ t: 'p', c: parseInline(para.join(' ').trim()) });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((s) => parseInline(s.trim()));
      blocks.push(list.kind === 'ul' ? { t: 'ul', items } : { t: 'ol', start: list.start, items });
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet) {
      flushPara();
      if (!list || list.kind !== 'ul') {
        flushList();
        list = { kind: 'ul', start: 1, items: [] };
      }
      list.items.push(line.slice(bullet[0].length));
    } else if (numbered) {
      flushPara();
      if (!list || list.kind !== 'ol') {
        flushList();
        list = { kind: 'ol', start: Number(numbered[1]), items: [] };
      }
      list.items.push(line.slice(numbered[0].length));
    } else if (list && /^\s{2,}/.test(raw)) {
      // Indented continuation of the previous list item.
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const pushText = () => {
    if (text) {
      out.push({ t: 'text', v: text });
      text = '';
    }
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    const rest = src.slice(i);

    if (ch === '\\' && i + 1 < src.length) {
      text += src[i + 1];
      i += 2;
      continue;
    }

    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) {
        pushText();
        out.push({ t: 'code', v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (rest.startsWith('[[')) {
      const end = src.indexOf(']]', i + 2);
      if (end > i) {
        const inner = src.slice(i + 2, end);
        const bar = inner.lastIndexOf('|');
        const id = (bar >= 0 ? inner.slice(bar + 1) : inner).trim();
        const shown = bar >= 0 ? inner.slice(0, bar) : id.replace(/-/g, ' ');
        pushText();
        out.push({ t: 'term', id, c: parseInline(shown) });
        i = end + 2;
        continue;
      }
    }

    if (ch === '[') {
      const close = findClosingBracket(src, i);
      if (close > i && src[close + 1] === '(') {
        const paren = src.indexOf(')', close + 2);
        if (paren > close) {
          pushText();
          out.push({ t: 'link', href: src.slice(close + 2, paren).trim(), c: parseInline(src.slice(i + 1, close)) });
          i = paren + 1;
          continue;
        }
      }
    }

    if (rest.startsWith('**')) {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) {
        pushText();
        out.push({ t: 'strong', c: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (rest.startsWith('==')) {
      const end = src.indexOf('==', i + 2);
      if (end > i + 2) {
        pushText();
        out.push({ t: 'mark', c: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (ch === '*' && src[i + 1] !== ' ' && src[i + 1] !== '*') {
      const end = findEmEnd(src, i + 1);
      if (end > i + 1) {
        pushText();
        out.push({ t: 'em', c: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    text += ch;
    i++;
  }
  pushText();
  return out;
}

function findClosingBracket(src: string, open: number): number {
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '\\') {
      j++;
      continue;
    }
    if (src[j] === '[') depth++;
    else if (src[j] === ']') {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

function findEmEnd(src: string, from: number): number {
  for (let j = from; j < src.length; j++) {
    if (src[j] === '\\') {
      j++;
      continue;
    }
    if (src[j] === '*' && src[j + 1] !== '*' && src[j - 1] !== ' ') return j;
  }
  return -1;
}

export function inlineToPlain(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case 'text':
        case 'code':
          return n.v;
        default:
          return inlineToPlain(n.c);
      }
    })
    .join('');
}

/** Plain text of a markdown string, blocks separated by blank lines. */
export function mdToPlain(src: string): string {
  return parseMd(src)
    .map((b) => (b.t === 'p' ? inlineToPlain(b.c) : b.items.map(inlineToPlain).join('\n')))
    .join('\n\n');
}

/** Every glossary id referenced with [[...]] in a markdown string. */
export function termIds(src: string): string[] {
  const ids: string[] = [];
  const walk = (nodes: Inline[]) => {
    for (const n of nodes) {
      if (n.t === 'term') ids.push(n.id);
      if ('c' in n) walk(n.c);
    }
  };
  for (const b of parseMd(src)) {
    if (b.t === 'p') walk(b.c);
    else b.items.forEach(walk);
  }
  return ids;
}

/** Every link href in a markdown string. */
export function linkHrefs(src: string): string[] {
  const hrefs: string[] = [];
  const walk = (nodes: Inline[]) => {
    for (const n of nodes) {
      if (n.t === 'link') hrefs.push(n.href);
      if ('c' in n) walk(n.c);
    }
  };
  for (const b of parseMd(src)) {
    if (b.t === 'p') walk(b.c);
    else b.items.forEach(walk);
  }
  return hrefs;
}

const ABBREVIATIONS = ['e.g.', 'i.e.', 'vs.', 'etc.', 'approx.', 'Mr.', 'Ms.', 'Dr.', 'No.', 'U.S.', 'a.m.', 'p.m.'];

/** Rough sentence count for the "four sentences per paragraph" rule. */
export function countSentences(text: string): number {
  let t = ` ${text.trim()} `;
  for (const abbr of ABBREVIATIONS) t = t.split(abbr).join(abbr.replace(/\./g, ''));
  t = t.replace(/\.{3}|…/g, '');
  const enders = t.match(/[.!?]["'”’)\]]*(?=\s)/g);
  const count = enders ? enders.length : 0;
  // A final fragment without a closing period still counts as a sentence.
  const tail = t.trim();
  const endsWithTerminator = /[.!?]["'”’)\]]*$/.test(tail);
  return count + (tail && !endsWithTerminator ? 1 : 0);
}
