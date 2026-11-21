import type { DiagramLayout } from './layout';

/** Largest and smallest zoom for a diagram panel. Below the minimum, the panel scrolls sideways instead. */
export const MAX_SCALE = 1.1;
export const MIN_SCALE = 0.68;
/**
 * Panels narrower than this (phones, and half-width panels on larger screens) choose the layout with the
 * largest type, because a few pixels of type matter more there than the roomier wide layout.
 */
export const SMALL_PANEL = 480;

export type Fit = { layout: DiagramLayout; scale: number };
export type Layouts = { wide: DiagramLayout; compact: DiagramLayout; narrow: DiagramLayout };

/** Pick the layout that reads best in the available width, and the zoom to draw it at. */
export function chooseLayout(layouts: Layouts, available: number): Fit {
  if (available <= 0) return { layout: layouts.wide, scale: 1 };
  const fit = (l: DiagramLayout) => Math.min(MAX_SCALE, available / l.width);

  if (available < SMALL_PANEL) {
    // The largest type wins; a near tie keeps the roomier layout (wide, then compact, then narrow).
    let best = layouts.wide;
    let bestFit = fit(best);
    for (const l of [layouts.compact, layouts.narrow]) {
      const f = fit(l);
      if (f > bestFit + 0.02) {
        best = l;
        bestFit = f;
      }
    }
    return { layout: best, scale: Math.max(MIN_SCALE, bestFit) };
  }

  if (fit(layouts.wide) >= 0.8) return { layout: layouts.wide, scale: fit(layouts.wide) };
  // A roomy panel keeps the authored grid while it still reads: compact cards before the phone layout.
  if (fit(layouts.compact) >= 0.8) return { layout: layouts.compact, scale: fit(layouts.compact) };
  const c = fit(layouts.compact);
  const n = fit(layouts.narrow);
  const best = c >= n ? layouts.compact : layouts.narrow;
  const bestFit = Math.max(c, n);
  if (bestFit < fit(layouts.wide)) return { layout: layouts.wide, scale: Math.max(MIN_SCALE, fit(layouts.wide)) };
  return { layout: best, scale: Math.max(MIN_SCALE, bestFit) };
}
