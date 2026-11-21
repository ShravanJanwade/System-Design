import { describe, expect, it } from 'vitest';
import {
  BUDGET_MINUTES,
  ESSENTIALS,
  PROMPTS,
  QUESTION_SECONDS,
  formatMinutes,
  getPrompt,
  joinList,
  normalizePromptId,
  summarize,
  togglePick,
} from './logic';

const photo = getPrompt('photo-sharing');
const ids = (value: 'essential' | 'useful' | 'low', prompt = photo) => prompt.questions.filter((q) => q.value === value).map((q) => q.id);

describe('content', () => {
  it('asks each of the five essential questions exactly once in every prompt', () => {
    for (const p of PROMPTS) {
      const essentials = p.questions.filter((q) => q.value === 'essential').map((q) => q.essential);
      expect([...essentials].sort()).toEqual(ESSENTIALS.map((e) => e.id).sort());
    }
  });

  it('tags essential questions, and only those, with the essential they cover', () => {
    for (const p of PROMPTS) {
      for (const q of p.questions) expect(q.essential !== undefined).toBe(q.value === 'essential');
    }
  });

  it('gives low-value questions no worksheet lines and every other question at least one', () => {
    for (const p of PROMPTS) {
      for (const q of p.questions) {
        if (q.value === 'low') expect(q.notes).toHaveLength(0);
        else expect(q.notes.length).toBeGreaterThan(0);
      }
    }
  });

  it('writes the essential answers into the non-functional column', () => {
    for (const p of PROMPTS) {
      for (const q of p.questions.filter((x) => x.value === 'essential')) {
        expect(q.notes.some((n) => n.column === 'nonFunctional')).toBe(true);
      }
    }
  });

  it('has unique question ids, complete text, and some low-value and scoping questions to find', () => {
    for (const p of PROMPTS) {
      expect(new Set(p.questions.map((q) => q.id)).size).toBe(p.questions.length);
      for (const q of p.questions) for (const text of [q.ask, q.answer, q.impact]) expect(text.trim().length).toBeGreaterThan(0);
      expect(ids('low', p).length).toBeGreaterThanOrEqual(2);
      expect(p.questions.some((q) => q.notes.some((n) => n.column === 'outOfScope'))).toBe(true);
    }
  });

  it('takes more than the budget to ask everything, so choosing matters', () => {
    for (const p of PROMPTS) expect((p.questions.length * QUESTION_SECONDS) / 60).toBeGreaterThan(BUDGET_MINUTES);
  });
});

describe('picking', () => {
  it('adds questions in the order asked and removes them again', () => {
    let picked = togglePick([], 'scale');
    picked = togglePick(picked, 'latency');
    picked = togglePick(picked, 'features');
    expect(picked).toEqual(['scale', 'latency', 'features']);
    expect(togglePick(picked, 'latency')).toEqual(['scale', 'features']);
  });

  it('falls back to the photo-sharing prompt for unknown props', () => {
    expect(normalizePromptId('url-shortener')).toBe('url-shortener');
    expect(normalizePromptId(undefined)).toBe('photo-sharing');
    expect(normalizePromptId('chat')).toBe('photo-sharing');
    expect(getPrompt('url-shortener').prompt).toMatch(/short/);
  });
});

describe('summary', () => {
  it('starts with all five essentials skipped and no time used', () => {
    const s = summarize(photo, []);
    expect(s.skipped.map((e) => e.id)).toEqual(ESSENTIALS.map((e) => e.id));
    expect(s.covered).toEqual([]);
    expect(s.minutes).toBe(0);
    expect(s.overBudget).toBe(false);
    expect(s.verdict).toMatch(/Pick the questions/);
  });

  it('praises the five essentials alone, inside the budget', () => {
    const s = summarize(photo, ids('essential'));
    expect(s.skipped).toEqual([]);
    expect(s.lowValue).toEqual([]);
    expect(s.minutes).toBe(2.5);
    expect(s.overBudget).toBe(false);
    expect(s.verdict).toMatch(/All five essential questions/);
  });

  it('names each skipped essential question in the verdict', () => {
    const s = summarize(photo, ['scale', 'read-write', 'consistency']);
    expect(s.skipped.map((e) => e.id)).toEqual(['latency', 'geography']);
    expect(s.verdict).toContain('You skipped latency and geography');
    const one = summarize(photo, ['scale', 'read-write', 'consistency', 'latency']);
    expect(one.verdict).toContain('You skipped geography, one of the five questions');
  });

  it('flags low-value questions even when every essential was asked', () => {
    const s = summarize(photo, [...ids('essential'), 'language', 'cloud']);
    expect(s.lowValue.map((q) => q.id)).toEqual(['language', 'cloud']);
    expect(s.verdict).toContain('You asked all five essential questions.');
    expect(s.verdict).toContain('2 questions were low value');
  });

  it('flags going past the five-minute budget at about 30 seconds a question', () => {
    const all = photo.questions.map((q) => q.id);
    const s = summarize(photo, all);
    expect(s.minutes).toBe(6);
    expect(s.overBudget).toBe(true);
    expect(s.verdict).toContain('about 6 minutes, past the 5-minute budget');
    expect(summarize(photo, all.slice(0, 10)).overBudget).toBe(false);
  });

  it('fills the worksheet columns in the order questions were asked', () => {
    const s = summarize(photo, ['video', 'messages', 'scale', 'language']);
    expect(s.worksheet.functional).toEqual(['Photos only, a few megabytes each']);
    expect(s.worksheet.outOfScope).toEqual(['Video', 'Direct messages']);
    expect(s.worksheet.nonFunctional).toEqual(['About 10 million daily users, doubling in a year']);
  });

  it('ignores ids that belong to no question', () => {
    const s = summarize(photo, ['scale', 'nope']);
    expect(s.asked.map((q) => q.id)).toEqual(['scale']);
    expect(s.minutes).toBe(0.5);
  });
});

describe('formatting', () => {
  it('joins lists and formats minutes for the readout', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['a'])).toBe('a');
    expect(joinList(['a', 'b'])).toBe('a and b');
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c');
    expect(formatMinutes(6)).toBe('6');
    expect(formatMinutes(5.5)).toBe('5.5');
  });
});
