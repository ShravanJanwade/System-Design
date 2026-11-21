/**
 * Blueprint content model (blueprint section 15), extended where the app needs more detail.
 * Content is data: every lesson, problem and diagram is rendered by shared components.
 */

export type ModuleId = 'm0' | 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7' | 'm8';

/* ------------------------------------------------------------------ */
/* Diagrams                                                            */
/* ------------------------------------------------------------------ */

export type NodeType =
  | 'client'
  | 'dns'
  | 'cdn'
  | 'loadBalancer'
  | 'gateway'
  | 'service'
  | 'worker'
  | 'cache'
  | 'sqlDb'
  | 'nosqlDb'
  | 'objectStore'
  | 'blockStore'
  | 'fileStore'
  | 'queue'
  | 'stream'
  | 'search'
  | 'external';

export type Side = 'top' | 'right' | 'bottom' | 'left';

export type DiagramNode = {
  id: string;
  type: NodeType;
  label: string;
  sublabel?: string;
  /** Grid column. Halves are allowed to center a node between two columns. */
  x: number;
  /** Grid row. Halves are allowed. */
  y: number;
};

export type DiagramEdge = {
  id: string;
  from: string;
  to: string;
  /** sync: solid arrow (request and response). async: dashed arrow. replication: double line. */
  kind: 'sync' | 'async' | 'replication';
  label?: string;
  /** Routing hints; the router picks sides automatically when these are absent. */
  fromSide?: Side;
  toSide?: Side;
};

/** One hop of a request dot. A string is the edge id; prefix it with '<' to travel backwards. */
export type FlowHop = string | { edge: string; reverse?: boolean; tag?: string; tone?: 'signal' | 'alert' };
/** An array of hops travels at the same time (fan-out). */
export type FlowItem = FlowHop | FlowHop[];

export type StepNote = { target: string; text: string; tone?: 'signal' | 'alert' | 'plain' };

export type DiagramStep = {
  caption: string;
  /** Node and edge ids at full strength; everything else dims to about 35%. */
  focus?: string[];
  /** Edges that animate request dots, in order. */
  flow?: FlowItem[];
  /** Node ids shown as failed during this step. */
  fail?: string[];
  /** Nodes and edges that appear at this step and stay visible afterwards. */
  add?: string[];
  /** Small chips attached to nodes or edges during this step, such as a latency or "hit". */
  notes?: StepNote[];
};

export type DiagramLayoutOverride = {
  grid: { cols: number; rows: number };
  positions: Record<string, { x: number; y: number }>;
  sides?: Record<string, { fromSide?: Side; toSide?: Side }>;
};

export type DiagramSpec = {
  grid: { cols: number; rows: number };
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  steps?: DiagramStep[];
  /** Optional layout for narrow screens. Without it, the engine transposes the grid when that fits better. */
  narrow?: DiagramLayoutOverride;
  /** Plain-text description for screen readers. Generated from the spec when absent. */
  description?: string;
};

export type SequenceActor = { id: string; type: NodeType; label: string };

export type SequenceMessage = {
  from: string;
  to: string;
  label: string;
  /** sync: solid request. reply: dashed response. async: dashed one-way message. */
  kind?: 'sync' | 'reply' | 'async';
  /** Caption shown under the panel while this message is the current step. */
  caption: string;
  /** The message never arrives (drawn ending in a cross). */
  lost?: boolean;
};

export type SequenceSpec = {
  actors: SequenceActor[];
  messages: SequenceMessage[];
  /** Brackets that group consecutive messages, using 1-based message numbers (inclusive). */
  groups?: { label: string; from: number; to: number }[];
  description?: string;
};

export type DecisionResult = {
  kind: 'result';
  id: string;
  title: string;
  why: string;
  lessonId?: string;
};

export type DecisionNode = {
  kind: 'question';
  id: string;
  question: string;
  help?: string;
  options: { label: string; next: DecisionNode | DecisionResult }[];
};

export type CompareSide = {
  title: string;
  summary?: string;
  points: string[];
  diagram?: DiagramSpec;
  verdict?: string;
};

export type TradeoffRow = { option: string; goodAt: string; badAt: string; pickWhen: string };
export type TradeoffTable = { caption?: string; rows: TradeoffRow[] };

/* ------------------------------------------------------------------ */
/* Simulators                                                          */
/* ------------------------------------------------------------------ */

