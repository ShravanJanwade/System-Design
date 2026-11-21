import { describe, expect, it } from 'vitest';
import {
  CORRECTION_AT,
  DAY,
  INITIAL_LOG,
  STORED_DUPLICATE,
  append,
  describeStep,
  eventEffect,
  findDuplicateRefund,
  formatAt,
  formatDuration,
  orderPageProjection,
  orderProjection,
  pageStage,
  replay,
  ruleProblems,
  timingsProjection,
  viewOrderPage,
  viewTimings,
  voidRefundRecord,
  type OrderEvent,
  type Projection,
} from './logic';

/** The stored log plus support's correction, appended through the command. */
function corrected(): OrderEvent[] {
  const r = voidRefundRecord(INITIAL_LOG, 8, CORRECTION_AT);
  if (!r.ok) throw new Error(r.reason);
  return append(INITIAL_LOG, r.event);
}

/** Keeping a read model up to date event by event must give what a full rebuild gives. */
function expectIncrementalMatchesRebuild<S>(projection: Projection<S>, log: readonly OrderEvent[]) {
  let state = projection.initial();
  log.forEach((e, i) => {
    state = projection.apply(state, e);
    expect(state).toEqual(replay(projection, log, i + 1));
  });
}

describe('the stored log', () => {
  it('is one stream: sequence numbers count up from 1 and times never go backwards', () => {
    INITIAL_LOG.forEach((e, i) => {
      expect(e.seq).toBe(i + 1);
      if (i > 0) expect(e.at).toBeGreaterThanOrEqual(INITIAL_LOG[i - 1]!.at);
    });
  });

  it('replays to a delivered order with $45 paid and $30 refunded against $15 requested', () => {
    const s = replay(orderProjection, INITIAL_LOG);
    expect(s).toMatchObject({ version: 8, stage: 'delivered', total: 45, paid: 45, requested: 15, refunded: 30 });
    expect(ruleProblems(s)).toEqual(['$30 refunded, but only $15 was requested.']);
  });

  it('shows event 8 repeating event 7, a minute later', () => {
    expect(STORED_DUPLICATE).toEqual({ seq: 8, of: 7 });
    expect(findDuplicateRefund(INITIAL_LOG, 7)).toBeNull();
  });
});

describe('replaying', () => {
  it('derives the state one event at a time, starting from nothing', () => {
    expect(replay(orderProjection, INITIAL_LOG, 0)).toEqual(orderProjection.initial());
    const upTo = (i: number) => replay(orderProjection, INITIAL_LOG, i);
    expect(INITIAL_LOG.map((_, i) => upTo(i + 1).stage)).toEqual([
      'placed',
      'paid',
      'printed',
      'shipped',
      'delivered',
      'delivered',
      'delivered',
      'delivered',
    ]);
    expect(INITIAL_LOG.map((_, i) => upTo(i + 1).paid)).toEqual([0, 45, 45, 45, 45, 45, 45, 45]);
    expect(INITIAL_LOG.map((_, i) => upTo(i + 1).refunded)).toEqual([0, 0, 0, 0, 0, 0, 15, 30]);
  });

  it('is deterministic and never changes the log', () => {
    const before = JSON.stringify(INITIAL_LOG);
    expect(replay(orderProjection, INITIAL_LOG)).toEqual(replay(orderProjection, INITIAL_LOG));
    replay(orderPageProjection, INITIAL_LOG);
    replay(timingsProjection, INITIAL_LOG);
    expect(JSON.stringify(INITIAL_LOG)).toBe(before);
  });

  it('gives the same result whether a model is rebuilt from scratch or kept up to date event by event', () => {
    const log = corrected();
    expectIncrementalMatchesRebuild(orderProjection, log);
    expectIncrementalMatchesRebuild(orderPageProjection, log);
    expectIncrementalMatchesRebuild(timingsProjection, log);
  });
});

