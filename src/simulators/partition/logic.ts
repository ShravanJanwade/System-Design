/**
 * Partition playground: two copies of Snapgram's data, one in Oregon and one in Singapore,
 * joined by a single link across the Pacific. The learner cuts the link, picks a mode and
 * sends requests to either region.
 *
 * Consistency first: a write counts only once both regions have stored it, so it waits one
 * round trip for the other region. While the link is cut, a write waits for a timeout and is
 * refused. Reads are answered from the local copy, which stays correct: no write can succeed
 * anywhere while the link is down, so both copies keep the same data.
 *
 * Availability first: a write is stored by the region that received it and answered at once.
 * While the link is up, the other region gets it straight away; while the link is cut, writes
 * queue up and the copies drift apart. When the link heals, the queued writes are exchanged
 * and merged: likes add up, because each region counts its own (a grow-only counter); the
 * caption goes to the newest edit (last write wins); and a username claimed on both sides
 * goes to the earlier claim, so the other account must pick a new name.
 *
 * Time is simulated: each action happens one second after the previous one. Latencies are
 * ballpark figures, chosen for illustration.
 */

export type Region = 'oregon' | 'singapore';
export type Mode = 'consistency' | 'availability';

export const REGIONS: Region[] = ['oregon', 'singapore'];
export const MODES: Mode[] = ['consistency', 'availability'];
export const REGION_NAME: Record<Region, string> = { oregon: 'Oregon', singapore: 'Singapore' };

export function otherRegion(r: Region): Region {
  return r === 'oregon' ? 'singapore' : 'oregon';
}

/** A read or write inside one region, in milliseconds (ballpark). */
export const LOCAL_MS = 5;
/** Oregon to Singapore and back (ballpark). */
export const RTT_MS = 170;
/** How long a region waits for the other before giving up on a write. */
export const TIMEOUT_MS = 1000;

export const START_LIKES: Record<Region, number> = { oregon: 70, singapore: 50 };
export const START_CAPTION = 'Sunset';
export const USERNAME = '@sunset';
/** The new user who tries to sign up as @sunset in each region. */
export const CLAIMANT: Record<Region, string> = { oregon: 'Jordan', singapore: 'Ana' };
/** Captions Maya cycles through: from her laptop (routed to Oregon) and from her phone (Singapore). */
export const CAPTIONS: Record<Region, string[]> = {
  oregon: ['Marina Bay, 7 pm', 'Sunset from the rooftop', 'Same sunset, new crop'],
  singapore: ['Golden hour at Marina Bay', 'Best sunset this year', 'Sunset, no filter'],
};

export type Caption = { text: string; at: number; from: Region };
export type Claim = { owner: string; at: number; from: Region };
/** One region's copy. `likes` holds each region's own count, as far as this copy knows. */
export type Replica = { caption: Caption; likes: Record<Region, number>; username: Claim | null };

export type WriteKind = 'like' | 'caption' | 'claim';
export const WRITE_KINDS: WriteKind[] = ['like', 'caption', 'claim'];

export type Action =
  | { kind: 'write'; write: WriteKind; from: Region }
  | { kind: 'read'; from: Region }
  | { kind: 'cut' }
  | { kind: 'heal' }
  | { kind: 'mode'; mode: Mode };

export type Snapshot = { caption: string; likes: number; username: string | null };

/** Writes a region accepted while the link was cut, not yet sent to the other region. */
export type Queue = { likes: number; captions: number; claims: number };

export type MergeReport = {
  /** True when at least one write was queued during the cut. */
  changed: boolean;
  likesBefore: Record<Region, number>;
  likesAfter: number;
  likesQueued: Record<Region, number>;
  caption: { conflict: boolean; kept: Caption; discarded: Caption | null };
  username: { conflict: boolean; keeper: Claim | null; renamed: Claim | null };
};

export type Outcome = 'accepted' | 'refused' | 'taken' | 'read' | 'link' | 'mode';

export type LogEntry = {
  /** Seconds after 12:00:00. */
  t: number;
  action: Action;
  /** Mode and link state when the action happened. */
  mode: Mode;
  linkUp: boolean;
  outcome: Outcome;
  latencyMs: number | null;
  /** For reads: what the local copy returned, whether the copies disagreed, and what this region had not seen. */
  read?: { snapshot: Snapshot; diverged: boolean; behind: string[] };
  merge?: MergeReport;
  /** One plain sentence or two, for the log and for screen readers. */
  text: string;
};

export type PartitionState = {
  mode: Mode;
  linkUp: boolean;
  clock: number;
  replicas: Record<Region, Replica>;
  queued: Record<Region, Queue>;
  captionTurn: Record<Region, number>;
  log: LogEntry[];
};

