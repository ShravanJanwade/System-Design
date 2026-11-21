/**
 * Consistency timelines: the same short story judged by four consistency models.
 *
 * A story is a list of events on a shared clock: writes, reads and the moment every copy has
 * caught up. For each read, `judge` lists every value the read could conceivably return (the
 * values written before it) and decides, for one model, whether that value is allowed, with a
 * reason when it is not.
 *
 * Two shapes of data:
 * - register: one value that each write replaces, such as a caption;
 * - list: each write adds an item, such as comments under a photo, so a read returns a subset.
 *
 * Causality comes from the story itself: a person's causal past at time t is every write they
 * made before t, every write their earlier reads returned (`saw`), and everything those writes
 * depended on. A write depends on its writer's causal past at the moment it was made.
 */

export type ModelId = 'strong' | 'causal' | 'read-your-writes' | 'eventual';

/** Strongest first: each model allows at least what the one before it allows. */
export const MODEL_ORDER: ModelId[] = ['strong', 'causal', 'read-your-writes', 'eventual'];

export const MODEL_INFO: Record<ModelId, { title: string; promise: string }> = {
  strong: { title: 'Strong (linearizable)', promise: 'Every read returns the latest write, as if there were one copy.' },
  causal: { title: 'Causal', promise: 'Causes before effects, and nobody goes back to older data they have seen.' },
  'read-your-writes': { title: 'Read-your-writes', promise: 'You always see your own changes; others may see them later.' },
  eventual: { title: 'Eventual', promise: 'Copies agree in the end. Until then, a read may return any value written so far.' },
};

export type PersonId = 'maya' | 'leo' | 'priya';

export const PEOPLE: Record<PersonId, { name: string; region: string }> = {
  maya: { name: 'Maya', region: 'Singapore' },
  leo: { name: 'Leo', region: 'Oregon' },
  priya: { name: 'Priya', region: 'Oregon' },
};

export type StartEvent = { kind: 'start'; id: string; at: number; caption: string };
export type WriteEvent = {
  kind: 'write';
  id: string;
  by: PersonId;
  at: number;
  /** The value written: the new caption, or the comment. */
  text: string;
  /** A short name for timelines and value labels: "question". */
  short: string;
  /** How reasons refer to it: "Leo’s question". */
  label: string;
  caption: string;
};
export type ReadEvent = {
  kind: 'read';
  id: string;
  /** Read number shown on the timeline: R1, R2... */
  n: number;
  by: PersonId;
  at: number;
  /** What the read returned in this story, as write ids. Later reads by the same person build on it. */
  saw: string[];
  caption: string;
};
export type SyncEvent = { kind: 'sync'; id: string; at: number; caption: string };
export type ScenarioEvent = StartEvent | WriteEvent | ReadEvent | SyncEvent;

export type ScenarioId = 'caption' | 'thread';

export type Scenario = {
  id: ScenarioId;
  title: string;
  shape: 'register' | 'list';
  /** What the data is, for sentences: "caption", "comments". */
  noun: string;
  lanes: PersonId[];
  /** Register only: the value every copy holds at the start. */
  initial?: WriteEvent;
  /** In time order. Each event is one step of the step-through. */
  events: ScenarioEvent[];
  /** Length of the time axis, in seconds. */
  duration: number;
};

