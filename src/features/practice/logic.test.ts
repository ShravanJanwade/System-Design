import { describe, expect, it } from 'vitest';
import type { PracticeItem, Question } from '@/content/types';
import type { ItemRecord } from '@/state/practice';
import {
  buildContent,
  filterItems,
  itemStatus,
  matchCount,
  matchDetail,
  missedByLesson,
  modeSummary,
  modulesWithItems,
  newSession,
  pickNext,
  readLessonCount,
  remainingCount,
  roundState,
  scoreLine,
  sessionAnswer,
  sessionNewRound,
  sessionNext,
  sessionPick,
  sessionRestart,
  sessionScore,
  sessionSetFilters,
  sessionSkip,
  summaryLine,
} from './logic';

const numeric: Question = { kind: 'numeric', prompt: 'How many?', answer: 10, unit: 'servers', tolerance: 2, solution: ['10'] };
const single: Question = { kind: 'single', prompt: 'Which?', options: [{ text: 'A', correct: true, why: 'Because.' }] };
const bottleneck: Question = {
  kind: 'bottleneck',
  prompt: 'What breaks?',
  diagram: { grid: { cols: 1, rows: 1 }, nodes: [{ id: 'db', type: 'sqlDb', label: 'Database', x: 0, y: 0 }], edges: [] },
  answerNodeId: 'db',
  why: 'It is the only one.',
  others: {},
};

function item(id: string, lessonId: string, question: Question = numeric): PracticeItem {
  return { id, title: id, lessonId, question };
}

function rec(correct: boolean, seenAt: string): ItemRecord {
  return { correct, seenAt, attempts: 1 };
}

// Real lessons: dns is in module 1, back-of-the-envelope in module 2, caching in module 3.
const a = item('a', 'dns');
const b = item('b', 'back-of-the-envelope');
const c = item('c', 'back-of-the-envelope');
const d = item('d', 'caching');
const all = [a, b, c, d];

describe('buildContent', () => {
  it('splits the quiz pool by kind and adds the authored scenarios', () => {
    const pool = [item('n1', 'dns'), item('b1', 'caching', bottleneck), item('s1', 'dns', single)];
    const content = buildContent(pool, [item('b2', 'caching', bottleneck)], [item('t1', 'sql-vs-nosql', single)]);
    expect(content.estimation.map((i) => i.id)).toEqual(['n1']);
    expect(content.bottleneck.map((i) => i.id)).toEqual(['b1', 'b2']);
    expect(content.tools.map((i) => i.id)).toEqual(['t1']);
  });

  it('drops repeated ids', () => {
    const content = buildContent([item('x', 'dns', bottleneck)], [item('x', 'caching', bottleneck)], [item('x', 'dns', single), item('y', 'dns', single)]);
    expect(content.bottleneck.map((i) => i.lessonId)).toEqual(['dns']);
    expect(content.tools.map((i) => i.id)).toEqual(['y']);
  });
});

describe('filters', () => {
  const read = new Set(['back-of-the-envelope']);
  const isRead = (id: string) => read.has(id);

  it('keeps everything with the default filters', () => {
    expect(filterItems(all, { module: 'all', readOnly: false }, isRead)).toEqual(all);
  });

  it('filters by module', () => {
    expect(filterItems(all, { module: 'm2', readOnly: false }, isRead)).toEqual([b, c]);
    expect(filterItems(all, { module: 'm7', readOnly: false }, isRead)).toEqual([]);
  });

  it('filters by lessons read, together with the module', () => {
    expect(filterItems(all, { module: 'all', readOnly: true }, isRead)).toEqual([b, c]);
    expect(filterItems(all, { module: 'm3', readOnly: true }, isRead)).toEqual([]);
  });

  it('lists the modules that have questions, in curriculum order', () => {
    expect(modulesWithItems([d, a, b, c])).toEqual([
      { id: 'm1', label: 'Module 1: How the web works', count: 1 },
      { id: 'm2', label: 'Module 2: Thinking like a system designer', count: 2 },
      { id: 'm3', label: 'Module 3: The building blocks', count: 1 },
    ]);
  });

  it('counts the lessons read behind the questions', () => {
    expect(readLessonCount(all, isRead)).toEqual({ read: 1, total: 3 });
  });
});

describe('pickNext', () => {
  it('prefers questions not tried or missed last time', () => {
    const records = { a: rec(true, '2026-01-01'), b: rec(false, '2026-01-02'), c: rec(true, '2026-01-03') };
    const picks = new Set([0, 0.49, 0.5, 0.99].map((r) => pickNext(all, records, [], () => r)?.id));
    expect(picks).toEqual(new Set(['b', 'd']));
  });

  it('then picks the question answered right longest ago', () => {
    const records = { a: rec(true, '2026-03-01'), b: rec(true, '2026-01-01'), c: rec(true, '2026-02-01'), d: rec(true, '2026-04-01') };
    expect(pickNext(all, records, [], () => 0)?.id).toBe('b');
  });

  it('leaves out questions done this round, and returns null when none is left', () => {
    expect(pickNext(all, {}, ['a', 'b', 'c'], () => 0.7)?.id).toBe('d');
    expect(pickNext(all, {}, ['a', 'b', 'c', 'd'])).toBeNull();
    expect(pickNext([], {})).toBeNull();
  });

  it('stays in range when the random source returns 1', () => {
    expect(pickNext(all, {}, [], () => 1)?.id).toBe('d');
  });

  it('labels each question by its last answer', () => {
    expect(itemStatus(undefined)).toBe('new');
    expect(itemStatus(rec(false, 'x'))).toBe('missed');
    expect(itemStatus(rec(true, 'x'))).toBe('right');
  });
});

