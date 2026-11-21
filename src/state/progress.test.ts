import { describe, expect, it } from 'vitest';
import { newCard, review } from './leitner';
import { buildExport, lessonStatus, parseImport, studyStreak, type ProgressData } from './progress';

const today = '2026-11-17';

describe('lessonStatus', () => {
  it('is not started until opened', () => {
    expect(lessonStatus(undefined, [], 6)).toBe('not-started');
  });

  it('is in progress when read but the quiz is not attempted', () => {
    expect(lessonStatus({ opened: true, read: true }, [], 6)).toBe('in-progress');
  });

  it('is in progress when the quiz is attempted but the lesson is not read', () => {
    expect(lessonStatus({ opened: true, read: false, quiz: { attempts: 1, best: 1, last: 1, total: 5 } }, [], 6)).toBe(
      'in-progress',
    );
  });

  it('is done when read and the quiz attempted', () => {
    expect(lessonStatus({ opened: true, read: true, quiz: { attempts: 1, best: 0.4, last: 0.4, total: 5 } }, [], 6)).toBe('done');
  });

  it('is mastered with 80% and every card at a week or more', () => {
    const rec = { opened: true, read: true, quiz: { attempts: 2, best: 0.8, last: 0.8, total: 5 } };
    const strong = Array.from({ length: 2 }, (_, i) => review(review(newCard('x', i, today), true, today), true, today));
    expect(lessonStatus(rec, strong, 2)).toBe('mastered');
    const weak = [strong[0]!, review(newCard('x', 1, today), true, today)];
    expect(lessonStatus(rec, weak, 2)).toBe('done');
    expect(lessonStatus({ ...rec, quiz: { ...rec.quiz, best: 0.6 } }, strong, 2)).toBe('done');
  });
});

describe('export and import', () => {
  const data: ProgressData = {
    lessons: { caching: { opened: true, read: true } },
    deck: { 'caching#0': newCard('caching', 0, today) },
    lastLessonId: 'caching',
    challenges: { cache: ['shrink'] },
    activeDays: ['2026-11-17'],
  };

  it('round-trips through JSON', () => {
    const text = JSON.stringify(buildExport(data, { theme: 'dark' }));
    const parsed = parseImport(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.file.progress).toEqual(data);
      expect(parsed.file.settings).toEqual({ theme: 'dark' });
    }
  });

  it('rejects files that are not Blueprint exports, saying why', () => {
    const notJson = parseImport('{oops');
    expect(notJson.ok).toBe(false);
    const wrong = parseImport(JSON.stringify({ hello: 'world' }));
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error).toMatch(/not exported from Blueprint/);
  });
});

describe('studyStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(studyStreak(['2026-11-15', '2026-11-16', '2026-11-17'], '2026-11-17')).toBe(3);
  });

  it('keeps yesterday’s streak alive until today ends', () => {
    expect(studyStreak(['2026-11-15', '2026-11-16'], '2026-11-17')).toBe(2);
  });

  it('breaks on a missed day', () => {
    expect(studyStreak(['2026-11-13', '2026-11-15', '2026-11-16'], '2026-11-17')).toBe(2);
    expect(studyStreak(['2026-11-10'], '2026-11-17')).toBe(0);
  });
});
