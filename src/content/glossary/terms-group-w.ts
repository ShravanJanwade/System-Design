import type { RawTerm } from '../types';

/** New glossary terms from lesson group W (lessons 8.1 to 8.3). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  {
    id: 'timebox',
    term: 'Timebox',
    aka: ['time budget'],
    definition: 'A fixed amount of time set aside for one task. When it runs out, you wrap up what you have and move on.',
    example: 'Maya timeboxes requirements to five minutes, then reads her list back and starts the estimate.',
  },
  {
    id: 'signposting',
    term: 'Signposting',
    aka: ['signpost'],
    definition: 'Saying out loud where you are in the interview and what comes next, so the interviewer can follow your plan and steer it.',
    example: '“I have a working design, so I’d like to spend the next 15 minutes on the feed.”',
  },
  {
    id: 'clarifying-question',
    term: 'Clarifying question',
    definition: 'A question asked before designing, to pin down the features, scale or constraints that the prompt left vague.',
    example: 'Asking how many daily users to plan for turns “a photo-sharing app” into something Maya can size.',
  },
  {
    id: 'out-of-scope',
    term: 'Out of scope',
    aka: ['scoping out'],
    definition: 'Features you and the interviewer agree to leave out of the design, written down so the work fits the time.',
    example: 'Maya writes “direct messages, video” under out of scope in a corner of the board.',
  },
  {
    id: 'false-precision',
    term: 'False precision',
    definition: 'Stating a number with more digits than its inputs justify, which suggests accuracy that is not there and wastes time.',
    example: '1,051,920 GB a year from guessed inputs, where “about a petabyte” says the same thing.',
  },
  {
    id: 'sanity-check',
    term: 'Sanity check',
    definition: 'A quick test of whether a result is plausible, such as comparing it with a number you know, before you rely on it.',
    example: 'If a cache estimate says one server needs 20 TB of memory, an input or the design is wrong.',
  },
];
