/**
 * Event replay (lesson 6.4, CQRS and event sourcing): the append-only event log of one
 * Snapgram Prints order.
 *
 * Pure and deterministic. The order's state, both read models and the check behind the
 * correcting command are all derived from the log by replaying it; nothing else is stored.
 */

/** Minutes in a day. Event times are minutes after Monday 00:00 of the order's week. */
export const DAY = 24 * 60;

/** Two refund records of the same amount this close together look like one retried write. */
export const DUPLICATE_WINDOW_MIN = 10;

export type OrderEvent =
  | { seq: number; at: number; kind: 'OrderPlaced'; total: number; item: string }
  | { seq: number; at: number; kind: 'PaymentCaptured'; amount: number }
  | { seq: number; at: number; kind: 'BookPrinted' }
  | { seq: number; at: number; kind: 'BookShipped' }
  | { seq: number; at: number; kind: 'BookDelivered' }
  | { seq: number; at: number; kind: 'RefundRequested'; amount: number; reason: string }
  | { seq: number; at: number; kind: 'RefundIssued'; amount: number }
  | { seq: number; at: number; kind: 'RefundRecordVoided'; amount: number; voids: number; reason: string };

export type EventKind = OrderEvent['kind'];

function at(day: number, hour: number, minute: number): number {
  return day * DAY + hour * 60 + minute;
}

export const ORDER_NUMBER = 1042;

/**
 * Maya's photo book order, as stored. Event 8 repeats event 7: the support tool timed out,
 * retried, and the same $15 refund was recorded twice (the payment provider refunded once).
 */
export const INITIAL_LOG: readonly OrderEvent[] = [
  { seq: 1, at: at(0, 9, 12), kind: 'OrderPlaced', total: 45, item: '30-photo book' },
  { seq: 2, at: at(0, 9, 13), kind: 'PaymentCaptured', amount: 45 },
  { seq: 3, at: at(1, 15, 40), kind: 'BookPrinted' },
  { seq: 4, at: at(2, 10, 5), kind: 'BookShipped' },
  { seq: 5, at: at(4, 14, 30), kind: 'BookDelivered' },
  { seq: 6, at: at(5, 11, 2), kind: 'RefundRequested', amount: 15, reason: 'two pages printed blurry' },
  { seq: 7, at: at(5, 16, 20), kind: 'RefundIssued', amount: 15 },
  { seq: 8, at: at(5, 16, 21), kind: 'RefundIssued', amount: 15 },
];

/** When support appends its correction: Sunday morning, after Maya wrote in on Saturday evening. */
export const CORRECTION_AT = at(6, 9, 30);

export const EVENT_LABEL: Record<EventKind, string> = {
  OrderPlaced: 'Order placed',
  PaymentCaptured: 'Payment captured',
  BookPrinted: 'Book printed',
  BookShipped: 'Book shipped',
  BookDelivered: 'Book delivered',
  RefundRequested: 'Refund requested',
  RefundIssued: 'Refund issued',
  RefundRecordVoided: 'Refund record voided',
};

/* ------------------------------------------------------------------ */
/* Replay                                                              */
/* ------------------------------------------------------------------ */

/** A projection folds events, in order, into some state. Replaying the log through it rebuilds that state from nothing. */
export type Projection<S> = { initial: () => S; apply: (state: S, event: OrderEvent) => S };

/** Apply the first `upTo` events of the log, in order, starting from the projection's empty state. */
export function replay<S>(projection: Projection<S>, log: readonly OrderEvent[], upTo: number = log.length): S {
  const n = Math.max(0, Math.min(Math.floor(upTo), log.length));
  let state = projection.initial();
  for (let i = 0; i < n; i++) state = projection.apply(state, log[i]!);
  return state;
}

/* ------------------------------------------------------------------ */
/* The order's state (what the write model checks commands against)   */
/* ------------------------------------------------------------------ */