const CAPTION_INITIAL: WriteEvent = {
  kind: 'write',
  id: 'w0',
  by: 'maya',
  at: 0,
  text: 'Sunset',
  short: 'old caption',
  label: 'the old caption, “Sunset”',
  caption: 'Maya’s photo is captioned “Sunset”, and every copy has that caption.',
};

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  caption: {
    id: 'caption',
    title: 'Caption change',
    shape: 'register',
    noun: 'caption',
    lanes: ['maya', 'leo'],
    initial: CAPTION_INITIAL,
    duration: 6,
    events: [
      { kind: 'start', id: 'start', at: 0, caption: CAPTION_INITIAL.caption },
      {
        kind: 'write',
        id: 'w1',
        by: 'maya',
        at: 1,
        text: 'Golden hour',
        short: 'new caption',
        label: 'the new caption, “Golden hour”',
        caption: 'Maya, in Singapore, changes her caption from “Sunset” to “Golden hour”.',
      },
      { kind: 'read', id: 'r1', n: 1, by: 'maya', at: 2, saw: ['w1'], caption: 'Read 1: Maya reloads her photo. Each card shows what that model lets this read return.' },
      {
        kind: 'read',
        id: 'r2',
        n: 2,
        by: 'leo',
        at: 2,
        saw: ['w1'],
        caption: 'Read 2: Leo opens the photo in Oregon. In this story he happens to get “Golden hour”.',
      },
      { kind: 'read', id: 'r3', n: 3, by: 'leo', at: 3, saw: ['w1'], caption: 'Read 3: Leo refreshes. He has already seen the new caption; can the old one come back?' },
      { kind: 'sync', id: 'sync', at: 4, caption: 'By 4 s, every copy has caught up with the new caption.' },
      { kind: 'read', id: 'r4', n: 4, by: 'leo', at: 5, saw: ['w1'], caption: 'Read 4: Leo refreshes again. Now every model gives the same answer.' },
    ],
  },
  thread: {
    id: 'thread',
    title: 'Comment and reply',
    shape: 'list',
    noun: 'comments',
    lanes: ['leo', 'maya', 'priya'],
    duration: 6,
    events: [
      { kind: 'start', id: 'start', at: 0, caption: 'Maya’s photo has no comments yet.' },
      {
        kind: 'write',
        id: 'q',
        by: 'leo',
        at: 1,
        text: 'Where was this taken?',
        short: 'question',
        label: 'Leo’s question',
        caption: 'Leo, in Oregon, asks where the photo was taken.',
      },
      { kind: 'read', id: 'r1', n: 1, by: 'maya', at: 2, saw: ['q'], caption: 'Read 1: Maya opens the photo in Singapore and, in this story, sees Leo’s question.' },
      {
        kind: 'write',
        id: 'a',
        by: 'maya',
        at: 3,
        text: 'Marina Bay, from the pier',
        short: 'reply',
        label: 'Maya’s reply',
        caption: 'Maya replies: Marina Bay, from the pier. Her reply depends on the question she just read.',
      },
      { kind: 'read', id: 'r2', n: 2, by: 'priya', at: 4, saw: ['q', 'a'], caption: 'Read 2: Priya, in Oregon, opens the photo. Could she see the answer without the question?' },
      { kind: 'read', id: 'r3', n: 3, by: 'maya', at: 4, saw: ['q', 'a'], caption: 'Read 3: Maya refreshes to check that her reply is there.' },
      { kind: 'sync', id: 'sync', at: 5, caption: 'By 5 s, every copy has both comments.' },
      { kind: 'read', id: 'r4', n: 4, by: 'priya', at: 6, saw: ['q', 'a'], caption: 'Read 4: Priya refreshes. Now every model gives the same answer.' },
    ],
  },
};

export const SCENARIO_ORDER: ScenarioId[] = ['caption', 'thread'];

/* ------------------------------------------------------------------ */
/* Causality                                                           */
/* ------------------------------------------------------------------ */

function allWrites(s: Scenario): WriteEvent[] {
  const ws = s.events.filter((e): e is WriteEvent => e.kind === 'write');
  return s.initial ? [s.initial, ...ws] : ws;
}

function reads(s: Scenario): ReadEvent[] {
  return s.events.filter((e): e is ReadEvent => e.kind === 'read');
}

export function getWrite(s: Scenario, id: string): WriteEvent {
  const w = allWrites(s).find((x) => x.id === id);
  if (!w) throw new Error(`No write "${id}" in scenario "${s.id}"`);
  return w;
}

export function getRead(s: Scenario, id: string): ReadEvent {
  const r = reads(s).find((x) => x.id === id);
  if (!r) throw new Error(`No read "${id}" in scenario "${s.id}"`);
  return r;
}

/** Everything `person` had written or seen before time `t`, closed under dependencies. */
export function causalPast(s: Scenario, person: PersonId, t: number): Set<string> {
  const direct = new Set<string>();
  for (const w of allWrites(s)) if (w.by === person && w.at < t) direct.add(w.id);
  for (const r of reads(s)) if (r.by === person && r.at < t) for (const id of r.saw) direct.add(id);
  const out = new Set<string>();
  for (const id of direct) {
    out.add(id);
    for (const d of dependencies(s, id)) out.add(d);
  }
  return out;
}

/** The writes a write depends on: its writer's causal past when it was made. */
export function dependencies(s: Scenario, writeId: string): Set<string> {
  const w = getWrite(s, writeId);
  if (s.initial && w.id === s.initial.id) return new Set();
  return causalPast(s, w.by, w.at);
}

