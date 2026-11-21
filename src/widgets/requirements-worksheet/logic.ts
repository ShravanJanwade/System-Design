/**
 * The requirements worksheet (lesson 8.2). An interviewer gives a one-line prompt; the learner
 * picks the questions they would ask. Each picked question reveals the interviewer's answer,
 * how it changes the design, and the line it adds to the worksheet. The review shows which of
 * the five essential questions were skipped, flags low-value questions, and checks the picks
 * against the five-minute budget for requirements. Pure data and functions; the view only draws.
 */

export type Essential = 'scale' | 'read-write' | 'latency' | 'consistency' | 'geography';
export type QuestionValue = 'essential' | 'useful' | 'low';
export type Column = 'functional' | 'nonFunctional' | 'outOfScope';
export type PromptId = 'photo-sharing' | 'url-shortener';

export type WorksheetNote = { column: Column; text: string };

export type WorksheetQuestion = {
  id: string;
  /** What the candidate asks. */
  ask: string;
  /** What the interviewer answers. */
  answer: string;
  /** How the answer changes the design (or, for a low-value question, why it changes nothing). */
  impact: string;
  value: QuestionValue;
  /** Which of the five essential questions this is. Set exactly when `value` is 'essential'. */
  essential?: Essential;
  /** Lines the answer adds to the worksheet. Low-value questions add none. */
  notes: readonly WorksheetNote[];
};

export type WorksheetPrompt = {
  id: PromptId;
  /** Short name for the prompt switcher. */
  label: string;
  /** What the interviewer says. */
  prompt: string;
  questions: readonly WorksheetQuestion[];
};

/** About how long one question and its answer take in the room. */
export const QUESTION_SECONDS = 30;
/** The framework's budget for requirements (lesson 8.1). */
export const BUDGET_MINUTES = 5;

export const ESSENTIALS: readonly { id: Essential; label: string; miss: string }[] = [
  {
    id: 'scale',
    label: 'Scale',
    miss: 'Without a number of users, you cannot size servers, storage or the database, so every later choice is a guess.',
  },
  {
    id: 'read-write',
    label: 'Read/write ratio',
    miss: 'Without the read/write ratio, you do not know whether to build for reads (caches, a content delivery network) or for writes (queues, sharding).',
  },
  {
    id: 'latency',
    label: 'Latency',
    miss: 'Without a latency target, you cannot tell which paths must be precomputed or cached and which can run in the background.',
  },
  {
    id: 'consistency',
    label: 'Consistency',
    miss: 'Without a consistency requirement, you may pay for guarantees nobody needs, or relax one that must never break.',
  },
  {
    id: 'geography',
    label: 'Geography',
    miss: 'Without knowing where users are, you cannot decide on edge caches, extra regions or where data must live.',
  },
];

export const COLUMNS: readonly { id: Column; label: string }[] = [
  { id: 'functional', label: 'Functional' },
  { id: 'nonFunctional', label: 'Non-functional' },
  { id: 'outOfScope', label: 'Out of scope' },
];

export const VALUE_LABEL: Record<QuestionValue, string> = {
  essential: 'Essential',
  useful: 'Useful',
  low: 'Low value',
};

