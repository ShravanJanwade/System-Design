import type { CheatSheet } from '../types';

const sheet: CheatSheet = {
  id: 'interview-framework',
  title: 'The interview framework',
  summary: 'Six steps and a time budget that turn 45 minutes into a complete, explained design.',
  lessons: ['interview-framework', 'estimation-in-the-room'],
  sections: [
    {
      title: 'Six steps in 45 minutes',
      blocks: [
        {
          kind: 'table',
          columns: ['Step', 'Time', 'Leaves on the board'],
          rows: [
            // Non-breaking spaces keep each time on one line.
            ['Requirements', '≈ 5 min', 'Three or four core features, scale as numbers, and what is out of scope.'],
            ['Estimation', '≈ 3–5 min', 'Two or three rounded numbers, each tied to a decision.'],
            ['API and data model', '≈ 5 min', 'Calls to your application programming interface (API), and the main records.'],
            ['High-level design', '≈ 10 min', 'The simplest complete design, with one request walked through.'],
            ['Deep dives', '≈ 15 min', 'Two or three hard parts: options, a choice, the reason.'],
            ['Wrap-up', '≈ 5 min', '[[Bottlenecks|bottleneck]], failures, trade-offs, ten times the load.'],
          ],
          caption: 'A default, not a law. Keep the order: each step feeds the next.',
        },
      ],
    },
    {
      title: 'Clock checkpoints',
      blocks: [
        {
          kind: 'numbers',
          items: [
            { label: 'Requirements agreed', value: 'minute 5' },
            { label: 'Numbers that matter estimated', value: 'minute 10' },
            { label: 'Calls and data model on the board', value: 'minute 15' },
            { label: 'A simple, complete design', value: 'minute 25' },
            { label: 'Deep dives done, wrap-up starts', value: 'minute 40' },
          ],
          caption: 'Behind? Close the step with what you have, and say so.',
        },
      ],
    },
    {
      title: 'Signposts',
      blocks: [
        {
          kind: 'table',
          columns: ['When', 'Say'],
          rows: [
            ['Minute one', '“About five minutes on requirements, a few on numbers, then the API, a simple design, and most of our time on the hardest parts. Does that work?”'],
            ['Before deep dives', '“I have a simple design and see two hard parts. Shall I start with the feed?”'],
            ['Five minutes left', '“Let me wrap up: the main bottleneck, what happens when the cache fails, and what changes at ten times the traffic.”'],
          ],
        },
      ],
    },
    {
      title: 'When the plan bends',
      blocks: [
        {
          kind: 'table',
          columns: ['If', 'Then'],
          rows: [
            ['You fall behind', 'Shrink steps, never skip them. Never skip the high-level design.'],
            ['The interviewer steers', 'Answer fully, then say where you were and carry on.'],
            ['It runs 60 minutes', 'Spend the extra 15 on the design and the deep dives.'],
          ],
        },
        {
          kind: 'callout',
          tone: 'mistake',
          md: 'Twenty minutes of questions with an empty board, or reaching minute 35 without a complete design.',
        },
      ],
    },
  ],
};

export default sheet;