function syncTime(s: Scenario): number {
  const e = s.events.find((x) => x.kind === 'sync');
  return e ? e.at : Number.POSITIVE_INFINITY;
}

/* ------------------------------------------------------------------ */
/* Judging reads                                                       */
/* ------------------------------------------------------------------ */

export type Value = { key: string; ids: string[]; label: string };
export type Verdict = { value: Value; allowed: boolean; reason: string };
export type Judgement = { model: ModelId; read: ReadEvent; verdicts: Verdict[]; summary: string };

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function formatTime(t: number): string {
  return `${t} s`;
}

/** Every value a read could conceivably return: anything written before it. */
export function candidates(s: Scenario, read: ReadEvent): Value[] {
  const before = allWrites(s).filter((w) => w.at < read.at);
  if (s.shape === 'register') return before.map((w) => ({ key: w.id, ids: [w.id], label: `“${w.text}”` }));
  const out: Value[] = [];
  const n = before.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const picked = before.filter((_, i) => mask & (1 << i));
    out.push({ key: picked.map((w) => w.id).join('+') || 'none', ids: picked.map((w) => w.id), label: listLabel(picked, n) });
  }
  return out.sort((a, b) => a.ids.length - b.ids.length || order(s, a) - order(s, b));
}

function order(s: Scenario, v: Value): number {
  const ws = allWrites(s);
  return v.ids.reduce((sum, id) => sum + 2 ** ws.findIndex((w) => w.id === id), 0);
}

function listLabel(picked: WriteEvent[], available: number): string {
  if (picked.length === 0) return 'Nothing yet';
  const text = capitalize(joinAnd(picked.map((w) => w.short)));
  return picked.length < available ? `${text} only` : text;
}

/** Judges one read under one model: which candidate values are allowed, and why the others are not. */
export function judge(s: Scenario, readId: string, model: ModelId): Judgement {
  const read = getRead(s, readId);
  const who = PEOPLE[read.by].name;
  const values = candidates(s, read);
  const before = allWrites(s).filter((w) => w.at < read.at);
  const latest = before[before.length - 1]!;
  const synced = read.at >= syncTime(s);
  const past = causalPast(s, read.by, read.at);
  const own = before.filter((w) => w.by === read.by);
  const register = s.shape === 'register';
  const everything = before.map((w) => w.id);

  const verdict = (value: Value): Verdict => {
    const ids = new Set(value.ids);
    const missing = everything.filter((id) => !ids.has(id)).map((id) => getWrite(s, id));
    const no = (reason: string): Verdict => ({ value, allowed: false, reason });
    const yes: Verdict = { value, allowed: true, reason: '' };

    if (model === 'strong') {
      if (register) {
        return value.ids[0] === latest.id
          ? yes
          : no(`“${latest.text}” was saved at ${formatTime(latest.at)}, before this read, so every later read returns it.`);
      }
      return missing.length === 0
        ? yes
        : no(`${capitalize(joinAnd(missing.map((w) => w.label)))} ${missing.length > 1 ? 'were' : 'was'} saved before this read, so ${missing.length > 1 ? 'they' : 'it'} must appear.`);
    }

    if (synced) {
      if (register) return value.ids[0] === latest.id ? yes : no(`Every copy has caught up by ${formatTime(syncTime(s))}, so every read returns “${latest.text}”.`);
      return missing.length === 0 ? yes : no(`Every copy has caught up by ${formatTime(syncTime(s))}, so every read shows ${joinAnd(before.map((w) => w.label))}.`);
    }

    if (model === 'eventual') return yes;

    if (model === 'read-your-writes') {
      if (register) {
        const mine = own[own.length - 1];
        if (!mine || value.ids[0] === mine.id || dependencies(s, value.ids[0]!).has(mine.id)) return yes;
        return no(`${who} changed the caption to “${mine.text}”, so ${who}’s own reads never show an older one.`);
      }
      const lacking = own.filter((w) => !ids.has(w.id));
      return lacking.length === 0 ? yes : no(`It leaves out ${who}’s own ${lacking[0]!.short}, and ${who} always sees what ${who} wrote.`);
    }

    // causal
    if (register) {
      const v = value.ids[0]!;
      const newer = [...past].map((id) => getWrite(s, id)).find((w) => dependencies(s, w.id).has(v));
      if (!newer) return yes;
      return newer.by === read.by
        ? no(`${who} wrote “${newer.text}”, which replaced it, so ${who} never sees the older caption.`)
        : no(`${who} has already seen “${newer.text}”, which replaced it, so ${who} never goes back to the older caption.`);
    }
    for (const id of value.ids) {
      const deps = [...dependencies(s, id)].filter((d) => !ids.has(d));
      if (deps.length) {
        const w = getWrite(s, id);
        return no(`It shows ${w.label} without ${getWrite(s, deps[0]!).label}, which ${PEOPLE[w.by].name} had seen before writing it: an effect without its cause.`);
      }
    }
    const lacking = [...past].filter((id) => !ids.has(id) && before.some((w) => w.id === id)).map((id) => getWrite(s, id));
    if (lacking.length) {
      const w = lacking[0]!;
      return no(w.by === read.by ? `It leaves out ${who}’s own ${w.short}.` : `It leaves out ${w.label}, which ${who} has already seen.`);
    }
    return yes;
  };

  const verdicts = values.map(verdict);
  return { model, read, verdicts, summary: summarize(s, model, read, verdicts, { synced, own, past }) };
}

