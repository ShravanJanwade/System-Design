/**
 * The ten cheat sheets (blueprint section 11): ids, titles and summaries for the Reference page,
 * which lists them without loading any sheet. The content check keeps each sheet file in step with this list.
 */

export type CheatSheetGroup = 'numbers' | 'choices' | 'room';

export type CheatSheetInfo = {
  id: string;
  title: string;
  /** One sentence, shown on the Reference page and under the sheet's title. */
  summary: string;
  group: CheatSheetGroup;
  /** Ballpark numbers, labeled "Rough numbers" wherever the sheet appears. */
  rough?: boolean;
};

export const cheatSheetGroups: { id: CheatSheetGroup; title: string }[] = [
  { id: 'numbers', title: 'Numbers to know' },
  { id: 'choices', title: 'Choosing a design' },
  { id: 'room', title: 'In the room' },
];

export const cheatSheetList: CheatSheetInfo[] = [
  {
    id: 'latency-numbers',
    title: 'Latency numbers',
    summary: 'What memory, disks and network round trips cost, from a nanosecond to an ocean crossing, and the habits that follow.',
    group: 'numbers',
  },
  {
    id: 'powers-of-two',
    title: 'Powers of two and unit conversions',
    summary: 'Powers of two, byte prefixes, time units and bits against bytes, rounded the way estimates use them.',
    group: 'numbers',
  },
  {
    id: 'estimation-formulas',
    title: 'Estimation formulas',
    summary: 'The few multiplications behind traffic, storage, bandwidth, cache size and requests in flight, each with a worked example.',
    group: 'numbers',
  },
  {
    id: 'capacity-ballparks',
    title: 'Capacity ballparks',
    summary: 'Rough sizes for one server, one database, a network link and a busy app, for sanity checks rather than purchase orders.',
    group: 'numbers',
    rough: true,
  },
  {
    id: 'which-database',
    title: 'Which database?',
    summary: 'Match each kind of data to a store by how it is read, written and related, starting from the relational default.',
    group: 'choices',
  },
  {
    id: 'caching-strategies',
    title: 'Caching strategies',
    summary: 'Five ways to wire a cache, three eviction policies, and the fixes for stampedes, cold starts and stale reads.',
    group: 'choices',
  },
  {
    id: 'consistency-models',
    title: 'Consistency models',
    summary: 'Four promises about what a read may return, what each one costs, and which features need which.',
    group: 'choices',
  },
  {
    id: 'rate-limiting',
    title: 'Rate-limiting algorithms',
    summary: 'Token bucket, leaky bucket, fixed and sliding windows, where to enforce them, and how to reject well.',
    group: 'choices',
  },
  {
    id: 'interview-framework',
    title: 'The interview framework',
    summary: 'Six steps and a time budget that turn 45 minutes into a complete, explained design.',
    group: 'room',
  },
  {
    id: 'tradeoff-phrases',
    title: 'Trade-off phrases',
    summary: 'The four-part sentence for every big decision, phrases to swap, and what to say when the interviewer pushes back.',
    group: 'room',
  },
];

const byId = new Map(cheatSheetList.map((s) => [s.id, s]));

export function getCheatSheetInfo(id: string): CheatSheetInfo | undefined {
  return byId.get(id);
}

export function cheatSheetPath(id: string): string {
  return `/reference/cheatsheets/${id}`;
}