describe('fixing the duplicate by appending', () => {
  it('appends event 9, which voids event 8, so a full replay gives $15 refunded', () => {
    const r = voidRefundRecord(INITIAL_LOG, 8, CORRECTION_AT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event).toMatchObject({ seq: 9, kind: 'RefundRecordVoided', voids: 8, amount: 15, at: CORRECTION_AT });
    const log = append(INITIAL_LOG, r.event);
    const s = replay(orderProjection, log);
    expect(s.refunded).toBe(15);
    expect(ruleProblems(s)).toEqual([]);
    expect(findDuplicateRefund(log)).toBeNull();
  });

  it('keeps history: events 7 and 8 stay, and replaying the first eight still shows what the order said before the fix', () => {
    const log = corrected();
    expect(log).toHaveLength(9);
    expect(log.slice(0, 8)).toEqual(INITIAL_LOG);
    expect(replay(orderProjection, log, 8).refunded).toBe(30);
    expect(replay(orderPageProjection, log, 8).refunded).toBe(30);
    expect(replay(orderPageProjection, log).refunded).toBe(15);
  });

  it('rejects the same correction twice, because the command is checked against the current state', () => {
    const r = voidRefundRecord(corrected(), 8, CORRECTION_AT + 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('already voided by event 9');
  });

  it('rejects voiding an event that is not a refund record, or that does not exist', () => {
    const notRefund = voidRefundRecord(INITIAL_LOG, 2, CORRECTION_AT);
    expect(notRefund.ok).toBe(false);
    if (!notRefund.ok) expect(notRefund.reason).toContain('not a refund record');
    expect(voidRefundRecord(INITIAL_LOG, 42, CORRECTION_AT).ok).toBe(false);
  });

  it('only appends at the end of the stream, never earlier in it or back in time', () => {
    const r = voidRefundRecord(INITIAL_LOG, 8, CORRECTION_AT);
    if (!r.ok) throw new Error(r.reason);
    expect(() => append(INITIAL_LOG, { ...r.event, seq: 5 })).toThrow();
    expect(() => append(INITIAL_LOG, { ...r.event, at: 0 })).toThrow();
  });

  it('never dates a correction before the last stored event', () => {
    const r = voidRefundRecord(INITIAL_LOG, 8, 0);
    expect(r.ok && r.event.at).toBe(INITIAL_LOG[7]!.at + 1);
  });
});

describe('the order page read model', () => {
  it('agrees with the order state after every event, including the correction', () => {
    const log = corrected();
    for (let i = 0; i <= log.length; i++) {
      const s = replay(orderProjection, log, i);
      const p = replay(orderPageProjection, log, i);
      expect(p.version).toBe(s.version);
      expect(pageStage(p)).toBe(s.stage);
      expect(p.paid).toBe(s.paid);
      expect(p.refunded).toBe(s.refunded);
    }
  });

  it('shows what Maya sees at each point', () => {
    expect(viewOrderPage(replay(orderPageProjection, INITIAL_LOG, 0)).headline).toBe('No order yet');
    expect(viewOrderPage(replay(orderPageProjection, INITIAL_LOG, 4)).headline).toBe('On its way');
    const requested = viewOrderPage(replay(orderPageProjection, INITIAL_LOG, 6));
    expect(requested.headline).toBe('Delivered');
    expect(requested.lines).toContain('Refund of $15 requested');
    expect(viewOrderPage(replay(orderPageProjection, INITIAL_LOG)).lines).toContain('Refunded $30');
    const fixed = viewOrderPage(replay(orderPageProjection, corrected()));
    expect(fixed.lines).toContain('Refunded $15');
    expect(fixed.lines).not.toContain('Refund of $15 requested');
    expect(fixed.steps.every((s) => s.done)).toBe(true);
  });
});

describe('the print timings read model', () => {
  it('measures each stage from the event times', () => {
    const rows = viewTimings(replay(timingsProjection, INITIAL_LOG));
    expect(rows.map((r) => [r.label, r.minutes])).toEqual([
      ['Payment', 1],
      ['Printing', 1827],
      ['Packing and handover', 1105],
      ['Delivery', 3145],
      ['Refund turnaround', 318],
    ]);
  });

  it('leaves stages that have not happened yet empty', () => {
    expect(viewTimings(replay(timingsProjection, INITIAL_LOG, 3)).map((r) => r.minutes)).toEqual([1, 1827, null, null, null]);
  });

  it('can be built long after the events, from the same log, and the correction does not change it', () => {
    expect(viewTimings(replay(timingsProjection, corrected()))).toEqual(viewTimings(replay(timingsProjection, INITIAL_LOG)));
  });
});

describe('words', () => {
  it('formats times and durations', () => {
    expect(formatAt(INITIAL_LOG[0]!.at)).toBe('Mon 09:12');
    expect(formatAt(CORRECTION_AT)).toBe('Sun 09:30');
    expect(formatAt(7 * DAY + 5)).toBe('Mon 00:05');
    expect(formatDuration(1)).toBe('1 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(318)).toBe('5 h 18 min');
    expect(formatDuration(1827)).toBe('1 day 6 h');
    expect(formatDuration(3145)).toBe('2 days 4 h');
    expect(formatDuration(2 * DAY)).toBe('2 days');
  });

  it('describes each step, and points out the repeated refund', () => {
    expect(describeStep(INITIAL_LOG, 0)).toContain('no order yet');
    expect(describeStep(INITIAL_LOG, 2)).toContain('Paid goes from $0 to $45.');
    expect(describeStep(INITIAL_LOG, 7)).not.toContain('same');
    expect(describeStep(INITIAL_LOG, 8)).toContain('same $15 refund as event 7');
    const log = corrected();
    expect(describeStep(log, 9)).toContain('Refunded goes from $30 to $15.');
    expect(eventEffect(log[8]!)).toBe('refunded −$15');
  });
});
