import type { RawTerm } from '../types';

/** New glossary terms from lesson group Y (lessons 8.7 to 8.9). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  // 8.7 Talking about trade-offs
  {
    id: 'tipping-point',
    term: 'Tipping point',
    definition: 'The condition under which a design decision flips to another option, such as a number crossing a line or a requirement changing.',
    example: 'Snapgram copies posts into followers’ feeds, except for accounts with millions of followers: that is the tipping point.',
  },
  {
    id: 'design-doc',
    term: 'Design doc',
    aka: ['design document'],
    definition: 'A document, usually written before building, that explains a system’s goals, the chosen design, the alternatives considered and their trade-offs.',
    example: 'Snapgram’s feed design doc explains why posts are copied to followers, and when celebrities’ posts are pulled instead.',
  },
  {
    id: 'steelman',
    term: 'Steelman',
    definition: 'To state the strongest, fairest version of an option or argument before you disagree with it.',
    example: 'Before choosing to copy posts, Maya says that building feeds on read is simpler and wastes nothing on inactive users.',
  },
  // 8.8 What each level is expected to show
  {
    id: 'engineering-level',
    term: 'Engineering level',
    aka: ['level', 'career level'],
    definition: 'A rung on a company’s career ladder for engineers, such as entry, mid, senior or staff, each with its own expectations and pay.',
    example: 'Maya is interviewing for a mid-level role at Snapgram.',
  },
  {
    id: 'interview-loop',
    term: 'Interview loop',
    aka: ['loop', 'onsite'],
    definition: 'The full set of interviews for one job, often coding, system design and behavioral rounds, used to decide whether to hire and at which level.',
    example: 'Maya’s loop at Snapgram has two coding rounds, one design round and one behavioral round.',
  },
  {
    id: 'rubric',
    term: 'Rubric',
    aka: ['scoring rubric'],
    definition: 'A written guide listing what interviewers look for and what a strong answer shows at each level.',
    example: 'Snapgram’s design rubric asks mid-level candidates to name a trade-off for every major choice.',
  },
  {
    id: 'interview-signal',
    term: 'Interview signal',
    aka: ['signal'],
    definition: 'Evidence of a skill that an interviewer notices and writes down, such as asking about scale or naming a cost unprompted.',
    example: 'Maya leading the feed deep dive without being asked was a strong signal.',
  },
  {
    id: 'individual-contributor',
    term: 'Individual contributor',
    aka: ['IC'],
    definition: 'An engineer whose job is building systems rather than managing people; individual contributors can grow to senior, staff and beyond.',
    example: 'Maya plans to stay an individual contributor rather than become a manager.',
  },
  {
    id: 'staff-engineer',
    term: 'Staff engineer',
    definition: 'A senior individual contributor whose work spans several teams, setting technical direction without managing people.',
    example: 'A Snapgram staff engineer plans how every team’s services will move into the new Frankfurt region.',
  },
  {
    id: 'down-leveling',
    term: 'Down-leveling',
    aka: ['down-level'],
    definition: 'Being offered a lower level than the one you interviewed for, because your interviews showed that lower level’s signals.',
    example: 'A senior candidate who waits to be led through the design may get a mid-level offer instead.',
  },
  // 8.9 Mistakes that sink candidates
  {
    id: 'buzzword',
    term: 'Buzzword',
    definition: 'A fashionable technical term used to impress rather than to explain. A technology named without a reason is a buzzword.',
    example: '“Kafka, because it scales” is a buzzword; “a queue, because uploads spike when celebrities post” is a reason.',
  },
  // over-engineering (group X) and timebox (group W) are linked, not redefined.
];
