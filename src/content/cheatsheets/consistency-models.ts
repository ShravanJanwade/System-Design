import type { CheatSheet } from '../types';

const sheet: CheatSheet = {
  id: 'consistency-models',
  title: 'Consistency models',
  summary: 'Four promises about what a read may return, what each one costs, and which features need which.',
  lessons: ['consistency-models', 'replication-lag', 'cap-pacelc'],
  sections: [
    {
      title: 'Four promises, strongest first',
      blocks: [
        {
          kind: 'table',
          columns: ['Model', 'A read returns', 'The price'],
          rows: [
            [
              '[[Strong|strong-consistency]], or [[linearizable|linearizability]]',
              'The latest completed write, everywhere.',
              'Waits on the leader or a majority, often in another region. The cut-off side stops in a partition.',
            ],
            ['[[Causal|causal-consistency]]', 'Causes before effects, and your own writes.', 'Metadata to track dependencies.'],
            ['[[Read-your-writes|read-your-writes]]', 'Your own changes at once; others may lag.', 'Protects only the writer.'],
            ['[[Eventual|eventual-consistency]]', 'Maybe an old value. Copies agree once writes stop.', 'Readers disagree; values can go backwards.'],
          ],
        },
      ],
    },
    {
      title: 'How systems provide it',
      blocks: [
        {
          kind: 'table',
          columns: ['Model', 'Usual mechanism'],
          rows: [
            ['Strong', 'Go through the [[leader|leader]] or a [[quorum|quorum]]: about 170 ms across the Pacific (ballpark).'],
            ['Causal', 'Writes carry their dependencies, such as a [[version vector|version-vector]]; copies wait for them.'],
            ['Read-your-writes', 'Read from the leader for a minute after your change, or from caught-up [[followers|follower]].'],
            ['Eventual', 'Read the nearest copy; [[replication|replication]] catches up.'],
          ],
        },
      ],
    },
    {
      title: 'Which feature needs which',
      blocks: [
        {
          kind: 'table',
          columns: ['Feature', 'Model', 'Why'],
          rows: [
            ['Money, credits, stock', 'Strong', 'Two purchases must see each other.'],
            ['Usernames, locks', 'Strong', 'Two people never get one name.'],
            ['Comments, replies, chat', 'Causal', 'No answer without its question.'],
            ['Your posts, profile, settings', 'Read-your-writes', 'You see your change at once.'],
            ['Likes, views, feeds', 'Eventual', 'Seconds behind harms nobody.'],
          ],
        },
      ],
    },
    {
      title: 'Rules of thumb',
      blocks: [
        {
          kind: 'callout',
          tone: 'intuition',
          md: 'Give each feature the weakest model that keeps it correct. Every step up costs latency and, during a [[network partition|network-partition]], availability.',
        },
        {
          kind: 'callout',
          tone: 'interview',
          md: 'Name the model per feature, with the reason: “Balances are strong because two purchases must see each other; like counts are eventual.”',
        },
      ],
    },
  ],
};

export default sheet;
