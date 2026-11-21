/**
 * Availability calculator: a chain of stages in series, each with copies in parallel.
 *
 * A request needs every stage (series), and a stage works while at least one of its
 * copies works (parallel). Assuming copies fail independently:
 *
 *   stage unavailability = (1 − a) ^ copies
 *   chain availability   = product over stages of (1 − stage unavailability)
 *
 * Unavailability is carried through log1p / expm1 so that tiny numbers, such as
 * 1 − 0.999999, keep their precision instead of rounding to zero.
 */
import type { DiagramSpec, NodeType } from '@/content/types';

export type ComponentKind = 'dns' | 'loadBalancer' | 'app' | 'cache' | 'database' | 'payments';

export const KINDS: Record<ComponentKind, { label: string; plural: string; type: NodeType; availability: number }> = {
  dns: { label: 'DNS', plural: 'DNS providers', type: 'dns', availability: 0.9999 },
  loadBalancer: { label: 'Load balancer', plural: 'Load balancers', type: 'loadBalancer', availability: 0.9999 },
  app: { label: 'App server', plural: 'App servers', type: 'service', availability: 0.999 },
  cache: { label: 'Cache', plural: 'Cache nodes', type: 'cache', availability: 0.999 },
  database: { label: 'Database', plural: 'Database copies', type: 'sqlDb', availability: 0.999 },
  payments: { label: 'Payment provider', plural: 'Payment providers', type: 'external', availability: 0.999 },
};

export const KIND_ORDER: ComponentKind[] = ['dns', 'loadBalancer', 'app', 'cache', 'database', 'payments'];

/** Availability choices for one copy. */
export const AVAILABILITY_STEPS = [0.9, 0.95, 0.99, 0.995, 0.999, 0.9995, 0.9999, 0.99999] as const;
export const MAX_STAGES = 6;
export const MAX_COPIES = 5;

/** A 365-day year and a 30-day month, the round numbers used in the lesson. */
export const SECONDS_PER_YEAR = 365 * 24 * 3600;
export const SECONDS_PER_MONTH = 30 * 24 * 3600;

export type Stage = { id: string; kind: ComponentKind; availability: number; copies: number };

/** Snapgram's path in lesson 2.3: DNS, one app server, one database. */
export const DEFAULT_STAGES: Stage[] = [
  { id: 's1', kind: 'dns', availability: 0.9999, copies: 1 },
  { id: 's2', kind: 'app', availability: 0.999, copies: 1 },
  { id: 's3', kind: 'database', availability: 0.999, copies: 1 },
];

/* ------------------------------------------------------------------ */
/* The maths                                                           */
/* ------------------------------------------------------------------ */

/** Share of time every copy of the stage is down at once. */
export function stageUnavailability(s: Pick<Stage, 'availability' | 'copies'>): number {
  return Math.pow(1 - s.availability, clampCopies(s.copies));
}

export function stageAvailability(s: Pick<Stage, 'availability' | 'copies'>): number {
  return 1 - stageUnavailability(s);
}

/** Share of time at least one stage is down, so the whole chain is down. */
export function chainUnavailability(stages: Pick<Stage, 'availability' | 'copies'>[]): number {
  let logUp = 0;
  for (const s of stages) logUp += Math.log1p(-stageUnavailability(s));
  return -Math.expm1(logUp);
}

export function chainAvailability(stages: Pick<Stage, 'availability' | 'copies'>[]): number {
  return 1 - chainUnavailability(stages);
}

/** How many leading nines: 99.9% is 3, 99.95% is still 3, 99.99% is 4. */
export function ninesCount(unavailability: number): number {
  if (!(unavailability > 0)) return Infinity;
  return Math.max(0, Math.floor(-Math.log10(unavailability) + 1e-6));
}

export function downtimeSeconds(unavailability: number, period: 'year' | 'month'): number {
  return unavailability * (period === 'year' ? SECONDS_PER_YEAR : SECONDS_PER_MONTH);
}

