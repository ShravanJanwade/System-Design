/**
 * The interview timeline (lessons 0.3 and 8.1): the six phases of a design interview,
 * sized by their time budget. At 60 minutes the extra time goes to the high-level
 * design and the deep dives. Pure data and arithmetic; the view only draws.
 */

export type InterviewLength = 45 | 60;
export type PhaseId = 'requirements' | 'estimation' | 'api' | 'high-level' | 'deep-dives' | 'wrap-up';

export type PhaseContent = {
  id: PhaseId;
  name: string;
  goal: string;
  looksFor: string;
  /** A sample opening line, in the candidate's voice. */
  opener: string;
  mistake: string;
};

export const PHASES: readonly PhaseContent[] = [
  {
    id: 'requirements',
    name: 'Requirements',
    goal: 'Turn the vague prompt into a short, agreed list: the core features, the scale, and the qualities that matter most, such as speed or consistency.',
    looksFor: 'Whether you ask before you design, pick a sensible scope, and write down what is in and out.',
    opener: 'Before I draw anything, can we agree on scope? I’m thinking uploads, follows and a feed, and I’d leave out messaging. Roughly how many daily users should I plan for?',
    mistake: 'Jumping straight to boxes and arrows, then designing for a problem the interviewer never asked about.',
  },
  {
    id: 'estimation',
    name: 'Estimation',
    goal: 'Size the problem with a few rough numbers, such as requests per second and storage per year, and only the ones that will change a decision.',
    looksFor: 'Stated assumptions, hard rounding, and a conclusion that shapes the design.',
    opener: 'Quick estimate: ten million daily users viewing about 50 photos each is about 6,000 views a second, so this design has to be built for reads.',
    mistake: 'Ten minutes of precise arithmetic that never informs a single choice.',
  },
  {
    id: 'api',
    name: 'API and data model',
    goal: 'Name the few calls clients make and the main things you store, so the design has something concrete to serve.',
    looksFor: 'A minimal, sensible API, and a data model that fits how the data is read and written.',
    opener: 'Three calls cover it: upload a photo, follow someone and fetch the feed. The main records are users, photos and follows.',
    mistake: 'Specifying every endpoint and column in detail, or skipping this step and leaving the design abstract.',
  },
  {
    id: 'high-level',
    name: 'High-level design',
    goal: 'Draw the simplest design that meets the requirements, end to end, and walk one request through it.',
    looksFor: 'A complete, working design with clear data flow, before any optimization.',
    opener: 'Let me start simple: clients reach stateless app servers through a load balancer, metadata lives in a database, and photos sit in object storage behind a CDN. Here is one upload, end to end.',
    mistake: 'A large, buzzword-heavy diagram with no explanation of how a request moves through it.',
  },
  {
    id: 'deep-dives',
    name: 'Deep dives',
    goal: 'Go deep on the two or three hardest parts, such as the feed, the hottest data or a failure, and compare real options.',
    looksFor: 'Depth, clearly stated trade-offs, and you leading the discussion toward what matters most.',
    opener: 'The feed is the hardest part at this scale, so I’d like to dig into it. There are two ways to build it, and they trade write cost against read speed.',
    mistake: 'Waiting for the interviewer to pick the topic, or spending the time on an easy part.',
  },
  {
    id: 'wrap-up',
    name: 'Wrap-up',
    goal: 'Step back: name the bottlenecks, what happens when parts fail, the main trade-offs, and what you would change at ten times the scale.',
    looksFor: 'Honest awareness of the design’s weak spots, and a clear summary.',
    opener: 'To wrap up: the main risk is the database under write load, and the next step would be splitting it by user. If a region fails, DNS moves traffic to the other one.',
    mistake: 'Running out of time mid-design with no summary, or claiming the design has no weaknesses.',
  },
];

/** Minutes per phase. The 60-minute plan gives its extra 15 minutes to the high-level design and the deep dives. */
export const BUDGET: Record<InterviewLength, Record<PhaseId, number>> = {
  45: { requirements: 5, estimation: 5, api: 5, 'high-level': 10, 'deep-dives': 15, 'wrap-up': 5 },
  60: { requirements: 5, estimation: 5, api: 5, 'high-level': 15, 'deep-dives': 25, 'wrap-up': 5 },
};

/** Phases whose budget is a range rather than a single figure. */
const RANGES: Partial<Record<PhaseId, [number, number]>> = { estimation: [3, 5] };

export type TimelinePhase = PhaseContent & {
  index: number;
  minutes: number;
  start: number;
  end: number;
  /** For example "about 5 minutes" or "about 3 to 5 minutes". */
  duration: string;
};

export function normalizeLength(value: unknown): InterviewLength {
  return value === 60 || value === '60' ? 60 : 45;
}

export function normalizeIndex(value: unknown, count: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : 0;
  if (!Number.isFinite(n) || count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(n)));
}

export function durationLabel(id: PhaseId, minutes: number): string {
  const range = RANGES[id];
  return range ? `about ${range[0]} to ${range[1]} minutes` : `about ${minutes} minutes`;
}

/** The six phases for an interview of the given length, with start and end minutes. */
export function buildTimeline(length: InterviewLength): TimelinePhase[] {
  let start = 0;
  return PHASES.map((p, index) => {
    const minutes = BUDGET[length][p.id];
    const phase: TimelinePhase = { ...p, index, minutes, start, end: start + minutes, duration: durationLabel(p.id, minutes) };
    start += minutes;
    return phase;
  });
}

/** Minute marks from 0 to the end of the interview. */
export function minuteTicks(length: InterviewLength, step = 5): number[] {
  const ticks: number[] = [];
  for (let m = 0; m <= length; m += step) ticks.push(m);
  return ticks;
}

export type Segment = { x: number; w: number };

/** Pixel position and width of each phase's segment in a bar of the given width, with fixed gaps between segments. */
export function segmentLayout(phases: TimelinePhase[], width: number, gap: number): Segment[] {
  const total = phases.reduce((s, p) => s + p.minutes, 0);
  const usable = Math.max(0, width - gap * Math.max(0, phases.length - 1));
  let x = 0;
  return phases.map((p) => {
    const w = total > 0 ? (usable * p.minutes) / total : 0;
    const seg = { x, w };
    x += w + gap;
    return seg;
  });
}

/** Where a minute falls along the bar, matching the segments, so minute marks line up with phase edges. */
export function minuteToX(phases: TimelinePhase[], segments: Segment[], minute: number): number {
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i]!;
    const s = segments[i]!;
    if (minute <= p.end) return s.x + (Math.max(0, minute - p.start) / p.minutes) * s.w;
  }
  const last = segments.at(-1);
  return last ? last.x + last.w : 0;
}

/** Which phase is under way at a given minute. The final minute belongs to the last phase. */
export function phaseAtMinute(phases: TimelinePhase[], minute: number): number {
  const i = phases.findIndex((p) => minute >= p.start && minute < p.end);
  return i >= 0 ? i : minute < 0 ? 0 : phases.length - 1;
}
