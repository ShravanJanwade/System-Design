/**
 * Spaced repetition with a Leitner box system.
 * A card climbs one box each time you recall it and drops to box 1 when you miss it.
 * Higher boxes come back less often.
 */
import { addDays, type DayString } from '@/lib/dates';

/** Days until the next review, by box (index 0 is unused). */
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const;
export const MAX_BOX = 5;
/** A card counts toward mastery once its interval is a week or more. */
export const MASTERY_BOX = 3;

export type CardState = {
  id: string;
  lessonId: string;
  box: number;
  due: DayString;
  added: DayString;
  lastReviewed?: DayString;
  reviews: number;
  lapses: number;
};

export function cardId(lessonId: string, index: number): string {
  return `${lessonId}#${index}`;
}

export function newCard(lessonId: string, index: number, today: DayString): CardState {
  return { id: cardId(lessonId, index), lessonId, box: 1, due: today, added: today, reviews: 0, lapses: 0 };
}

export function intervalDays(box: number): number {
  return BOX_INTERVAL_DAYS[Math.max(1, Math.min(MAX_BOX, box))]!;
}

export function isDue(card: CardState, today: DayString): boolean {
  return card.due <= today;
}

/** Apply one review. Recalled: up a box. Missed: back to box 1, due tomorrow. */
export function review(card: CardState, recalled: boolean, today: DayString): CardState {
  const box = recalled ? Math.min(MAX_BOX, card.box + 1) : 1;
  return {
    ...card,
    box,
    due: addDays(today, recalled ? intervalDays(box) : 1),
    lastReviewed: today,
    reviews: card.reviews + 1,
    lapses: card.lapses + (recalled ? 0 : 1),
  };
}

export function dueCards(deck: Record<string, CardState>, today: DayString): CardState[] {
  return Object.values(deck)
    .filter((c) => isDue(c, today))
    .sort((a, b) => (a.due === b.due ? a.box - b.box : a.due < b.due ? -1 : 1));
}

export function isCardMastered(card: CardState): boolean {
  return intervalDays(card.box) >= 7;
}