/** The stages that limit the chain most, when they are not all equal. */
export function weakestStageIds(stages: Stage[]): string[] {
  if (stages.length < 2) return [];
  const u = stages.map(stageUnavailability);
  const worst = Math.max(...u);
  if (u.every((x) => Math.abs(x - worst) <= worst * 1e-9)) return [];
  return stages.filter((_, i) => Math.abs(u[i]! - worst) <= worst * 1e-9).map((s) => s.id);
}

/* ------------------------------------------------------------------ */
/* Challenges                                                          */
/* ------------------------------------------------------------------ */

export type ChallengeProgress = {
  /** Three or more single components in series. */
  series: boolean;
  /** Three or more 99% copies in parallel: the first count that beats one 99.99% part. */
  parallel: boolean;
  /** Four nines from a chain of two or more stages, every copy 99.9%. */
  fourNines: boolean;
  /** A 99.999% stage and a 99% stage in the same chain. */
  weakestLink: boolean;
};

export function challengeProgress(stages: Stage[]): ChallengeProgress {
  const avail = stages.map(stageAvailability);
  return {
    series: stages.length >= 3 && stages.every((s) => clampCopies(s.copies) === 1),
    parallel: stages.some((s) => s.availability === 0.99 && clampCopies(s.copies) >= 3),
    fourNines: stages.length >= 2 && stages.every((s) => s.availability === 0.999) && chainAvailability(stages) >= 0.9999,
    weakestLink: avail.some((a) => a >= 0.99999 - 1e-12) && avail.some((a) => a <= 0.99 + 1e-12),
  };
}

/* ------------------------------------------------------------------ */
/* Editing the chain                                                   */
/* ------------------------------------------------------------------ */

export function clampCopies(copies: number): number {
  return Math.max(1, Math.min(MAX_COPIES, Math.round(copies)));
}

/** The closest availability step, so presets and sliders always agree. */
export function snapAvailability(a: number): number {
  let best: number = AVAILABILITY_STEPS[0];
  for (const s of AVAILABILITY_STEPS) if (Math.abs(s - a) < Math.abs(best - a)) best = s;
  return best;
}

function nextId(stages: Stage[]): string {
  const max = stages.reduce((m, s) => Math.max(m, Number(s.id.slice(1)) || 0), 0);
  return `s${max + 1}`;
}

export function addStage(stages: Stage[], kind: ComponentKind = 'app'): Stage[] {
  if (stages.length >= MAX_STAGES) return stages;
  return [...stages, { id: nextId(stages), kind, availability: KINDS[kind].availability, copies: 1 }];
}

export function removeStage(stages: Stage[], id: string): Stage[] {
  if (stages.length <= 1) return stages;
  return stages.filter((s) => s.id !== id);
}

export function updateStage(stages: Stage[], id: string, patch: Partial<Omit<Stage, 'id'>>): Stage[] {
  return stages.map((s) =>
    s.id === id
      ? {
          ...s,
          ...patch,
          availability: patch.availability === undefined ? s.availability : snapAvailability(patch.availability),
          copies: patch.copies === undefined ? s.copies : clampCopies(patch.copies),
        }
      : s,
  );
}

/** Reads a preset such as "dns:99.99,app:99.9x2,database:99.9". Returns null if it does not parse. */
export function parseStages(text: string | undefined): Stage[] | null {
  if (!text) return null;
  const stages: Stage[] = [];
  for (const [i, token] of text.split(',').entries()) {
    const m = /^\s*([a-zA-Z]+):(\d+(?:\.\d+)?)(?:x(\d+))?\s*$/.exec(token);
    if (!m || !(m[1]! in KINDS)) return null;
    stages.push({
      id: `s${i + 1}`,
      kind: m[1] as ComponentKind,
      availability: snapAvailability(Number(m[2]) / 100),
      copies: clampCopies(m[3] ? Number(m[3]) : 1),
    });
  }
  return stages.length && stages.length <= MAX_STAGES ? stages : null;
}

