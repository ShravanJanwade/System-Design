import type { CheatSheet } from '../types';

const sheet: CheatSheet = {
  id: 'tradeoff-phrases',
  title: 'Trade-off phrases',
  summary: 'The four-part sentence for every big decision, phrases to swap, and what to say when the interviewer pushes back.',
  lessons: ['talking-tradeoffs', 'tradeoffs-core-skill'],
  sections: [
    {
      title: 'The four-part sentence',
      blocks: [
        {
          kind: 'annotated',
          lines: [
            { code: 'We could do A or B.', note: 'Your pick is a choice, not a habit.' },
            { code: 'A gives us X but costs Y.', note: 'You named the price before anyone asked.' },
            { code: 'Because of requirement Z, I’d pick A,', note: 'The deciding requirement turns taste into judgment.' },
            { code: 'and here’s what would change my mind.', note: 'The [[tipping point|tipping-point]], where the answer flips.' },
          ],
        },
      ],
    },
    {
      title: 'Phrases to swap',
      blocks: [
        {
          kind: 'table',
          columns: ['Instead of', 'Try'],
          rows: [
            ['“X is the best.”', '“X fits here, because…”'],
            ['“Everyone uses Kafka.”', '“A durable log helps here, because several services replay each upload.”'],
            ['“Let’s use both.”', '“A for most accounts, B for the few with millions of followers.”'],
            ['“Because it’s faster.”', '“Because the feed must open in under a second.”'],
            ['“It depends.”', '“It depends on X. For the numbers we agreed, A; past Y, B.”'],
          ],
          caption: 'Nothing is best everywhere, popularity is not a requirement, and a hybrid needs its line.',
        },
      ],
    },
    {
      title: 'Said out loud',
      blocks: [
        {
          kind: 'callout',
          tone: 'interview',
          md: '“We could copy posts into followers’ feeds when they’re posted, or build feeds when the app opens. Copying gives one-read feeds but costs a burst of writes for big accounts. Because feeds are read far more than people post, I’d copy, and pull posts at read time for accounts with millions of followers.”',
        },
      ],
    },
    {
      title: 'When the interviewer pushes back',
      blocks: [
        {
          kind: 'annotated',
          lines: [
            { code: '“My deciding requirement was that counts may lag a few seconds;', note: 'Go back to the requirement that decided.' },
            { code: 'if they must be exact, the cache is out,', note: 'Rerun the sentence and say plainly that the pick changes.' },
            { code: 'and I’d write every like to the database, which costs more writes.”', note: 'Name the new cost.' },
          ],
        },
      ],
    },
    {
      title: 'Long form, short form',
      blocks: [
        {
          kind: 'numbers',
          items: [
            { label: 'Full sentence, for the two or three decisions that shape the design', value: '20 to 30 s' },
            { label: 'Short form: “Round robin is fine here, because the app servers are stateless.”', value: 'a few s' },
          ],
        },
        {
          kind: 'callout',
          tone: 'mistake',
          md: 'A choice with no reason, pros and cons with no decision, or defending your first answer after a requirement changes.',
        },
      ],
    },
  ],
};

export default sheet;