export const PROMPTS: readonly WorksheetPrompt[] = [
  {
    id: 'photo-sharing',
    label: 'Photo-sharing app',
    prompt: 'Design a photo-sharing app.',
    questions: [
      {
        id: 'features',
        ask: 'Which features matter most: uploading, following people, a feed, comments?',
        answer: 'Uploading photos, following people and a home feed of their photos. Likes and comments are nice to have.',
        impact: 'This fixes the core of the API and the data model: users, photos and follows. Everything else can wait.',
        value: 'useful',
        notes: [{ column: 'functional', text: 'Upload photos, follow people, see a home feed' }],
      },
      {
        id: 'scale',
        ask: 'How many people use it each day, and how fast is that growing?',
        answer: 'Plan for about 10 million daily users, and assume it could double within a year.',
        impact: 'Thousands of requests a second: several stateless app servers behind a load balancer rather than one machine, with room to grow.',
        value: 'essential',
        essential: 'scale',
        notes: [{ column: 'nonFunctional', text: 'About 10 million daily users, doubling in a year' }],
      },
      {
        id: 'language',
        ask: 'Which programming language should the servers use?',
        answer: 'Whatever you are comfortable with.',
        impact: 'Nothing changes. The design is the same in any mainstream language, so this question spends time without telling you anything.',
        value: 'low',
        notes: [],
      },
      {
        id: 'read-write',
        ask: 'How often do people view photos compared with posting them?',
        answer: 'People scroll far more than they post. Say about 100 views for every upload.',
        impact: 'A read-heavy system. Caches and a content delivery network go on the read path, and the upload path can stay simple.',
        value: 'essential',
        essential: 'read-write',
        notes: [{ column: 'nonFunctional', text: 'About 100 views per upload: read-heavy' }],
      },
      {
        id: 'messages',
        ask: 'Should I include direct messages between users?',
        answer: 'No, leave messaging out for today.',
        impact: 'A whole real-time chat system leaves the design. Saying it out loud and writing it down keeps the scope honest.',
        value: 'useful',
        notes: [{ column: 'outOfScope', text: 'Direct messages' }],
      },
      {
        id: 'latency',
        ask: 'How fast should the feed load, and can uploads take longer?',
        answer: 'The feed should appear in well under a second. An upload can take a few seconds to finish processing.',
        impact: 'Feeds must be built ahead of time or cached, while slow work such as making thumbnails can move to a background queue.',
        value: 'essential',
        essential: 'latency',
        notes: [{ column: 'nonFunctional', text: 'Feed in well under a second; uploads may take a few seconds' }],
      },
      {
        id: 'cloud',
        ask: 'Are we running on a particular cloud provider?',
        answer: 'Assume any major cloud.',
        impact: 'Every major cloud offers the same building blocks: servers, databases, object storage and queues. The answer does not change a single box.',
        value: 'low',
        notes: [],
      },
      {
        id: 'consistency',
        ask: 'When someone posts, must their followers see it instantly?',
        answer: 'A few seconds of delay is fine for followers. The person who posted should see it on their own profile right away.',
        impact: 'Feeds can be eventually consistent, so new posts can be copied to followers in the background. The poster’s own view needs read-your-writes.',
        value: 'essential',
        essential: 'consistency',
        notes: [{ column: 'nonFunctional', text: 'Followers may see a post seconds late; the poster sees it at once' }],
      },
      {
        id: 'video',
        ask: 'Photos only, or videos too? How big is a photo?',
        answer: 'Photos only, a few megabytes each, straight from the phone.',
        impact: 'Files go to object storage and their details to a database. Leaving video out removes transcoding, a large system of its own.',
        value: 'useful',
        notes: [
          { column: 'functional', text: 'Photos only, a few megabytes each' },
          { column: 'outOfScope', text: 'Video' },
        ],
      },
      {
        id: 'login',
        ask: 'Should I start by designing sign-up and password reset?',
        answer: 'We need logins, but is that where you want to spend the time?',
        impact: 'Logins are standard and rarely the interesting part. Designing them first pushes the feed and photo storage, the hard parts, out of the interview.',
        value: 'low',
        notes: [],
      },
      {
        id: 'geography',
        ask: 'Where are the users?',
        answer: 'All over the world, with large groups in North America and Asia.',
        impact: 'Photos should come from servers near each user, through a content delivery network. A second region may follow later.',
        value: 'essential',
        essential: 'geography',
        notes: [{ column: 'nonFunctional', text: 'Users worldwide, mostly North America and Asia' }],
      },
      {
        id: 'retention',
        ask: 'How long do we keep photos?',
        answer: 'Forever, unless the user deletes them.',
        impact: 'Storage grows every year with no ceiling, so files belong in object storage, and old photos can move to cheaper, colder tiers.',
        value: 'useful',
        notes: [{ column: 'nonFunctional', text: 'Photos kept until the user deletes them' }],
      },
    ],
  },
  {
    id: 'url-shortener',
    label: 'URL shortener',
    prompt: 'Design a service that turns long links into short ones.',
    questions: [
      {
        id: 'features',
        ask: 'What should it do beyond turning a long link into a short one?',
        answer: 'Create short links and redirect people who click them. Custom aliases would be nice.',
        impact: 'Two core calls, create and redirect, and one table that maps short codes to long links. Custom aliases add a uniqueness check.',
        value: 'useful',
        notes: [
          { column: 'functional', text: 'Create a short link; redirect on click' },
          { column: 'functional', text: 'Optional custom alias' },
        ],
      },
      {
        id: 'scale',
        ask: 'How many new links are created each day?',
        answer: 'About a million a day, and links never expire.',
        impact: 'Only about a dozen writes a second, but billions of links over the years, so the short code needs enough characters never to run out.',
        value: 'essential',
        essential: 'scale',
        notes: [{ column: 'nonFunctional', text: 'About 1 million new links a day, kept forever' }],
      },
      {
        id: 'homepage',
        ask: 'What should the homepage look like?',
        answer: 'Not important today.',
        impact: 'Page design is not system design. The answer changes nothing in the architecture.',
        value: 'low',
        notes: [],
      },
      {
        id: 'read-write',
        ask: 'How often is a link clicked compared with how often links are created?',
        answer: 'About 100 clicks for every link created.',
        impact: 'Strongly read-heavy: keep popular short codes in a cache, so most redirects never touch the database.',
        value: 'essential',
        essential: 'read-write',
        notes: [{ column: 'nonFunctional', text: 'About 100 clicks per link created' }],
      },
      {
        id: 'latency',
        ask: 'How quickly must a redirect happen?',
        answer: 'As fast as possible. It sits in front of every click, so aim for tens of milliseconds.',
        impact: 'The redirect path must be a single cache or key lookup, with no joins and no slow calls on the way.',
        value: 'essential',
        essential: 'latency',
        notes: [{ column: 'nonFunctional', text: 'Redirects in tens of milliseconds' }],
      },
      {
        id: 'analytics',
        ask: 'Do link owners need click statistics?',
        answer: 'Basic click counts per link. A few minutes of delay is fine.',
        impact: 'Count clicks in the background through a queue, so statistics never slow down a redirect.',
        value: 'useful',
        notes: [{ column: 'functional', text: 'Click counts per link, minutes late is fine' }],
      },
      {
        id: 'database-brand',
        ask: 'Which database product should I use?',
        answer: 'Your call.',
        impact: 'Naming a product before you know the access pattern adds nothing. Choose the kind of store after the requirements, and give a reason.',
        value: 'low',
        notes: [],
      },
      {
        id: 'consistency',
        ask: 'Once a link is created, must it work everywhere at once?',
        answer: 'Within a second or two is fine. But one short code must never point to two different links.',
        impact: 'Copies of the mapping can lag a little, but creating a code needs a uniqueness guarantee, so code generation needs care.',
        value: 'essential',
        essential: 'consistency',
        notes: [{ column: 'nonFunctional', text: 'New links may take a second to spread; codes never collide' }],
      },
      {
        id: 'abuse',
        ask: 'Do we need to block spam or malicious links?',
        answer: 'Not today.',
        impact: 'Scoping it out removes link scanning and blocklists from the design. Say you would add them later.',
        value: 'useful',
        notes: [{ column: 'outOfScope', text: 'Spam and malware checks' }],
      },
      {
        id: 'code',
        ask: 'Should I write the code for the hashing function now?',
        answer: 'Let’s stay at the design level.',
        impact: 'Writing code is a different interview. It spends the minutes you need for the design.',
        value: 'low',
        notes: [],
      },
      {
        id: 'geography',
        ask: 'Where do the clicks come from?',
        answer: 'Everywhere. Links get shared around the world.',
        impact: 'Serve redirects from caches in several regions near users, while creating links can stay in one region.',
        value: 'essential',
        essential: 'geography',
        notes: [{ column: 'nonFunctional', text: 'Clicks from all over the world' }],
      },
    ],
  },
];