const EMPTY_QUEUE: Queue = { likes: 0, captions: 0, claims: 0 };

function startReplica(): Replica {
  return { caption: { text: START_CAPTION, at: 0, from: 'singapore' }, likes: { ...START_LIKES }, username: null };
}

export function initialState(mode: Mode = 'consistency'): PartitionState {
  return {
    mode,
    linkUp: true,
    clock: 0,
    replicas: { oregon: startReplica(), singapore: startReplica() },
    queued: { oregon: { ...EMPTY_QUEUE }, singapore: { ...EMPTY_QUEUE } },
    captionTurn: { oregon: 0, singapore: 0 },
    log: [],
  };
}

/** "12:00:07" for 7 seconds after noon. */
export function formatClock(t: number): string {
  const total = 12 * 3600 + Math.max(0, Math.round(t));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function totalLikes(r: Replica): number {
  return r.likes.oregon + r.likes.singapore;
}

export function snapshot(r: Replica): Snapshot {
  return { caption: r.caption.text, likes: totalLikes(r), username: r.username ? r.username.owner : null };
}

export type Field = 'caption' | 'likes' | 'username';

/** Which fields the two copies disagree on. Empty while the link is up. */
export function differences(s: PartitionState): Field[] {
  const o = s.replicas.oregon;
  const g = s.replicas.singapore;
  const out: Field[] = [];
  if (o.caption.text !== g.caption.text || o.caption.at !== g.caption.at) out.push('caption');
  if (o.likes.oregon !== g.likes.oregon || o.likes.singapore !== g.likes.singapore) out.push('likes');
  if ((o.username?.owner ?? null) !== (g.username?.owner ?? null)) out.push('username');
  return out;
}

export function copiesAgree(s: PartitionState): boolean {
  return differences(s).length === 0;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 likes, a caption change and a claim on @sunset". */
export function describeQueue(q: Queue): string[] {
  const parts: string[] = [];
  if (q.likes) parts.push(plural(q.likes, 'like', 'likes'));
  if (q.captions) parts.push(q.captions === 1 ? 'a caption change' : `${q.captions} caption changes`);
  if (q.claims) parts.push(`a claim on ${USERNAME}`);
  return parts;
}

export function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function cloneReplica(r: Replica): Replica {
  return { caption: { ...r.caption }, likes: { ...r.likes }, username: r.username ? { ...r.username } : null };
}

const WRITE_NOUN: Record<WriteKind, string> = { like: 'like', caption: 'caption change', claim: `sign-up as ${USERNAME}` };

/** Applies an accepted write to one copy. */
function applyWrite(rep: Replica, write: WriteKind, from: Region, t: number, caption: string): void {
  if (write === 'like') rep.likes[from] += 1;
  else if (write === 'caption') rep.caption = { text: caption, at: t, from };
  else rep.username = { owner: CLAIMANT[from], at: t, from };
}

/** Copies one region's latest data for a write onto the other copy (replication while the link is up). */
function replicate(target: Replica, source: Replica, write: WriteKind, from: Region): void {
  if (write === 'like') target.likes[from] = Math.max(target.likes[from], source.likes[from]);
  else if (write === 'caption') target.caption = { ...source.caption };
  else target.username = source.username ? { ...source.username } : null;
}

function later(a: Caption, b: Caption): Caption {
  if (a.at !== b.at) return a.at > b.at ? a : b;
  return a.from === 'oregon' ? a : b;
}

/** Exchanges queued writes and merges the two copies. Pure: returns new replicas and a report. */
export function mergeCopies(s: PartitionState): { replicas: Record<Region, Replica>; report: MergeReport } {
  const o = s.replicas.oregon;
  const g = s.replicas.singapore;
  const likes: Record<Region, number> = {
    oregon: Math.max(o.likes.oregon, g.likes.oregon),
    singapore: Math.max(o.likes.singapore, g.likes.singapore),
  };
  const captionConflict = s.queued.oregon.captions > 0 && s.queued.singapore.captions > 0;
  const kept = later(o.caption, g.caption);
  const discarded = captionConflict ? (kept === o.caption ? g.caption : o.caption) : null;

  let keeper: Claim | null = o.username ?? g.username;
  let renamed: Claim | null = null;
  const nameConflict = o.username !== null && g.username !== null && o.username.owner !== g.username.owner;
  if (nameConflict) {
    const first = o.username!.at <= g.username!.at ? o.username! : g.username!;
    keeper = first;
    renamed = first === o.username ? g.username : o.username;
  }

  const merged = (): Replica => ({ caption: { ...kept }, likes: { ...likes }, username: keeper ? { ...keeper } : null });
  const queuedAny = REGIONS.some((r) => s.queued[r].likes + s.queued[r].captions + s.queued[r].claims > 0);
  return {
    replicas: { oregon: merged(), singapore: merged() },
    report: {
      changed: queuedAny,
      likesBefore: { oregon: totalLikes(o), singapore: totalLikes(g) },
      likesAfter: likes.oregon + likes.singapore,
      likesQueued: { oregon: s.queued.oregon.likes, singapore: s.queued.singapore.likes },
      caption: { conflict: captionConflict, kept: { ...kept }, discarded: discarded ? { ...discarded } : null },
      username: { conflict: nameConflict, keeper: keeper ? { ...keeper } : null, renamed: renamed ? { ...renamed } : null },
    },
  };
}

function mergeText(r: MergeReport): string {
  if (!r.changed) return 'The link is back. Nothing was accepted while it was cut, so there is nothing to merge.';
  const parts = ['The link is back, and the queued writes cross the Pacific.'];
  if (r.likesQueued.oregon + r.likesQueued.singapore > 0) {
    parts.push(
      `Likes: ${r.likesBefore.oregon} in Oregon and ${r.likesBefore.singapore} in Singapore merge to ${r.likesAfter}, with none lost.`,
    );
  }
  if (r.caption.conflict && r.caption.discarded) {
    parts.push(
      `Caption: last write wins keeps “${r.caption.kept.text}” (${formatClock(r.caption.kept.at)}, ${REGION_NAME[r.caption.kept.from]}) and drops “${r.caption.discarded.text}”.`,
    );
  }
  if (r.username.conflict && r.username.keeper && r.username.renamed) {
    parts.push(
      `${USERNAME}: both regions gave it away. ${r.username.keeper.owner} claimed it first and keeps it, so ${r.username.renamed.owner} must pick a new name.`,
    );
  }
  return parts.join(' ');
}

/** Applies one action. Pure: returns a new state, or the same state when the action is not allowed. */
export function step(s: PartitionState, action: Action): PartitionState {
  if (action.kind === 'mode') {
    if (!s.linkUp || action.mode === s.mode) return s;
  }
  if (action.kind === 'cut' && !s.linkUp) return s;
  if (action.kind === 'heal' && s.linkUp) return s;

  const t = s.clock + 1;
  const replicas: Record<Region, Replica> = { oregon: cloneReplica(s.replicas.oregon), singapore: cloneReplica(s.replicas.singapore) };
  const queued: Record<Region, Queue> = { oregon: { ...s.queued.oregon }, singapore: { ...s.queued.singapore } };
  const captionTurn = { ...s.captionTurn };
  let mode = s.mode;
  let linkUp = s.linkUp;
  const base = { t, action, mode: s.mode, linkUp: s.linkUp };
  let entry: LogEntry;

  switch (action.kind) {
    case 'mode': {
      mode = action.mode;
      entry = {
        ...base,
        outcome: 'mode',
        latencyMs: null,
        text: mode === 'consistency' ? 'Switched to consistency first: every write now waits for both regions.' : 'Switched to availability first: every write is now answered by the region that receives it.',
      };
      break;
    }
    case 'cut': {
      linkUp = false;
      entry = { ...base, outcome: 'link', latencyMs: null, text: 'The link between Oregon and Singapore is cut. Both regions keep running, but no message gets across.' };
      break;
    }
    case 'heal': {
      linkUp = true;
      const { replicas: merged, report } = mergeCopies(s);
      replicas.oregon = merged.oregon;
      replicas.singapore = merged.singapore;
      queued.oregon = { ...EMPTY_QUEUE };
      queued.singapore = { ...EMPTY_QUEUE };
      entry = { ...base, outcome: 'link', latencyMs: null, merge: report, text: mergeText(report) };
      break;
    }
    case 'read': {
      const from = action.from;
      const snap = snapshot(replicas[from]);
      const diverged = !copiesAgree(s);
      const behind = describeQueue(s.queued[otherRegion(from)]);
      const where = REGION_NAME[from];
      const there = REGION_NAME[otherRegion(from)];
      let text = `${where} returns “${snap.caption}”, ${snap.likes} likes and ${USERNAME} ${snap.username ? `taken by ${snap.username}` : 'free'}, in ${LOCAL_MS} ms.`;
      if (behind.length) text += ` ${there} has accepted ${joinList(behind)} that ${where} cannot see yet.`;
      else if (!s.linkUp) text += ' Nothing can change while the link is down, so this copy is still current.';
      entry = { ...base, outcome: 'read', latencyMs: LOCAL_MS, read: { snapshot: snap, diverged, behind }, text };
      break;
    }
    case 'write': {
      const { write, from } = action;
      const to = otherRegion(from);
      const where = REGION_NAME[from];
      const there = REGION_NAME[to];
      const local = replicas[from];
      if (write === 'claim' && local.username !== null) {
        entry = { ...base, outcome: 'taken', latencyMs: LOCAL_MS, text: `${CLAIMANT[from]} cannot sign up as ${USERNAME}: ${where}’s copy says ${local.username.owner} has it.` };
        break;
      }
      if (s.mode === 'consistency' && !s.linkUp) {
        entry = {
          ...base,
          outcome: 'refused',
          latencyMs: TIMEOUT_MS,
          text: `${where} waits ${TIMEOUT_MS / 1000} s for ${there} to confirm the ${WRITE_NOUN[write]}, gets no answer, and refuses it.`,
        };
        break;
      }
      const caption = CAPTIONS[from][captionTurn[from] % CAPTIONS[from].length]!;
      if (write === 'caption') captionTurn[from] += 1;
      applyWrite(local, write, from, t, caption);
      const what = write === 'caption' ? `caption change to “${caption}”` : write === 'claim' ? `sign-up of ${CLAIMANT[from]} as ${USERNAME}` : 'like';
      if (s.mode === 'consistency') {
        replicate(replicas[to], local, write, from);
        entry = {
          ...base,
          outcome: 'accepted',
          latencyMs: LOCAL_MS + RTT_MS,
          text: `${where} stores the ${what}, waits for ${there} to store it too, then confirms: ${LOCAL_MS + RTT_MS} ms.`,
        };
      } else if (s.linkUp) {
        replicate(replicas[to], local, write, from);
        entry = { ...base, outcome: 'accepted', latencyMs: LOCAL_MS, text: `${where} stores the ${what} and confirms in ${LOCAL_MS} ms, then sends it to ${there}.` };
      } else {
        const q = queued[from];
        if (write === 'like') q.likes += 1;
        else if (write === 'caption') q.captions += 1;
        else q.claims += 1;
        entry = {
          ...base,
          outcome: 'accepted',
          latencyMs: LOCAL_MS,
          text: `${where} stores the ${what} and confirms in ${LOCAL_MS} ms. ${there} cannot hear about it until the link heals.`,
        };
      }
      break;
    }
  }

  return { mode, linkUp, clock: t, replicas, queued, captionTurn, log: [...s.log, entry] };
}

/** Runs a list of actions from the starting state. */
export function run(actions: Action[], mode: Mode = 'consistency'): PartitionState {
  return actions.reduce(step, initialState(mode));
}

export type Totals = { accepted: number; refused: number; taken: number; reads: number };

export function totals(s: PartitionState): Totals {
  const t: Totals = { accepted: 0, refused: 0, taken: 0, reads: 0 };
  for (const e of s.log) {
    if (e.outcome === 'accepted') t.accepted++;
    else if (e.outcome === 'refused') t.refused++;
    else if (e.outcome === 'taken') t.taken++;
    else if (e.outcome === 'read') t.reads++;
  }
  return t;
}

export function lastWrite(s: PartitionState): LogEntry | undefined {
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i]!;
    if (e.action.kind === 'write' && (e.outcome === 'accepted' || e.outcome === 'refused')) return e;
  }
  return undefined;
}

