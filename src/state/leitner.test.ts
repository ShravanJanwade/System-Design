import { describe, expect, it } from 'vitest';
import { dueCards, intervalDays, isCardMastered, isDue, newCard, review } from './leitner';

const today = '2026-11-17';

describe('Leitner scheduler', () => {
  it('new cards start in box 1 and are due today', () => {
    const c = newCard('caching', 0, today);
    expect(c.box).toBe(1);
    expect(isDue(c, today)).toBe(true);
    expect(c.id).toBe('caching#0');
  });

  it('recalling a card moves it up a box and schedules it further out', () => {
    let c = newCard('caching', 0, today);
    c = review(c, true, today);
    expect(c.box).toBe(2);
    expect(c.due).toBe('2026-11-20');
    expect(isDue(c, today)).toBe(false);
    c = review(c, true, '2026-11-20');
    expect(c.box).toBe(3);
    expect(c.due).toBe('2026-11-27');
  });

  it('missing a card sends it back to box 1, due tomorrow', () => {
    let c = newCard('caching', 0, today);
    c = review(review(review(c, true, today), true, today), false, today);
    expect(c.box).toBe(1);
    expect(c.due).toBe('2026-11-18');
    expect(c.lapses).toBe(1);
    expect(c.reviews).toBe(3);
  });

  it('caps at the top box', () => {
    let c = newCard('caching', 0, today);
    for (let i = 0; i < 10; i++) c = review(c, true, today);
    expect(c.box).toBe(5);
    expect(intervalDays(c.box)).toBe(30);
  });

  it('a card is mastered once its interval reaches a week', () => {
    let c = newCard('caching', 0, today);
    expect(isCardMastered(c)).toBe(false);
    c = review(c, true, today);
    expect(isCardMastered(c)).toBe(false);
    c = review(c, true, today);
    expect(isCardMastered(c)).toBe(true);
  });

  it('lists due cards, oldest due first', () => {
    const a = { ...newCard('a', 0, today), due: '2026-11-15' };
    const b = { ...newCard('b', 0, today), due: '2026-11-17' };
    const c = { ...newCard('c', 0, today), due: '2026-11-19' };
    expect(dueCards({ [a.id]: a, [b.id]: b, [c.id]: c }, today).map((x) => x.lessonId)).toEqual(['a', 'b']);
  });

  it('handles month and year boundaries', () => {
    const c = review(newCard('x', 0, '2026-12-30'), true, '2026-12-30');
    expect(c.due).toBe('2027-01-02');
  });
});