describe('session', () => {
  const first = () => 0;

  it('picks, answers, moves on and scores', () => {
    let s = sessionPick(newSession(), all, {}, first);
    expect(s.currentId).toBe('a');
    expect(s.shown).toBe(1);
    expect(roundState(s, all)).toBe('question');

    s = sessionAnswer(s, true);
    expect(s.checked).toBe(true);
    expect(sessionAnswer(s, false)).toBe(s);
    expect(sessionPick(s, all, {}, first)).toBe(s);
    expect(remainingCount(s, all)).toBe(3);

    s = sessionPick(sessionNext(s), all, {}, first);
    expect(s.currentId).toBe('b');
    expect(s.shown).toBe(2);

    s = sessionPick(sessionSkip(s), all, {}, first);
    expect(s.currentId).toBe('c');
    s = sessionAnswer(s, false);
    expect(sessionScore(s)).toEqual({ answered: 2, correct: 1, skipped: 1 });
  });

  it('ends the round when every matching question is done, and a new round brings them back', () => {
    let s = newSession();
    for (let i = 0; i < 2; i++) s = sessionNext(sessionAnswer(sessionPick(s, [a, b], {}, first), true));
    s = sessionPick(s, [a, b], {}, first);
    expect(s.currentId).toBeNull();
    expect(roundState(s, [a, b])).toBe('complete');

    s = sessionPick(sessionNewRound(s), [a, b], {}, first);
    expect(s.currentId).toBe('a');
    expect(sessionScore(s).answered).toBe(2);
  });

  it('replaces an unanswered question that no longer matches the filters, and keeps one that does', () => {
    let s = sessionPick(newSession(), all, {}, first);
    expect(s.currentId).toBe('a');
    const onlyModule2 = [b, c];
    s = sessionPick(sessionSetFilters(s, { module: 'm2', readOnly: false }), onlyModule2, {}, first);
    expect(s.filters.module).toBe('m2');
    expect(s.currentId).toBe('b');
    expect(sessionPick(s, all, {}, () => 0.99)).toBe(s);
  });

  it('keeps an answered question on screen when the filters change', () => {
    const s = sessionAnswer(sessionPick(newSession(), all, {}, first), true);
    const moved = sessionPick(sessionSetFilters(s, { module: 'm3', readOnly: false }), [d], {}, first);
    expect(moved.currentId).toBe('a');
    expect(roundState(moved, [d])).toBe('question');
  });

  it('says when nothing matches', () => {
    expect(roundState(newSession(), [])).toBe('empty');
    expect(roundState(newSession(), all)).toBe('pending');
  });

  it('restarts with an empty score, keeping an unanswered question as question 1', () => {
    let s = sessionPick(newSession(), all, {}, first);
    s = sessionPick(sessionNext(sessionAnswer(s, true)), all, {}, first);
    const restarted = sessionRestart(s);
    expect(restarted).toMatchObject({ results: [], done: [], skipped: 0, currentId: s.currentId, shown: 1, checked: false });
    expect(sessionRestart(sessionAnswer(s, true))).toMatchObject({ currentId: null, shown: 0 });
  });
});

describe('summary lines', () => {
  it('writes the session score', () => {
    expect(scoreLine({ answered: 0, correct: 0, skipped: 0 })).toBe('No answers yet.');
    expect(scoreLine({ answered: 0, correct: 0, skipped: 2 })).toBe('No answers yet. 2 skipped.');
    expect(scoreLine({ answered: 4, correct: 3, skipped: 1 })).toBe('3 of 4 correct. 1 skipped.');
  });

  it('summarizes the record in a mode', () => {
    const records = { a: rec(true, '1'), b: rec(false, '2') };
    expect(modeSummary(all, records)).toEqual({ total: 4, tried: 2, right: 1, missed: 1 });
    expect(summaryLine(modeSummary(all, {}))).toBe('4 questions. You have not tried any yet.');
    expect(summaryLine(modeSummary(all, records))).toBe('You have tried 2 of 4, and 1 was right the last time.');
    expect(summaryLine(modeSummary([], {}))).toBe('No questions are available in this mode.');
  });

  it('describes what the filters leave', () => {
    expect(matchCount(4, 4)).toBe('All 4 questions match.');
    expect(matchCount(2, 4)).toBe('2 of 4 questions match.');
    expect(matchCount(0, 4)).toBe('None of the 4 questions match these filters.');
    expect(matchDetail(all, { a: rec(false, '1') })).toBe('3 are new to you, and you missed 1 last time.');
    expect(matchDetail([a, b], { a: rec(false, '1') })).toBe('1 is new to you, and you missed 1 last time.');
    expect(matchDetail([a], { a: rec(false, '1') })).toBe('You missed 1 of them last time.');
    expect(matchDetail([a], { a: rec(true, '1') })).toBe('You got all of them right the last time.');
    expect(matchDetail([], {})).toBe('');
  });

  it('lists the lessons behind missed questions, most misses first', () => {
    const records = {
      a: rec(false, '2026-01-05'),
      b: rec(false, '2026-01-01'),
      c: rec(false, '2026-01-02'),
      d: rec(true, '2026-01-09'),
    };
    expect(missedByLesson(all, records)).toEqual([
      { lessonId: 'back-of-the-envelope', missed: 2, lastAt: '2026-01-02' },
      { lessonId: 'dns', missed: 1, lastAt: '2026-01-05' },
    ]);
  });
});
