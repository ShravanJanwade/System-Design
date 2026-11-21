import type { DiagramSpec, FlowHop, FlowItem, StepNote } from '@/content/types';
import type { DiagramLayout } from './layout';

export type Hop = { edge: string; reverse: boolean; tag?: string; tone: 'signal' | 'alert' };

/** A chip that appears on a node when a request dot arrives there with a tag, such as "hit". */
export type Tag = { node: string; text: string; tone: 'signal' | 'alert' };

/** Tags that a step ends with, in order of arrival. */
export function finalTags(flow: Hop[][], layout: DiagramLayout): Tag[] {
  const tags: Tag[] = [];
  for (const group of flow) {
    for (const hop of group) {
      const route = layout.edges[hop.edge];
      if (route && hop.tag) tags.push({ node: hop.reverse ? route.from : route.to, text: hop.tag, tone: hop.tone });
    }
  }
  return tags;
}

export type StepView = {
  index: number;
  caption?: string;
  /** Node and edge ids visible at this step. */
  visible: Set<string>;
  /** Ids at full strength, or null when nothing is dimmed. */
  focus: Set<string> | null;
  failed: Set<string>;
  notes: StepNote[];
  /** Groups of hops; hops in a group travel together, groups travel in order. */
  flow: Hop[][];
};

function toHop(h: FlowHop): Hop {
  if (typeof h === 'string') {
    return h.startsWith('<') ? { edge: h.slice(1), reverse: true, tone: 'signal' } : { edge: h, reverse: false, tone: 'signal' };
  }
  return { edge: h.edge, reverse: Boolean(h.reverse), tag: h.tag, tone: h.tone ?? 'signal' };
}

export function normalizeFlow(flow: FlowItem[] | undefined): Hop[][] {
  if (!flow) return [];
  return flow.map((item) => (Array.isArray(item) ? item.map(toHop) : [toHop(item)]));
}

/** First step at which each added id appears. */
export function appearance(spec: DiagramSpec): Map<string, number> {
  const first = new Map<string, number>();
  spec.steps?.forEach((step, i) => {
    for (const id of step.add ?? []) if (!first.has(id)) first.set(id, i);
  });
  return first;
}

export function stepView(spec: DiagramSpec, index: number): StepView {
  const steps = spec.steps ?? [];
  const step = steps[index];
  const appears = appearance(spec);
  const visible = new Set<string>();
  const shown = (id: string) => (appears.get(id) ?? -1) <= index;
  for (const n of spec.nodes) if (shown(n.id)) visible.add(n.id);
  for (const e of spec.edges) if (shown(e.id) && visible.has(e.from) && visible.has(e.to)) visible.add(e.id);

  const flow = normalizeFlow(step?.flow);
  const failed = new Set(step?.fail ?? []);

  let focus: Set<string> | null = null;
  if (step?.focus) {
    focus = new Set(step.focus);
    for (const group of flow) {
      for (const hop of group) {
        focus.add(hop.edge);
        const edge = spec.edges.find((e) => e.id === hop.edge);
        if (edge) {
          focus.add(edge.from);
          focus.add(edge.to);
        }
      }
    }
    for (const id of failed) focus.add(id);
    for (const e of spec.edges) if (focus.has(e.from) && focus.has(e.to)) focus.add(e.id);
  }

  return { index, caption: step?.caption, visible, focus, failed, notes: step?.notes ?? [], flow };
}
