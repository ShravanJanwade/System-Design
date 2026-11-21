import { useEffect, useState } from 'react';
import type { DiagramLayout, Pt } from './layout';
import { pointAt } from './layout';
import { finalTags, type Hop, type Tag } from './steps';

export { finalTags, type Tag };

export type Dot = Pt & { key: string; tone: 'signal' | 'alert' };

const SPEED = 0.42; // natural px per ms
const GROUP_PAUSE = 160;

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Moves request dots along the step's flow, one group after another.
 * When motion is reduced or the diagram is off screen, it jumps straight to the end state.
 */
export function useFlowPlayback(
  layout: DiagramLayout,
  flow: Hop[][],
  runKey: string | number,
  active: boolean,
  reduced: boolean,
): { dots: Dot[]; tags: Tag[]; done: boolean } {
  const [dots, setDots] = useState<Dot[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDots([]);
    if (reduced || !active || flow.length === 0) {
      setTags(finalTags(flow, layout));
      setDone(true);
      return;
    }
    setTags([]);
    setDone(false);

    const groups = flow
      .map((group) => group.map((hop) => ({ hop, route: layout.edges[hop.edge] })).filter((h) => h.route))
      .filter((g) => g.length > 0);
    if (groups.length === 0) {
      setDone(true);
      return;
    }
    const durations = groups.map((g) =>
      Math.min(1200, Math.max(450, Math.max(...g.map((h) => h.route!.length)) / SPEED)),
    );

    let raf = 0;
    let cancelled = false;
    let groupIndex = 0;
    let groupStart = performance.now() + 120;

    const tick = (now: number) => {
      if (cancelled) return;
      const group = groups[groupIndex]!;
      if (now < groupStart) {
        setDots([]);
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - groupStart) / durations[groupIndex]!);
      const e = ease(t);
      setDots(
        group.map(({ hop, route }, i) => {
          const at = hop.reverse ? route!.length * (1 - e) : route!.length * e;
          return { key: `${groupIndex}-${i}`, tone: hop.tone, ...pointAt(route!.samples, at) };
        }),
      );
      if (t >= 1) {
        const arrived = group
          .filter(({ hop }) => hop.tag)
          .map(({ hop, route }) => ({ node: hop.reverse ? route!.from : route!.to, text: hop.tag!, tone: hop.tone }));
        if (arrived.length) setTags((prev) => [...prev, ...arrived]);
        groupIndex++;
        if (groupIndex >= groups.length) {
          setDots([]);
          setDone(true);
          return;
        }
        groupStart = now + GROUP_PAUSE;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // `flow` is derived from the current step, which `runKey` identifies, so it is not a dependency.
  }, [runKey, active, reduced, layout]);

  return { dots, tags, done };
}
