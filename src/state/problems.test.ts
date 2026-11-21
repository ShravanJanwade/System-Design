import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Store = typeof import('./problems');
let S: Store;

beforeAll(async () => {
  // The store persists to localStorage; give it an in-memory one before it is created.
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  S = await import('./problems');
});

beforeEach(() => {
  S.useProblems.getState().reset();
});

describe('timer', () => {
  it('banks time while running and stops on pause', () => {
    let t = S.IDLE_TIMER;
    t = S.timerStart(t, 1_000);
    expect(S.timerElapsed(t, 4_000)).toBe(3_000);
    expect(S.timerStart(t, 9_000)).toBe(t);
    t = S.timerPause(t, 6_000);
    expect(t).toEqual({ elapsedMs: 5_000, runningSince: null });
    expect(S.timerElapsed(t, 99_000)).toBe(5_000);
    expect(S.timerPause(t, 99_000)).toBe(t);
    t = S.timerStart(t, 10_000);
    expect(S.timerElapsed(t, 12_000)).toBe(7_000);
  });

  it('never counts backwards when the clock jumps', () => {
    expect(S.timerElapsed({ elapsedMs: 100, runningSince: 5_000 }, 4_000)).toBe(100);
  });
});

describe('practice workspace', () => {
  it('reveals hints one at a time, up to three', () => {
    const s = () => S.useProblems.getState();
    for (let i = 0; i < 5; i++) s().revealHint('url-shortener');
    expect(s().workspaces['url-shortener']!.hintsShown).toBe(3);
  });

  it('marks an attempt done: pauses the timer and opens the walkthrough', () => {
    const s = () => S.useProblems.getState();
    s().startTimer('p', 1_000);
    s().markAttemptDone('p', 61_000);
    const ws = s().workspaces.p!;
    expect(ws.timer).toEqual({ elapsedMs: 60_000, runningSince: null });
    expect(ws).toMatchObject({ attemptDone: true, walkthroughOpen: true, view: 'walkthrough' });
  });

  it('opens the walkthrough on demand without marking an attempt', () => {
    S.useProblems.getState().openWalkthrough('p');
    expect(S.useProblems.getState().workspaces.p).toMatchObject({ attemptDone: false, walkthroughOpen: true, view: 'walkthrough' });
  });

  it('starts over but keeps the walkthrough open and the scores', () => {
    const s = () => S.useProblems.getState();
    s().updateWorkspace('p', { notes: 'cache everything' });
    s().openWalkthrough('p');
    s().saveAssessment('p', { score: 60, checked: ['a'] });
    s().resetWorkspace('p');
    expect(s().workspaces.p).toMatchObject({ notes: '', walkthroughOpen: true, view: 'try', hintsShown: 0 });
    expect(s().assessments.p).toHaveLength(1);
  });

  it('saves self-assessments in order', () => {
    const s = () => S.useProblems.getState();
    s().saveAssessment('p', { score: 40, checked: [] });
    s().saveAssessment('p', { score: 75, checked: ['x'] });
    expect(s().assessments.p!.map((a) => [a.score, a.source])).toEqual([
      [40, 'practice'],
      [75, 'practice'],
    ]);
  });
});

describe('mock interviews', () => {
  it('runs a session from start to history', () => {
    const s = () => S.useProblems.getState();
    const id = s().startMock('chat-app', 60, [4, 0, 2], 1_000);
    expect(s().activeMocks['chat-app']).toMatchObject({ id, length: 60, stage: 'interview', followUps: [4, 0, 2], timer: { runningSince: 1_000 } });

    s().updateMock('chat-app', { notes: 'WebSockets', design: { nodes: [{ id: 'n1', type: 'client', label: 'Phone', x: 0, y: 0 }], edges: [] } });
    s().pauseMock('chat-app', 11_000);
    expect(s().activeMocks['chat-app']!.timer).toEqual({ elapsedMs: 10_000, runningSince: null });
    s().resumeMock('chat-app', 20_000);
    s().endMock('chat-app', 25_000);
    expect(s().activeMocks['chat-app']).toMatchObject({ stage: 'score', usedMs: 15_000 });

    s().backToInterview('chat-app');
    expect(s().activeMocks['chat-app']!.stage).toBe('interview');

    const sid = s().finishMock('chat-app', { score: 72, checked: ['Asked about scale'] });
    expect(sid).toBe(id);
    expect(s().activeMocks['chat-app']).toBeUndefined();
    expect(s().sessions).toHaveLength(1);
    expect(s().sessions[0]).toMatchObject({ id, score: 72, usedMs: 15_000, notes: 'WebSockets' });
    expect(s().assessments['chat-app']).toEqual([expect.objectContaining({ score: 72, source: 'mock', sessionId: id })]);
    expect(s().workspaces['chat-app']!.walkthroughOpen).toBe(true);
  });

  it('discards a session without saving anything', () => {
    const s = () => S.useProblems.getState();
    s().startMock('p', 45, [], 0);
    s().discardMock('p');
    expect(s().activeMocks).toEqual({});
    expect(s().sessions).toEqual([]);
    expect(s().finishMock('p', { score: 1, checked: [] })).toBeNull();
  });
});

describe('sanitizeProblemsData', () => {
  it('keeps good data and repairs or drops the rest', () => {
    const raw = {
      workspaces: {
        ok: { notes: 'n', design: { nodes: [], edges: [] }, hintsShown: 9, timer: { elapsedMs: 5, runningSince: 'soon' }, attemptDone: true, view: 'walkthrough' },
        bad: 'nope',
      },
      assessments: { ok: [{ at: 'x', score: 140, checked: ['a', 3], source: 'mock' }, 'junk'], empty: [] },
      sessions: [
        { id: 's1', problemId: 'ok', length: 60, score: 50, followUps: [1, -1, 'x'], stage: 'score' },
        { id: 's2', problemId: 'ok' },
        { problemId: 'no-id', score: 3 },
      ],
      activeMocks: { ok: { id: 'm1', problemId: 'ok', length: 45 }, other: { id: 'm2', problemId: 'mismatch' } },
    };
    const d = S.sanitizeProblemsData(raw);
    expect(d.workspaces.ok).toMatchObject({ hintsShown: 3, timer: { elapsedMs: 5, runningSince: null }, attemptDone: true, walkthroughOpen: false, view: 'walkthrough' });
    expect(d.workspaces.bad).toBeUndefined();
    expect(d.assessments).toEqual({ ok: [{ at: 'x', score: 100, checked: ['a'], source: 'mock', sessionId: undefined }] });
    expect(d.sessions.map((s) => [s.id, s.length, s.followUps])).toEqual([['s1', 60, [1]]]);
    expect(Object.keys(d.activeMocks)).toEqual(['ok']);
    expect(S.sanitizeProblemsData(null)).toEqual(S.EMPTY_PROBLEMS_DATA);
  });

  it('round-trips through replaceAll and the snapshot', () => {
    const s = () => S.useProblems.getState();
    s().saveAssessment('p', { score: 90, checked: ['a'] });
    s().updateWorkspace('p', { notes: 'hello' });
    const snap = S.problemsSnapshot();
    s().reset();
    expect(s().assessments).toEqual({});
    s().replaceAll(JSON.parse(JSON.stringify(snap)));
    expect(S.problemsSnapshot()).toEqual(snap);
  });
});
