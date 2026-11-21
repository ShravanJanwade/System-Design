const grouped = new Intl.NumberFormat('en-US');

/** 12345 -> "12,345". */
export function formatInt(n: number): string {
  return grouped.format(Math.round(n));
}

/** 0.8234 -> "82%"; keeps one decimal below 10%. */
export function formatPercent(ratio: number, digits?: number): string {
  const pct = ratio * 100;
  const d = digits ?? (Math.abs(pct) < 10 && pct !== 0 ? 1 : 0);
  return `${pct.toFixed(d)}%`;
}

/** Milliseconds for latency readouts: 0.4 -> "0.4 ms", 150 -> "150 ms", 1500 -> "1.5 s". */
export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s`;
  if (ms < 1 && ms > 0) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}

/** Compact counts: 1200 -> "1.2K", 3_400_000 -> "3.4M". */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${trim(n / 1e9)}B`;
  if (abs >= 1e6) return `${trim(n / 1e6)}M`;
  if (abs >= 1e3) return `${trim(n / 1e3)}K`;
  return `${Math.round(n)}`;
}

function trim(v: number): string {
  return v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '');
}

/** "1 card", "3 cards". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatInt(count)} ${count === 1 ? singular : pluralForm}`;
}