export const STAGES = ['placed', 'paid', 'printed', 'shipped', 'delivered'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  placed: 'Placed',
  paid: 'Paid',
  printed: 'Printed',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

const STAGE_OF: Partial<Record<EventKind, Stage>> = {
  OrderPlaced: 'placed',
  PaymentCaptured: 'paid',
  BookPrinted: 'printed',
  BookShipped: 'shipped',
  BookDelivered: 'delivered',
};

/** Stages only move forward. */
function later(a: Stage | null, b: Stage): Stage {
  return a !== null && STAGES.indexOf(a) > STAGES.indexOf(b) ? a : b;
}

export type RefundRecord = { seq: number; amount: number; at: number };

export type OrderState = {
  /** Number of events applied: the stream's version. */
  version: number;
  stage: Stage | null;
  total: number;
  paid: number;
  /** Refund amounts asked for so far. */
  requested: number;
  /** Refund records that still count. A voided record is dropped. */
  refunds: readonly RefundRecord[];
  refunded: number;
};

function withRefunds(s: OrderState, refunds: readonly RefundRecord[]): OrderState {
  return { ...s, refunds, refunded: refunds.reduce((n, r) => n + r.amount, 0) };
}

export const orderProjection: Projection<OrderState> = {
  initial: () => ({ version: 0, stage: null, total: 0, paid: 0, requested: 0, refunds: [], refunded: 0 }),
  apply: (s, e) => {
    const stage = STAGE_OF[e.kind];
    const base: OrderState = { ...s, version: s.version + 1, stage: stage ? later(s.stage, stage) : s.stage };
    switch (e.kind) {
      case 'OrderPlaced':
        return { ...base, total: e.total };
      case 'PaymentCaptured':
        return { ...base, paid: s.paid + e.amount };
      case 'RefundRequested':
        return { ...base, requested: s.requested + e.amount };
      case 'RefundIssued':
        return withRefunds(base, [...s.refunds, { seq: e.seq, amount: e.amount, at: e.at }]);
      case 'RefundRecordVoided':
        return withRefunds(
          base,
          s.refunds.filter((r) => r.seq !== e.voids),
        );
      default:
        return base;
    }
  },
};

/** Business rules the state must satisfy. A broken rule means some stored event is wrong. */
export function ruleProblems(s: OrderState): string[] {
  const out: string[] = [];
  if (s.refunded > s.requested) out.push(`${money(s.refunded)} refunded, but only ${money(s.requested)} was requested.`);
  if (s.refunded > s.paid) out.push(`${money(s.refunded)} refunded, more than the ${money(s.paid)} paid.`);
  return out;
}

/** A refund record that repeats an earlier, still-counting record of the same amount within a few minutes. */
export function findDuplicateRefund(log: readonly OrderEvent[], upTo: number = log.length): { seq: number; of: number } | null {
  const { refunds } = replay(orderProjection, log, upTo);
  for (let i = 1; i < refunds.length; i++) {
    const r = refunds[i]!;
    const first = refunds.slice(0, i).find((p) => p.amount === r.amount && r.at - p.at <= DUPLICATE_WINDOW_MIN);
    if (first) return { seq: r.seq, of: first.seq };
  }
  return null;
}

/** The duplicate in the stored log: event 8 repeats event 7. */
export const STORED_DUPLICATE = findDuplicateRefund(INITIAL_LOG);

/* ------------------------------------------------------------------ */
/* Commands (the write side)                                           */
/* ------------------------------------------------------------------ */

export type CommandResult = { ok: true; event: OrderEvent } | { ok: false; reason: string };

/**
 * The command "void refund record N", handled the event-sourcing way: replay the whole stream to
 * get the current state, check the rules against it, and only then produce one new event.
 * A command can be refused; an event, once stored, is a fact.
 */
export function voidRefundRecord(log: readonly OrderEvent[], target: number, when: number): CommandResult {
  const state = replay(orderProjection, log);
  const event = log.find((e) => e.seq === target);
  if (!event) return { ok: false, reason: `Rejected: there is no event ${target} in this order’s log, so nothing was stored.` };
  if (event.kind !== 'RefundIssued') {
    return { ok: false, reason: `Rejected: event ${target} is “${EVENT_LABEL[event.kind].toLowerCase()}”, not a refund record, so nothing was stored.` };
  }
  const voidedBy = log.find((e) => e.kind === 'RefundRecordVoided' && e.voids === target);
  if (voidedBy || !state.refunds.some((r) => r.seq === target)) {
    return {
      ok: false,
      reason: `Rejected: event ${target} was already voided${voidedBy ? ` by event ${voidedBy.seq}` : ''}. The command was checked against the current state, so nothing was stored.`,
    };
  }
  const last = log[log.length - 1];
  return {
    ok: true,
    event: {
      seq: state.version + 1,
      at: Math.max(when, last ? last.at + 1 : when),
      kind: 'RefundRecordVoided',
      amount: event.amount,
      voids: target,
      reason: 'the same refund was recorded twice',
    },
  };
}

/** Add an event at the end of the stream. There is no other way to change it. */
export function append(log: readonly OrderEvent[], event: OrderEvent): OrderEvent[] {
  if (event.seq !== log.length + 1) {
    throw new Error(`Event ${event.seq} cannot follow event ${log.length}: a stream only grows at its end.`);
  }
  const last = log[log.length - 1];
  if (last && event.at < last.at) throw new Error('An appended event cannot be older than the last one.');
  return [...log, event];
}

/* ------------------------------------------------------------------ */
/* Read model 1: the order page Maya sees                              */
/* ------------------------------------------------------------------ */

export type OrderPage = {
  version: number;
  /** When each stage was first reached. */
  stageAt: Partial<Record<Stage, number>>;
  total: number;
  paid: number;
  refunded: number;
  refundPending: number;
};

/** Its own projection, separate from the order state: a read model keeps only what its screen shows. */
export const orderPageProjection: Projection<OrderPage> = {
  initial: () => ({ version: 0, stageAt: {}, total: 0, paid: 0, refunded: 0, refundPending: 0 }),
  apply: (p, e) => {
    const stage = STAGE_OF[e.kind];
    const base: OrderPage = {
      ...p,
      version: p.version + 1,
      stageAt: stage && p.stageAt[stage] === undefined ? { ...p.stageAt, [stage]: e.at } : p.stageAt,
    };
    switch (e.kind) {
      case 'OrderPlaced':
        return { ...base, total: e.total };
      case 'PaymentCaptured':
        return { ...base, paid: p.paid + e.amount };
      case 'RefundRequested':
        return { ...base, refundPending: p.refundPending + e.amount };
      case 'RefundIssued':
        return { ...base, refunded: p.refunded + e.amount, refundPending: Math.max(0, p.refundPending - e.amount) };
      case 'RefundRecordVoided':
        return { ...base, refunded: Math.max(0, p.refunded - e.amount) };
      default:
        return base;
    }
  },
};

const HEADLINE: Record<Stage, string> = {
  placed: 'Waiting for payment',
  paid: 'Paid, waiting to print',
  printed: 'Printed, being packed',
  shipped: 'On its way',
  delivered: 'Delivered',
};

export function pageStage(p: OrderPage): Stage | null {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    const s = STAGES[i]!;
    if (p.stageAt[s] !== undefined) return s;
  }
  return null;
}