export function serializeStages(stages: Stage[]): string {
  return stages.map((s) => `${s.kind}:${Number((s.availability * 100).toFixed(4))}${s.copies > 1 ? `x${s.copies}` : ''}`).join(',');
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/**
 * Availability from its unavailability, truncated (never rounded up) so it shows at least two
 * significant digits of the downtime: 0.001 -> "99.9%", 0.002997 -> "99.7%", 3e-6 -> "99.9997%".
 */
export function formatAvailability(unavailability: number): string {
  if (!(unavailability > 0)) return '100%';
  if (unavailability < 1e-9) return 'over 99.9999999%';
  const unPct = unavailability * 100;
  const d = Math.min(9, Math.max(1, Math.ceil(-Math.log10(unPct) - 1e-9) + 2));
  const scale = 10 ** d;
  const n = 100 * scale - Math.ceil(unPct * scale - 1e-6);
  const s = String(n).padStart(d + 1, '0');
  const frac = s.slice(s.length - d).replace(/0+$/, '');
  return `${s.slice(0, s.length - d)}${frac ? `.${frac}` : ''}%`;
}

function oneDecimal(x: number): string {
  return Number(x.toFixed(1)).toString();
}

/** 31,536 s -> "8.8 hours", 2,592 s -> "43 minutes", 25.9 s -> "26 seconds". */
export function formatDuration(seconds: number): string {
  if (seconds < 1) return 'under a second';
  if (seconds < 120) {
    const r = Math.round(seconds);
    return r === 1 ? '1 second' : `${r} seconds`;
  }
  const minutes = seconds / 60;
  if (minutes < 120) return minutes < 10 ? `${oneDecimal(minutes)} minutes` : `${Math.round(minutes)} minutes`;
  const hours = seconds / 3600;
  if (hours < 48) return hours < 10 ? `${oneDecimal(hours)} hours` : `${Math.round(hours)} hours`;
  const days = seconds / 86400;
  return days < 10 ? `${oneDecimal(days)} days` : `${Math.round(days)} days`;
}

/* ------------------------------------------------------------------ */
/* Diagram                                                             */
/* ------------------------------------------------------------------ */

export function stageLabel(s: Stage): string {
  return s.copies > 1 ? KINDS[s.kind].plural : KINDS[s.kind].label;
}

export function stageSublabel(s: Stage): string {
  const each = formatAvailability(1 - s.availability);
  return s.copies > 1 ? `${s.copies} copies, ${each} each` : each;
}

/**
 * The chain as a component diagram: users, then each stage left to right. On narrow
 * screens it snakes down two columns. The weakest stage carries a chip.
 */
export function chainDiagram(stages: Stage[]): DiagramSpec {
  const ids = ['users', ...stages.map((s) => s.id)];
  const nodes: DiagramSpec['nodes'] = [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 0 },
    ...stages.map((s, i) => ({ id: s.id, type: KINDS[s.kind].type, label: stageLabel(s), sublabel: stageSublabel(s), x: i + 1, y: 0 })),
  ];
  const edges: DiagramSpec['edges'] = ids.slice(1).map((id, i) => ({ id: `e-${ids[i]}-${id}`, from: ids[i]!, to: id, kind: 'sync' as const }));
  const positions: Record<string, { x: number; y: number }> = {};
  ids.forEach((id, j) => {
    const row = Math.floor(j / 2);
    positions[id] = { x: row % 2 === 0 ? j % 2 : 1 - (j % 2), y: row };
  });
  const weakest = weakestStageIds(stages);
  const u = chainUnavailability(stages);
  const parts = stages.map((s) => `${stageLabel(s).toLowerCase()} (${stageSublabel(s)})`);
  return {
    grid: { cols: ids.length, rows: 1 },
    nodes,
    edges,
    narrow: { grid: { cols: Math.min(2, ids.length), rows: Math.ceil(ids.length / 2) }, positions },
    steps: weakest.length
      ? [{ caption: 'The weakest stage limits the chain.', notes: weakest.map((id) => ({ target: id, text: 'Weakest', tone: 'signal' as const })) }]
      : undefined,
    description: `Users reach Snapgram through ${stages.length} ${stages.length === 1 ? 'stage' : 'stages in series'}: ${parts.join(', ')}. Together they are available ${formatAvailability(u)} of the time.`,
  };
}
