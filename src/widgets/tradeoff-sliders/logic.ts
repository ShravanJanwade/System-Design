/**
 * Trade-off sliders: one Snapgram decision, how to keep like counts, scored on four axes.
 *
 * Scores run from 1 (poor) to 5 (excellent) and are judgment calls, written down so they can
 * be argued with. The learner sets how much each axis matters (0 to 5); an option's fit is its
 * weighted average score. No option wins on every axis, which is the point of the lesson.
 */
import type { DiagramSpec } from '@/content/types';

export type Axis = 'freshness' | 'latency' | 'cost' | 'simplicity';

export const AXES: readonly { id: Axis; label: string; question: string }[] = [
  { id: 'freshness', label: 'Freshness', question: 'How close to the true count must the number be?' },
  { id: 'latency', label: 'Low latency', question: 'How fast must liking and reading counts feel?' },
  { id: 'cost', label: 'Low cost', question: 'How much does a lighter database bill matter?' },
  { id: 'simplicity', label: 'Simplicity', question: 'How much does a design that is easy to build and run matter?' },
];

export type OptionId = 'update-every-like' | 'cache-count' | 'batch-in-memory';

export type DesignOption = {
  id: OptionId;
  name: string;
  /** How it works, in one sentence. */
  how: string;
  scores: Record<Axis, number>;
  /** For "We could … or …". */
  verb: string;
  /** For "I'd go with …" and "I'd switch to …". */
  gerund: string;
  /** For "… gives us …", one phrase per axis it can win on. */
  gain: Record<Axis, string>;
  /** For "… but costs us …". */
  loss: Record<Axis, string>;
  /** "What you give up", one sentence per axis. */
  giveUp: Record<Axis, string>;
};

export const OPTIONS: readonly DesignOption[] = [
  {
    id: 'update-every-like',
    name: 'Update the database on every like',
    how: 'Each like adds one to the photo’s count in the database, and every view reads the count from there.',
    scores: { freshness: 5, latency: 2, cost: 2, simplicity: 5 },
    verb: 'update the database on every like',
    gerund: 'updating the database on every like',
    gain: {
      freshness: 'counts that are exact at every moment',
      latency: 'one fewer hop than a cache',
      cost: 'no extra servers to pay for',
      simplicity: 'the simplest possible design',
    },
    loss: {
      freshness: 'nothing on freshness',
      latency: 'slow likes when a photo goes viral, because every like waits its turn on one row',
      cost: 'a database that has to grow with every like and every view',
      simplicity: 'nothing on simplicity',
    },
    giveUp: {
      freshness: 'You give up nothing on freshness: every count is exact.',
      latency: 'You give up speed: every like waits for a database write, and a viral photo’s likes queue up on one row.',
      cost: 'You give up cost: the database takes every like and every count read, so it has to grow with traffic.',
      simplicity: 'You give up nothing on simplicity: it is one table and one update.',
    },
  },
  {
    id: 'cache-count',
    name: 'Cache the count, refresh it every few seconds',
    how: 'Likes are still written to the database, but views read the count from a cache that recounts every few seconds.',
    scores: { freshness: 3, latency: 4, cost: 4, simplicity: 4 },
    verb: 'cache the count and refresh it every few seconds',
    gerund: 'caching the count',
    gain: {
      freshness: 'counts that are at most a few seconds old and never lost',
      latency: 'fast count reads from memory',
      cost: 'a database that no longer serves every view',
      simplicity: 'a design with only one extra piece',
    },
    loss: {
      freshness: 'counts that can be a few seconds behind',
      latency: 'a database write on every like',
      cost: 'a database write on every like, plus a cache to run',
      simplicity: 'a cache and a refresh timer to run',
    },
    giveUp: {
      freshness: 'You give up freshness: a count can be a few seconds behind the real number.',
      latency: 'You give up a little speed: each like still waits for a database write, even though reading the count is fast.',
      cost: 'You give up a little on cost: the database still takes every like, though no longer every view.',
      simplicity: 'You give up a little simplicity: a cache and a refresh timer are one more thing to run.',
    },
  },
  {
    id: 'batch-in-memory',
    name: 'Count in memory, write in batches',
    how: 'Each app server adds up likes in its own memory and writes the totals to the database every few seconds.',
    scores: { freshness: 2, latency: 5, cost: 5, simplicity: 2 },
    verb: 'count likes in memory and write them in batches',
    gerund: 'batching the writes in memory',
    gain: {
      freshness: 'counts that catch up within seconds',
      latency: 'instant likes',
      cost: 'the fewest database writes',
      simplicity: 'no cache to run',
    },
    loss: {
      freshness: 'counts that lag until the next batch, and likes lost if a server crashes first',
      latency: 'nothing on speed',
      cost: 'nothing on cost',
      simplicity: 'batching and crash-recovery code to build and run',
    },
    giveUp: {
      freshness: 'You give up accuracy: counts lag until the next batch, and a crash loses likes that were not written yet.',
      latency: 'You give up nothing on speed: a like is just a number going up in memory.',
      cost: 'You give up nothing on cost: the database sees one write per photo every few seconds.',
      simplicity: 'You give up simplicity: batching, crash recovery and adding up counts from many servers all take code and care.',
    },
  },
];