export function getPrompt(id: PromptId): WorksheetPrompt {
  return PROMPTS.find((p) => p.id === id) ?? PROMPTS[0]!;
}

/** The lesson may pick the starting prompt with `props.prompt`; anything unknown falls back to the first. */
export function normalizePromptId(value: unknown): PromptId {
  return PROMPTS.some((p) => p.id === value) ? (value as PromptId) : PROMPTS[0]!.id;
}

/** Adds a question to the picks (in the order asked) or removes it. */
export function togglePick(picked: readonly string[], id: string): string[] {
  return picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id];
}

/** "6", "5.5": minutes for the readout. */
export function formatMinutes(minutes: number): string {
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
}

/** "a", "a and b", "a, b and c". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

export type Summary = {
  /** Picked questions, in the order they were asked. */
  asked: WorksheetQuestion[];
  covered: Essential[];
  skipped: (typeof ESSENTIALS)[number][];
  lowValue: WorksheetQuestion[];
  /** Ballpark minutes the questions would take in the room. */
  minutes: number;
  overBudget: boolean;
  /** The worksheet's lines, by column, in the order they were added. */
  worksheet: Record<Column, string[]>;
  verdict: string;
};

export function summarize(prompt: WorksheetPrompt, picked: readonly string[]): Summary {
  const byId = new Map(prompt.questions.map((q) => [q.id, q]));
  const asked = picked.map((id) => byId.get(id)).filter((q): q is WorksheetQuestion => q !== undefined);
  const coveredSet = new Set(asked.flatMap((q) => (q.essential ? [q.essential] : [])));
  const covered = ESSENTIALS.filter((e) => coveredSet.has(e.id)).map((e) => e.id);
  const skipped = ESSENTIALS.filter((e) => !coveredSet.has(e.id));
  const lowValue = asked.filter((q) => q.value === 'low');
  const minutes = (asked.length * QUESTION_SECONDS) / 60;
  const overBudget = minutes > BUDGET_MINUTES;

  const worksheet: Record<Column, string[]> = { functional: [], nonFunctional: [], outOfScope: [] };
  for (const q of asked) for (const n of q.notes) worksheet[n.column].push(n.text);

  return { asked, covered, skipped, lowValue, minutes, overBudget, worksheet, verdict: verdictFor(asked.length, skipped, lowValue, minutes, overBudget) };
}

function verdictFor(
  count: number,
  skipped: readonly { label: string }[],
  lowValue: readonly WorksheetQuestion[],
  minutes: number,
  overBudget: boolean,
): string {
  if (count === 0) return 'Pick the questions you would ask, then review them.';
  if (skipped.length === 0 && lowValue.length === 0 && !overBudget) {
    return 'All five essential questions, nothing wasted, and inside the five-minute budget. That is a strong start.';
  }
  const parts: string[] = [];
  if (skipped.length > 0) {
    const names = skipped.map((s) => s.label.toLowerCase());
    parts.push(`You skipped ${joinList(names)}${skipped.length === 1 ? ', one of the five questions' : ', questions'} that change the design most.`);
  } else {
    parts.push('You asked all five essential questions.');
  }
  if (lowValue.length > 0) {
    parts.push(lowValue.length === 1 ? 'One question was low value: its answer changes nothing.' : `${lowValue.length} questions were low value: their answers change nothing.`);
  }
  if (overBudget) {
    parts.push(`At about ${QUESTION_SECONDS} seconds a question, that is about ${formatMinutes(minutes)} minutes, past the ${BUDGET_MINUTES}-minute budget.`);
  }
  return parts.join(' ');
}