/* Challenge checks ------------------------------------------------------------------ */

/** Challenge 1: a write refused because the link was down. */
export function firstRefusal(s: PartitionState): LogEntry | undefined {
  return s.log.find((e) => e.outcome === 'refused');
}

/** Challenge 2: a read answered while the copies disagreed. */
export function lastDivergedRead(s: PartitionState): LogEntry | undefined {
  for (let i = s.log.length - 1; i >= 0; i--) if (s.log[i]!.read?.diverged) return s.log[i];
  return undefined;
}

/** Challenge 3: a heal that had to settle a conflict (two captions, or two owners of @sunset). */
export function lastConflictMerge(s: PartitionState): MergeReport | undefined {
  for (let i = s.log.length - 1; i >= 0; i--) {
    const m = s.log[i]!.merge;
    if (m && (m.caption.conflict || m.username.conflict)) return m;
  }
  return undefined;
}

/** Challenge 4: an accepted write with the link up, in each mode. */
export function writesWithLinkUp(s: PartitionState): Partial<Record<Mode, LogEntry>> {
  const out: Partial<Record<Mode, LogEntry>> = {};
  for (const e of s.log) {
    if (e.action.kind === 'write' && e.outcome === 'accepted' && e.linkUp) out[e.mode] = e;
  }
  return out;
}