/** Requirement behind a choice: "Because …". */
const BECAUSE: Record<Axis, string> = {
  freshness: 'counts should stay close to the truth',
  latency: 'likes should feel instant',
  cost: 'the database bill matters',
  simplicity: 'the team is small',
};

/** What would change my mind: "and if …, I'd switch". */
const IF_CHANGED: Record<Axis, string> = {
  freshness: 'counts had to be exact',
  latency: 'likes had to feel instant',
  cost: 'the database became the bottleneck',
  simplicity: 'the team could not run extra moving parts',
};

export type Weights = Record<Axis, number>;

/** Snapgram's priorities in lesson 2.7: fast and simple matter, exactness less so. */
export const SNAPGRAM_WEIGHTS: Weights = { freshness: 2, latency: 4, cost: 3, simplicity: 4 };
export const EQUAL_WEIGHTS: Weights = { freshness: 3, latency: 3, cost: 3, simplicity: 3 };
export const MAX_WEIGHT = 5;

/** Weights from a lesson's widget props, falling back to Snapgram's. Values are clamped to 0..5. */
export function weightsFromProps(props?: Record<string, string | number | boolean>): Weights {
  const out: Weights = { ...SNAPGRAM_WEIGHTS };
  if (!props) return out;
  for (const a of AXES) {
    const v = props[a.id];
    if (typeof v === 'number' && Number.isFinite(v)) out[a.id] = Math.max(0, Math.min(MAX_WEIGHT, Math.round(v)));
  }
  return out;
}

function effective(w: Weights): Weights {
  const total = AXES.reduce((s, a) => s + w[a.id], 0);
  return total > 0 ? w : EQUAL_WEIGHTS;
}

/** Weighted average score, from 1 to 5. With every weight at zero, all axes count equally. */
export function fit(option: DesignOption, weights: Weights): number {
  const w = effective(weights);
  const total = AXES.reduce((s, a) => s + w[a.id], 0);
  return AXES.reduce((s, a) => s + w[a.id] * option.scores[a.id], 0) / total;
}

const TIE = 0.005;

/** Options from best to worst fit. Near ties go to the option with the higher total score, then list order. */
export function rank(weights: Weights): { option: DesignOption; fit: number }[] {
  const sum = (o: DesignOption) => AXES.reduce((s, a) => s + o.scores[a.id], 0);
  return OPTIONS.map((option, i) => ({ option, fit: fit(option, weights), i }))
    .sort((p, q) => (Math.abs(p.fit - q.fit) > TIE ? q.fit - p.fit : sum(q.option) - sum(p.option) || p.i - q.i))
    .map(({ option, fit: f }) => ({ option, fit: f }));
}

const EPS = 0.01;

/** The axis where an option loses the most against the best score available, weighted by priority. */
export function giveUpAxis(option: DesignOption, weights: Weights): Axis {
  const w = effective(weights);
  let best: Axis = AXES[0]!.id;
  let bestLoss = -1;
  for (const a of AXES) {
    const top = Math.max(...OPTIONS.map((o) => o.scores[a.id]));
    const loss = (top - option.scores[a.id]) * (w[a.id] + EPS);
    if (loss > bestLoss + 1e-12) {
      bestLoss = loss;
      best = a.id;
    }
  }
  return best;
}