export type SimulatorId =
  | 'request-journey'
  | 'availability'
  | 'latency-ladder'
  | 'estimation'
  | 'load-balancer'
  | 'cache'
  | 'message-queue'
  | 'replication'
  | 'shard-key'
  | 'hash-ring'
  | 'partition'
  | 'quorum'
  | 'retry-storm'
  | 'rate-limiter'
  | 'bloom-filter'
  | 'fan-out'
  | 'geo-map';

export type SimulatorPreset = Record<string, number | string | boolean>;

export const SIMULATOR_IDS: readonly SimulatorId[] = [
  'request-journey',
  'availability',
  'latency-ladder',
  'estimation',
  'load-balancer',
  'cache',
  'message-queue',
  'replication',
  'shard-key',
  'hash-ring',
  'partition',
  'quorum',
  'retry-storm',
  'rate-limiter',
  'bloom-filter',
  'fan-out',
  'geo-map',
];

/**
 * Smaller interactive widgets that live inside one lesson (blueprint section 9),
 * such as the percentile histogram. Each has a folder in src/widgets.
 */
export const WIDGET_IDS = [
  'learning-loop',
  'interview-timeline',
  'highway',
  'percentile-histogram',
  'tradeoff-sliders',
  'cdn-map',
  'index-scan',
  'inverted-index',
  'snowflake-bits',
  'consistency-timelines',
  'circuit-breaker',
  'drifting-clocks',
  'gossip',
  'event-replay',
  'stream-windows',
  'collab-editing',
  'trace-waterfall',
  'cost-bars',
  'requirements-worksheet',
  'estimation-drill',
  'phrase-cards',
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */

export type ChoiceOption = { text: string; correct: boolean; why: string };

export type Question =
  | { kind: 'single' | 'multi'; prompt: string; options: ChoiceOption[] }
  /** items are listed in the correct order; the quiz shuffles them. */
  | { kind: 'order'; prompt: string; items: string[]; why: string }
  /**
   * tolerance is a ratio: 2 accepts anything from answer / 2 to answer × 2.
   * solution lists the worked steps, one line each.
   */
  | { kind: 'numeric'; prompt: string; answer: number; unit: string; tolerance: number; solution: string[] }
  | {
      kind: 'bottleneck';
      prompt: string;
      diagram: DiagramSpec;
      answerNodeId: string;
      why: string;
      /** Why each other component is not the answer, keyed by node id. */
      others: Record<string, string>;
    };

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

export type CalloutTone = 'intuition' | 'interview' | 'mistake' | 'simplification';

export type Block =
  | { kind: 'prose'; md: string }
  | { kind: 'heading'; text: string }
  | { kind: 'callout'; tone: CalloutTone; md: string }
  | { kind: 'diagram'; spec: DiagramSpec; caption: string; title?: string }
  | { kind: 'sequence'; spec: SequenceSpec; caption: string; title?: string }
  | { kind: 'decision'; tree: DecisionNode; title: string; caption?: string }
  | { kind: 'table'; columns: string[]; rows: string[][]; caption?: string }
  | { kind: 'compare'; left: CompareSide; right: CompareSide; caption?: string }
  | { kind: 'numbers'; items: { label: string; value: string; note?: string }[]; caption?: string }
  | { kind: 'code'; code: string; caption?: string }
  /** Code-like lines with a plain-English note beside each, such as an annotated HTTP request. */
  | { kind: 'annotated'; title?: string; caption?: string; lines: { code: string; note?: string }[] }
  | { kind: 'simulator'; id: SimulatorId; preset?: SimulatorPreset; intro?: string }
  | { kind: 'widget'; id: WidgetId; title?: string; caption: string; props?: SimulatorPreset }
  | { kind: 'quickCheck'; question: Question };

/* ------------------------------------------------------------------ */
/* Lessons                                                             */
/* ------------------------------------------------------------------ */

export type Flashcard = { front: string; back: string };

export type Lesson = {
  id: string;
  module: ModuleId;
  order: number;
  title: string;
  /** The idea in one sentence. */
  idea: string;
  /** Reading time, 8 to 15 minutes. */
  minutes: number;
  prerequisites: string[];
  /** "You'll be able to..." outcomes, two or three. */
  outcomes: string[];
  analogy: { title: string; body: string };
  /** The Snapgram story, markdown. */
  whyItMatters: string;
  /** "How it works": 3 to 6 short steps, each paired with a diagram or one step of an animated one. */
  body: Block[];
  /** "Try it": the embedded simulator or interactive widget, when the lesson has one. */
  tryIt?: Block[];
  tradeoffs?: TradeoffTable;
  realWorld?: { title: string; body: string; sourceUrl?: string; sourceLabel?: string };
  interview: {
    whenToMention: string;
    sayItLikeThis: string[];
    followUps: { q: string; a: string }[];
    redFlags: string[];
  };
  mistakes: string[];
  quiz: Question[];
  takeaways: [string, string, string];
  deeper?: Block[];
  flashcards: Flashcard[];
  related: string[];
  glossaryTerms: string[];
};

export type LessonOutline = {
  id: string;
  module: ModuleId;
  order: number;
  /** Display number such as "3.4". */
  number: string;
  title: string;
  minutes: number;
  /** Kept in step with the lesson file; the content check verifies they match. */
  prerequisites: string[];
};

export type ModuleInfo = {
  id: ModuleId;
  number: number;
  title: string;
  summary: string;
  lessons: LessonOutline[];
};

/* ------------------------------------------------------------------ */
/* Glossary                                                            */
/* ------------------------------------------------------------------ */

export type GlossaryTerm = {
  id: string;
  term: string;
  /** Other spellings people search for, such as the acronym. */
  aka?: string[];
  /** Plain English, 25 words or fewer. */
  definition: string;
  /** One line. */
  example: string;
  /** Lessons that use the term. Filled in from the generated manifest, never by hand. */
  lessons: string[];
};

/** A glossary entry as authored. Which lessons use it is computed (npm run manifest). */
export type RawTerm = Omit<GlossaryTerm, 'lessons'>;

/* ------------------------------------------------------------------ */
/* Practice (blueprint section 10) and cheat sheets (section 11)        */
/* ------------------------------------------------------------------ */

/**
 * One practice exercise: a question, the lesson that teaches it, and for pick-the-tool the lesson whose
 * decision flowchart explains the choice. Estimation drills and spot-the-bottleneck items also come from
 * the lessons' own quizzes (see `practicePool` in the generated manifest).
 */
export type PracticeItem = {
  id: string;
  /** A short scenario name for lists, in sentence case. */
  title: string;
  /** The lesson to review after a miss. */
  lessonId: string;
  /** Pick the tool: a lesson with a `decision` flowchart that walks through this choice. */
  flowchartLessonId?: string;
  question: Question;
};

/** A one-screen, printable summary for the night before an interview. */
export type CheatSheet = {
  id: string;
  title: string;
  /** One sentence, shown on the Reference page. */
  summary: string;
  /** Lessons this sheet summarizes, linked from the sheet. */
  lessons: string[];
  /** Shows a "rough numbers" label, for sheets of ballparks. */
  rough?: boolean;
  sections: { title: string; blocks: Block[] }[];
};

/* ------------------------------------------------------------------ */
/* Problems                                                           */
/* ------------------------------------------------------------------ */

export type Problem = {
  id: string;
  title: string;
  tier: 1 | 2 | 3;
  flagship?: boolean;
  minutes: 45 | 60;
  prompt: string;
  concepts: string[];
  hints: [string, string, string];
  clarifyingQuestions: { q: string; why: string }[];
  requirements: { functional: string[]; nonFunctional: string[]; outOfScope: string[] };
  estimation: {
    assumptions: { label: string; value: string }[];
    steps: { label: string; math: string; result: string }[];
    /** Starting values for the embedded estimation calculator (keys of its inputs, such as dau). */
    calculator?: SimulatorPreset;
  };
  api: { signature: string; description: string }[];
  dataModel: { entity: string; fields: string[]; store: string; why: string }[];
  stages: { title: string; solves: string; diagram: DiagramSpec; explanation: string }[];
  deepDives: { title: string; problem: string; options: TradeoffTable; recommendation: string }[];
  failureModes: { scenario: string; impact: string; mitigation: string }[];
  levelSignals: { level: 'entry' | 'mid' | 'senior'; signals: string[] }[];
  followUps: { q: string; a: string }[];
  rubric: { item: string; weight: number; lessonId?: string }[];
};
