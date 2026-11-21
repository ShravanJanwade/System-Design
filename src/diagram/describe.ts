import type { DiagramSpec, SequenceSpec } from '@/content/types';
import { typeName } from './types-style';

const kindVerb = {
  sync: 'sends requests to',
  async: 'sends messages asynchronously to',
  replication: 'replicates data to',
} as const;

/** One-paragraph description of a diagram for screen readers. */
export function describeDiagram(spec: DiagramSpec): string {
  if (spec.description) return spec.description;
  const name = (id: string) => spec.nodes.find((n) => n.id === id)?.label ?? id;
  const parts = spec.nodes.map((n) => `${n.label}${n.sublabel ? ` (${n.sublabel})` : ''}, a ${typeName[n.type]}`);
  const links = spec.edges.map(
    (e) => `${name(e.from)} ${kindVerb[e.kind]} ${name(e.to)}${e.label ? `, labeled "${e.label}"` : ''}`,
  );
  return `Components: ${parts.join('; ')}. Connections: ${links.join('; ')}.`;
}

/** Connection list for the "Describe this diagram" panel on static diagrams. */
export function connectionList(spec: DiagramSpec): string[] {
  const name = (id: string) => spec.nodes.find((n) => n.id === id)?.label ?? id;
  return spec.edges.map((e) => `${name(e.from)} ${kindVerb[e.kind]} ${name(e.to)}${e.label ? ` (${e.label})` : ''}.`);
}

export function describeSequence(spec: SequenceSpec): string {
  if (spec.description) return spec.description;
  const name = (id: string) => spec.actors.find((a) => a.id === id)?.label ?? id;
  return `Sequence between ${spec.actors.map((a) => a.label).join(', ')}. ${spec.messages
    .map((m, i) => `${i + 1}. ${name(m.from)} to ${name(m.to)}: ${m.label}${m.lost ? ' (lost)' : ''}`)
    .join('. ')}.`;
}