/** The axis where `a` beats `b` by the most, weighted by priority. */
function edgeAxis(a: DesignOption, b: DesignOption, weights: Weights): Axis | null {
  const w = effective(weights);
  let best: Axis | null = null;
  let bestEdge = 0;
  for (const ax of AXES) {
    const diff = a.scores[ax.id] - b.scores[ax.id];
    if (diff <= 0) continue;
    const edge = diff * (w[ax.id] + EPS);
    if (edge > bestEdge + 1e-12) {
      bestEdge = edge;
      best = ax.id;
    }
  }
  return best;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type Verdict = {
  best: DesignOption;
  runnerUp: DesignOption;
  /** The top two fit almost equally well. */
  closeCall: boolean;
  giveUp: Axis;
  /** One sentence: what the best fit gives up. */
  giveUpSentence: string;
  /** The interview template, filled in for these priorities. */
  sentence: string;
};

export function verdict(weights: Weights): Verdict {
  const ranked = rank(weights);
  const best = ranked[0]!.option;
  const runnerUp = ranked[1]!.option;
  const closeCall = ranked[0]!.fit - ranked[1]!.fit < 0.1;
  const giveUp = giveUpAxis(best, weights);
  const reason = edgeAxis(best, runnerUp, weights) ?? giveUp;
  const change = edgeAxis(runnerUp, best, weights) ?? reason;
  const sentence =
    `We could ${best.verb} or ${runnerUp.verb}. ` +
    `${capitalize(best.gerund)} gives us ${best.gain[reason]} but costs us ${best.loss[giveUp]}. ` +
    `Because ${BECAUSE[reason]}, I’d go with ${best.gerund}, and if ${IF_CHANGED[change]}, I’d switch to ${runnerUp.gerund}.`;
  return { best, runnerUp, closeCall, giveUp, giveUpSentence: best.giveUp[giveUp], sentence };
}

/** How each option works, drawn on the blueprint panel. */
export function optionDiagram(id: OptionId): DiagramSpec {
  const phones = { id: 'phones', type: 'client' as const, label: 'Phones', sublabel: 'likes and views', x: 0, y: 0 };
  switch (id) {
    case 'update-every-like':
      return {
        grid: { cols: 3, rows: 1 },
        nodes: [
          phones,
          { id: 'app', type: 'service', label: 'App server', x: 1, y: 0 },
          { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'count + 1 per like', x: 2, y: 0 },
        ],
        edges: [
          { id: 'phones-app', from: 'phones', to: 'app', kind: 'sync' },
          { id: 'app-db', from: 'app', to: 'db', kind: 'sync', label: 'every like and view' },
        ],
        description: 'Phones send likes and views to the app server, which writes every like to the database and reads every count from it.',
      };
    case 'cache-count':
      return {
        grid: { cols: 3, rows: 2 },
        nodes: [
          phones,
          { id: 'app', type: 'service', label: 'App server', x: 1, y: 0 },
          { id: 'cache', type: 'cache', label: 'Cache', sublabel: 'count, refreshed every 5 s', x: 2, y: 0 },
          { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'every like', x: 1, y: 1 },
        ],
        edges: [
          { id: 'phones-app', from: 'phones', to: 'app', kind: 'sync' },
          { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync', label: 'views' },
          { id: 'app-db', from: 'app', to: 'db', kind: 'sync', label: 'likes' },
        ],
        description: 'The app server writes every like to the database, but views read the count from a cache that is refreshed every few seconds.',
      };
    case 'batch-in-memory':
      return {
        grid: { cols: 3, rows: 1 },
        nodes: [
          phones,
          { id: 'app', type: 'service', label: 'App servers', sublabel: 'counts in memory', x: 1, y: 0 },
          { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'totals every 5 s', x: 2, y: 0 },
        ],
        edges: [
          { id: 'phones-app', from: 'phones', to: 'app', kind: 'sync' },
          { id: 'app-db', from: 'app', to: 'db', kind: 'async', label: 'batch' },
        ],
        description: 'App servers add up likes in memory and send the totals to the database in a batch every few seconds.',
      };
  }
}