export type OrderPageView = {
  headline: string;
  steps: { stage: Stage; label: string; done: boolean }[];
  lines: string[];
};

export function viewOrderPage(p: OrderPage): OrderPageView {
  const stage = pageStage(p);
  const lines: string[] = [];
  if (p.total > 0) lines.push(`Total ${money(p.total)}, paid ${money(p.paid)}`);
  if (p.refundPending > 0) lines.push(`Refund of ${money(p.refundPending)} requested`);
  if (p.refunded > 0) lines.push(`Refunded ${money(p.refunded)}`);
  return {
    headline: stage ? HEADLINE[stage] : 'No order yet',
    steps: STAGES.map((s) => ({ stage: s, label: STAGE_LABEL[s], done: p.stageAt[s] !== undefined })),
    lines,
  };
}

/* ------------------------------------------------------------------ */
/* Read model 2: print timings, built later from the same log          */
/* ------------------------------------------------------------------ */

export type Mark = Stage | 'refundRequested' | 'refundIssued';

export type Timings = { version: number; at: Partial<Record<Mark, number>> };

const MARK_OF: Record<EventKind, Mark | null> = {
  OrderPlaced: 'placed',
  PaymentCaptured: 'paid',
  BookPrinted: 'printed',
  BookShipped: 'shipped',
  BookDelivered: 'delivered',
  RefundRequested: 'refundRequested',
  RefundIssued: 'refundIssued',
  RefundRecordVoided: null,
};

export const timingsProjection: Projection<Timings> = {
  initial: () => ({ version: 0, at: {} }),
  apply: (t, e) => {
    const mark = MARK_OF[e.kind];
    return { version: t.version + 1, at: mark && t.at[mark] === undefined ? { ...t.at, [mark]: e.at } : t.at };
  },
};

export const TIMING_ROWS: readonly { label: string; from: Mark; to: Mark }[] = [
  { label: 'Payment', from: 'placed', to: 'paid' },
  { label: 'Printing', from: 'paid', to: 'printed' },
  { label: 'Packing and handover', from: 'printed', to: 'shipped' },
  { label: 'Delivery', from: 'shipped', to: 'delivered' },
  { label: 'Refund turnaround', from: 'refundRequested', to: 'refundIssued' },
];

