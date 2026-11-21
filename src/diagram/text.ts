import { fontMetrics } from './font-metrics';

export type Weight = 'regular' | 'semibold' | 'bold';

const FALLBACK_EM = 0.56;

/** Width of a single line of text in pixels, from the generated Atkinson Hyperlegible metrics. */
export function measureText(text: string, sizePx: number, weight: Weight = 'regular'): number {
  const table = fontMetrics[weight] as Record<string, number>;
  let em = 0;
  for (const ch of text) em += table[ch] ?? FALLBACK_EM;
  return em * sizePx;
}

/**
 * Greedy word wrap. Honors explicit "\n". A single word wider than maxWidth keeps its own line.
 */
export function wrapText(text: string, maxWidth: number, sizePx: number, weight: Weight = 'regular'): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || measureText(candidate, sizePx, weight) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

export function roundUp(value: number, step = 8): number {
  return Math.ceil(value / step) * step;
}

export function snap(value: number, step = 8): number {
  return Math.round(value / step) * step;
}