function summarize(s: Scenario, model: ModelId, read: ReadEvent, verdicts: Verdict[], ctx: { synced: boolean; own: WriteEvent[]; past: Set<string> }): string {
  const who = PEOPLE[read.by].name;
  const banned = verdicts.filter((v) => !v.allowed).length;
  if (model === 'strong') {
    return s.shape === 'register'
      ? 'Only the latest caption: strong consistency behaves as if there were one copy.'
      : 'Only everything saved before this read: strong consistency behaves as if there were one copy.';
  }
  if (ctx.synced) return 'Every copy has caught up, so the weaker models now give the same answer as strong consistency.';
  if (model === 'eventual') {
    return 'Nothing is ruled out: until the copies catch up, a read may reach a copy that is behind, so an old value can come back even after a newer one was seen.';
  }
  if (model === 'read-your-writes') {
    if (ctx.own.length === 0) return `${who} has not written anything here, so read-your-writes allows whatever eventual consistency allows.`;
    return banned ? `${who}’s own change must show. Other people’s changes may still be missing.` : `${who}’s own change shows in every allowed value.`;
  }
  if (s.shape === 'register') {
    return banned
      ? `Never older than what ${who} has written or seen. Other people may still see the old caption.`
      : `${who} has not written or seen this caption yet, so either value is allowed.`;
  }
  if (!banned) return `${who} has not written or seen anything yet, and no value here shows an effect without its cause.`;
  return ctx.past.size === 0
    ? `${who} has seen nothing yet, but a reply can never appear without the comment it answers.`
    : `It must include what ${who} has written or seen, and never a reply without the comment it answers.`;
}

/** Judgements for every read up to and including step `stepIndex`, in story order. */
export function judgementsUpTo(s: Scenario, model: ModelId, stepIndex: number): Judgement[] {
  return s.events
    .slice(0, stepIndex + 1)
    .filter((e): e is ReadEvent => e.kind === 'read')
    .map((r) => judge(s, r.id, model));
}

export function allowedKeys(j: Judgement): string[] {
  return j.verdicts.filter((v) => v.allowed).map((v) => v.value.key);
}

/** A plain-text description of one model's timeline up to a step, for screen readers. */
export function describeTimeline(s: Scenario, model: ModelId, stepIndex: number): string {
  const parts = s.events.slice(1, stepIndex + 1).map((e) => {
    if (e.kind === 'write') return `at ${formatTime(e.at)}, ${PEOPLE[e.by].name} writes ${e.label}`;
    if (e.kind === 'sync') return `at ${formatTime(e.at)}, every copy has caught up`;
    if (e.kind === 'read') {
      const j = judge(s, e.id, model);
      const ok = j.verdicts.filter((v) => v.allowed).map((v) => v.value.label);
      const never = j.verdicts.filter((v) => !v.allowed).map((v) => v.value.label);
      return `at ${formatTime(e.at)}, read ${e.n} by ${PEOPLE[e.by].name} may return ${joinAnd(ok)}${never.length ? ` and never ${joinAnd(never)}` : ''}`;
    }
    return '';
  });
  const head = `${MODEL_INFO[model].title} timeline, ${s.title.toLowerCase()} story`;
  return parts.length ? `${head}: ${parts.filter(Boolean).join('; ')}.` : `${head}, before anything happens.`;
}