export function viewTimings(t: Timings): { label: string; minutes: number | null }[] {
  return TIMING_ROWS.map((r) => {
    const a = t.at[r.from];
    const b = t.at[r.to];
    return { label: r.label, minutes: a !== undefined && b !== undefined ? b - a : null };
  });
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

export function money(n: number): string {
  return n < 0 ? `−$${-n}` : `$${n}`;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 552 -> "Mon 09:12". */
export function formatAt(minutes: number): string {
  const day = Math.floor(minutes / DAY);
  const m = minutes - day * DAY;
  return `${DAY_NAMES[((day % 7) + 7) % 7]} ${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** 1 -> "1 min", 75 -> "1 h 15 min", 1827 -> "1 day 6 h". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const days = Math.floor(m / DAY);
  const hours = Math.floor((m % DAY) / 60);
  const mins = m % 60;
  if (days > 0) return hours > 0 ? `${days} ${days === 1 ? 'day' : 'days'} ${hours} h` : `${days} ${days === 1 ? 'day' : 'days'}`;
  return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
}

/** The event's details, as shown in the log. */
export function eventDetail(e: OrderEvent): string {
  switch (e.kind) {
    case 'OrderPlaced':
      return `${e.item}, ${money(e.total)} total`;
    case 'PaymentCaptured':
      return `${money(e.amount)} from Maya’s card`;
    case 'BookPrinted':
      return 'by the print shop';
    case 'BookShipped':
      return 'handed to the courier';
    case 'BookDelivered':
      return 'to Maya’s mother';
    case 'RefundRequested':
      return `${money(e.amount)}: ${e.reason}`;
    case 'RefundIssued':
      return `${money(e.amount)} back to Maya’s card`;
    case 'RefundRecordVoided':
      return `cancels event ${e.voids}: ${e.reason}`;
  }
}

/** What the event changes in the derived state, in a few words. */
export function eventEffect(e: OrderEvent): string {
  switch (e.kind) {
    case 'OrderPlaced':
      return `${money(e.total)} due`;
    case 'PaymentCaptured':
      return `paid +${money(e.amount)}`;
    case 'BookPrinted':
      return 'status: printed';
    case 'BookShipped':
      return 'status: shipped';
    case 'BookDelivered':
      return 'status: delivered';
    case 'RefundRequested':
      return `requested ${money(e.amount)}`;
    case 'RefundIssued':
      return `refunded +${money(e.amount)}`;
    case 'RefundRecordVoided':
      return `refunded ${money(-e.amount)}`;
  }
}

/** What replaying up to event number `index` (1-based) shows, in one to three sentences. */
export function describeStep(log: readonly OrderEvent[], index: number): string {
  if (index <= 0) {
    return `The log holds ${log.length} events and none has been replayed, so there is no order yet. Step forward to apply them one at a time.`;
  }
  const e = log[Math.min(index, log.length) - 1]!;
  const before = replay(orderProjection, log, e.seq - 1);
  const after = replay(orderProjection, log, e.seq);
  const head = `Event ${e.seq}, ${formatAt(e.at)}: ${EVENT_LABEL[e.kind].toLowerCase()}.`;
  switch (e.kind) {
    case 'OrderPlaced':
      return `${head} The order now exists: a ${e.item}, ${money(e.total)} in total.`;
    case 'PaymentCaptured':
      return `${head} Paid goes from ${money(before.paid)} to ${money(after.paid)}.`;
    case 'BookPrinted':
    case 'BookShipped':
    case 'BookDelivered':
      return `${head} The status moves to ${after.stage}.`;
    case 'RefundRequested':
      return `${head} Maya asks for ${money(e.amount)} back: ${e.reason}.`;
    case 'RefundIssued': {
      const dup = findDuplicateRefund(log, e.seq);
      const repeat =
        dup && dup.seq === e.seq ? ` That is the same ${money(e.amount)} refund as event ${dup.of}, recorded again a minute later.` : '';
      return `${head} Refunded goes from ${money(before.refunded)} to ${money(after.refunded)}.${repeat}`;
    }
    case 'RefundRecordVoided':
      return `${head} Refunded goes from ${money(before.refunded)} to ${money(after.refunded)}. Event ${e.voids} stays in the log; this event cancels its effect.`;
  }
}
