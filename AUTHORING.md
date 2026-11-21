# Authoring guide

How to write lessons, simulators and widgets for Blueprint so they match the rest of the app and pass the build-time content check. The product spec is `../Blueprint — Build Prompt for a System Design Learning App.md`; this guide is how that spec is implemented here.

Read these first:

- The spec, sections 3 (how Blueprint teaches), 5 (the lesson page), 8 (diagrams), 9 (simulators), 12 (design system), 13 (writing style), 16 (the gold-standard lesson) and 18 (definition of done).
- The two gold-standard lessons, which set the depth and voice: `src/content/lessons/1-1-life-of-a-request.ts` and `src/content/lessons/3-4-caching.ts`. For a lesson whose simulator was built after them, see `3-2-load-balancers.ts` with `src/simulators/load-balancer/`.
- The content model: `src/content/types.ts`.

### Working efficiently

- Read what this guide lists and the files your own work needs. Do not survey the rest of the codebase.
- Write each file in one go, then fix everything a check run reports in one batch before running it again.
- Check each real-world source once with a single fetch. Prefer stable sources: official documentation, well-known papers and company engineering blogs.
- Run only your own checks and tests (see "Before you report"), not the full suite or the build.

### Length

The content check prints each lesson's estimated time: the words outside the quiz and "Go deeper" at 200 a minute, plus 0.15 minutes per diagram step, 2 per simulator, 1.5 per widget and 0.4 per quiz question. Aim for an estimate of 11 to 15 minutes, which for most lessons means 1,700 to 2,300 words. Keep `minutes` equal to the value in `modules.ts`; the integrator syncs both to the estimate afterwards.

## Commands

```bash
npm run check:content -- dns tcp-vs-udp   # check only these lessons (fast; use this while writing)
npm run check:content                     # check everything, including the generated manifest
npx vitest run src/simulators/<id> src/widgets/<id>
npx tsc -p tsconfig.app.json --noEmit     # type-check (safe to run alongside other writers)
npm run manifest                          # regenerate the term manifest, practice pool and problem concepts
npm run search-index                      # regenerate the command palette's full-text index
```

Practice items (`src/content/practice/`) and cheat sheets (`src/content/cheatsheets/`) have their own checks in
`src/content/check/practice.ts` and `src/content/check/cheatsheets.ts`; the full `npm run check:content` runs both.
Estimation and spot-the-bottleneck drills also draw on lesson quizzes, so every numeric or bottleneck quiz question
must read on its own: spell out each acronym inside the question, even when the lesson spelled it out earlier.

A lesson is not done until `npm run check:content -- <its id>` prints `ok` for it.

## Who owns which files

Lessons, simulators and widgets are written in parallel, so ownership is strict.

- **You own:** your lesson files, your glossary file `src/content/glossary/terms-group-<x>.ts`, your acronym file `src/content/acronyms/group-<x>.ts`, and the folders of the simulators and widgets assigned to you (`src/simulators/<id>/`, `src/widgets/<id>/`).
- **Do not edit anything else.** In particular: `types.ts`, `modules.ts`, the glossary and acronym index files, `terms-core.ts`, registries, `src/design`, `src/diagram`, `src/features`, `src/state`, `package.json`, and other groups' files. If you need a change there, say so in your report instead.
- Do not run `npm install`, start dev servers, or run `npm run manifest` (the integrator does that once, at the end).

Phase 3 groups (Modules 4 and 5):

| Group | Lessons | Simulators and widgets |
| --- | --- | --- |
| I | 4.1 `replication`, 4.2 `replication-lag` | simulator `replication` (embedded in both lessons) |
| J | 4.3 `sharding`, 4.4 `consistent-hashing` | simulators `shard-key`, `hash-ring` |
| K | 4.5 `cap-pacelc`, 4.6 `consistency-models` | simulator `partition`; widget `consistency-timelines` |
| L | 4.7 `quorums`, 4.8 `distributed-transactions`, 4.9 `denormalization` | simulator `quorum` |
| M | 5.1 `why-distributed-is-hard`, 5.2 `timeouts-retries-backoff`, 5.3 `idempotency` | simulator `retry-storm` |
| N | 5.4 `circuit-breakers`, 5.5 `rate-limiting` | simulator `rate-limiter`; widget `circuit-breaker` |
| O | 5.6 `time-and-ordering`, 5.7 `consensus-leader-election`, 5.8 `heartbeats-gossip` | widgets `drifting-clocks`, `gossip` |
| P | 5.9 `distributed-locks`, 5.10 `probabilistic-structures` | simulator `bloom-filter` |

Phase 4 groups (Modules 6 and 7):

| Group | Lessons | Simulators and widgets |
| --- | --- | --- |
| Q | 6.1 `monolith-vs-microservices`, 6.2 `service-communication` | none |
| R | 6.3 `event-driven`, 6.4 `cqrs-event-sourcing` | widget `event-replay` |
| S | 6.5 `batch-vs-stream`, 6.6 `feed-fanout` | widget `stream-windows`; simulator `fan-out` |
| T | 6.7 `geospatial-indexing`, 6.8 `real-time-collaboration` | simulator `geo-map`; widget `collab-editing` |
| U | 7.1 `observability`, 7.2 `security-essentials`, 7.3 `zero-downtime-deploys` | widget `trace-waterfall` |
| V | 7.4 `multi-region-dr`, 7.5 `cost-awareness` | widget `cost-bars` |

`terms-shared.ts` also defines terms several Module 6 and 7 lessons need (event, event sourcing, batch and stream processing, backward compatibility, service discovery, service mesh, mutual TLS, observability, distributed tracing, canary release, feature flag, encryption at rest, backup, data residency), and `acronyms/core.ts` has CI, CD, DR, AZ, VM, ETL, PII, GDPR, IAM, SSO, MFA, GPU and IOPS. Earlier groups already defined `cqrs`, `crdt`, `saga`, `transactional-outbox`, `read-model`, `materialized-view`, `change-data-capture`, `publish-subscribe`, `fan-out`, `hot-key`, `sliding-window` and `fixed-window`.

Phase 5 groups (Module 8 and the interview problems):

| Group | Lessons or problems | Widgets and files |
| --- | --- | --- |
| W | 8.1 `interview-framework`, 8.2 `requirements`, 8.3 `estimation-in-the-room` | 8.1 reuses widget `interview-timeline`; new widgets `requirements-worksheet`, `estimation-drill` |
| X | 8.4 `api-and-data-model`, 8.5 `high-level-design`, 8.6 `deep-dives` | none |
| Y | 8.7 `talking-tradeoffs`, 8.8 `level-expectations`, 8.9 `mistakes-that-sink` | widget `phrase-cards` |
| Problems A | `url-shortener`, `rate-limiter` | `acronyms/problems-a.ts` |
| Problems B | `news-feed`, `chat-app` | `acronyms/problems-b.ts` |
| Problems C | `video-streaming`, `ticket-booking` | `acronyms/problems-c.ts` |
| Problems D–H | the other 20 problems, four per group | `acronyms/problems-d.ts` to `problems-h.ts` |

Problem writers link existing glossary terms but add none (problems have no glossary file); a problem explains any new term in its own words.

The simulator and widget ids are already registered (`src/simulators/registry.ts`, `WIDGET_IDS` in `types.ts`), and each group's glossary and acronym files already exist, empty. Terms that several Module 4 and 5 lessons need are already defined in `src/content/glossary/terms-shared.ts` (replication, leader, follower, quorum, consensus, lease, circuit breaker, exponential backoff and about thirty more): link them, never redefine them. Acronyms several groups need (CAP, PACELC, LWW, CRDT, GC, WAL, CDC, CQRS, UTC, NTP and others) are in `acronyms/core.ts`.

## Lesson files

- File name: `src/content/lessons/<module>-<order>-<lesson id>.ts`, for example `1-3-dns.ts`. The app and the scripts find lesson files by this pattern; nothing needs registering.
- Default export: a `Lesson`. `id`, `module`, `order`, `title`, `minutes` and `prerequisites` must match the lesson's row in `src/content/modules.ts` exactly (the check compares them).
- `body` is "How it works". `tryIt` holds the simulator or widget for "Try it". `deeper` is the collapsed "Go deeper" section.
- Diagram specs, sequence specs and decision trees go in constants at the top of the file, as in the gold-standard lessons.

### Section by section (spec section 5)

| Field | Rules the check enforces, and what good looks like |
| --- | --- |
| `title` | From `modules.ts`. If it contains an acronym ("DNS", "TCP vs. UDP"), spell it out in the `idea`, which comes next. |
| `idea` | Exactly one sentence. |
| `outcomes` | Two or three "You'll be able to" outcomes, each starting with a verb. |
| `analogy` | The analogy from the spec's curriculum table (section 6), as a short story: one or two paragraphs. |
| `whyItMatters` | The Snapgram story for this lesson (see the story arc below). Must mention Snapgram. The problem appears here; the fix comes later. |
| `body` | How it works: 3 to 6 short steps. The first animated diagram must have 3 to 6 steps. At least two diagrams in the lesson (diagram or sequence blocks), at least one animated. Use `heading` blocks to name sub-steps when a lesson has several parts. Include one `simplification` callout saying what you left out. |
| `tryIt` | Present when the lesson has a simulator or widget. Must contain a `simulator` or `widget` block. |
| `tradeoffs` | Required for Modules 1 to 7. Columns are fixed: option, good at, bad at, pick it when. Two or more rows. |
| `realWorld` | A well-known, publicly documented example with a working `sourceUrl` (engineering blog, paper, conference talk, official docs). State only what the source says. No invented statistics. Verify the URL before you cite it. |
| `interview` | `whenToMention`; at least two `sayItLikeThis` sentences; exactly three `followUps` with model answers; at least two `redFlags`. |
| `mistakes` | Three to five. Pattern: `**Short name.** One or two sentences on why it hurts.` |
| `quiz` | Four to six questions mixing at least two kinds. Every option of single and multiple choice has a `why`. Single choice has exactly one correct option and at least three options. Order questions list items in the correct order (the quiz shuffles). Numeric `tolerance` is a ratio above 1 (use about 1.1 for exact arithmetic, 2 for real estimates) with a line-by-line `solution`. Bottleneck questions need `why` and an `others` explanation for every other node. |
| `takeaways` | Exactly three, each one sentence. |
| `deeper` | Optional advanced material, two to four short blocks. Related lessons are added automatically from `related`. |
| `flashcards` | Five to eight. Fronts are questions; backs are one or two sentences. |
| `related` | Lesson ids from `modules.ts` (written or not). |
| `glossaryTerms` | Every glossary id you link with `[[...]]`, and nothing else. Order them as they first appear. |

### Writing rules (spec section 13)

- Second person, calm, direct, a little warm. Plain English at about a grade 8 to 10 reading level, without losing accuracy.
- **No paragraph over four sentences.** The check counts sentence ends, including `?` and `!` inside quotes, so avoid quoted questions inside a sentence.
- **Spell out every acronym on first use in the lesson**, within a sentence or so of it: "a content delivery network (CDN)" or "TTL (time to live)". The first use is counted in reading order: title, idea, outcomes, analogy, story, body, try it, trade-offs, real world, interview, mistakes, quiz, takeaways, go deeper. Text inside backticks is ignored. Diagram node labels are not counted, so expand the acronym in the caption or prose near the diagram. If the check reports an acronym it does not know, add it to your acronym file with its expansion. Add names and keywords written in capitals (for example `CNAME`, `SELECT`) to `groupNotAcronyms` in the same file.
- Define every term the first time it appears and link it to the glossary: `[[shown text|term-id]]`. Link a term at its first use only, not every time.
- Concrete numbers, labeled as ballpark ("about 150 ms, ballpark"). Never invent statistics. Company examples only when publicly documented; otherwise call them illustrative.
- Sentence case everywhere. No emoji. No hype. Banned words, which the check rejects: delve, robust, leverage, seamless, cutting-edge, "it's important to note", "in conclusion", "unlock your potential", supercharge, elevate, game-changer, lorem, "coming soon", TODO, TBD.
- Quiz explanations are one or two sentences per option and explain the reasoning, not just "Correct!".
- Intuition before terminology: open with the analogy and the problem, name the concept after it makes sense. At most about three new terms per sub-step.
- Every lesson says when to raise the idea in an interview, how to say it, which follow-ups to expect, and which answers are red flags.

### Markdown in content

`**bold**`, `*italic*`, `` `code` ``, `==highlight==` (use at most once per lesson, for the key phrase), `[text](lesson:lesson-id)` (renders as plain text until that lesson is written), `[text](https://…)`, `[[shown text|glossary-id]]`, bullet lists with `- `, numbered lists with `1. `, blank lines between paragraphs.

**Bold component names in prose** (`the **load balancer**`, `the **cache**`) highlight the matching card in the diagrams of the same section on hover. Bold a node's label or its type name.

## Glossary

- Before adding a term, search for its id in `src/content/glossary/` (all files). Reuse existing ids; never define one twice.
- Add new terms to your group file only. Shape: `{ id, term, aka?, definition, example }`. No `lessons` field: which lessons use a term is computed.
- `id` is kebab-case. `definition` is plain English, 25 words or fewer. `example` is one line, ideally from the Snapgram story.
- Add a term for every concept a beginner might not know. Lessons in this curriculum usually link 15 to 30 terms.

## Diagrams

Every diagram is data rendered by the shared engine (`src/diagram`), on the blueprint panel. Read the `DiagramSpec`, `SequenceSpec` and `DecisionNode` types. The check lays out every diagram in three modes (wide, compact, narrow) and fails if cards are closer than 24 px, a line passes through a card, a line crosses a label, or the diagram would draw below 85% on a phone.

### Component diagrams (`diagram` block)

- `grid: { cols, rows }`; each node has `x` (column) and `y` (row), whole numbers or halves. Columns size to their widest card. Keep beginner diagrams to about nine nodes; split bigger designs into stages.
- Node types and colors: `client` (slate); `dns`, `cdn`, `loadBalancer`, `gateway` (teal); `service`, `worker` (green); `cache` (raspberry); `sqlDb`, `nosqlDb`, `search` (amber); `objectStore`, `blockStore`, `fileStore` (umber); `queue`, `stream` (violet); `external` (dashed outline). Labels are short ("App server"); `sublabel` adds a detail ("Oregon", "port 443").
- Edges: `kind` is `sync` (solid arrow: request and response), `async` (dashed: message or event) or `replication` (double line). Sides are picked automatically, avoiding other cards; set `fromSide`/`toSide` only if needed. Keep edge `label`s short (one to three words): they sit on chips in the gap between cards.
- Steps (`steps`): each has a `caption` (one to three sentences, markdown allowed), and optionally:
  - `flow`: edges a request dot travels, in order. `'e1'` goes from `from` to `to`; `'<e1'` goes back. `{ edge: 'e1', tag: 'hit' }` shows a chip on the node where the dot arrives. An array of hops moves together (fan-out): `[['a-b1', 'a-b2', 'a-b3']]`.
  - `focus`: ids at full strength; everything else dims. Flow edges and their nodes are focused automatically.
  - `fail`: node ids drawn as failed (red outline, hatching, "Down").
  - `add`: nodes or edges that first appear at this step (for designs that evolve).
  - `notes`: small chips on a node or edge, such as `{ target: 'db', text: '≈ 3 ms' }`.
- With reduced motion, dots are replaced by numbered badges automatically; you do nothing extra.
- **Phones.** On a 375 px phone the panel is 327 px wide inside (285 px in a `compare` block), and the check fails a diagram that draws there at less than 85% (labels below about 12 px). Phones get the narrow layout: cards shrink to their text (80 to 112 px), with 24 px between columns and a 12 px margin, so three columns fit and four do not. By default the narrow layout transposes the wide grid (rows become columns), so a wide grid with four or more rows, or a labeled edge between two cards that end up side by side, is usually too wide.
- The fix is a `narrow` override: `narrow: { grid: { cols, rows }, positions: { id: { x, y }, … }, sides?: { edgeId: { fromSide, toSide } } }`, listing every node. Keep the client on top and requests flowing down; use at most three columns; put labeled edges top to bottom; `x: 0.5` centers a card between two columns. Sides set here also decide which gap holds an edge's label, so `{ fromSide: 'bottom', toSide: 'top' }` keeps a diagonal labeled edge from widening a column gap.
- Preview while you work: `npm run check:content -- <id>` names the width a failing diagram's narrow layout must fit (384 px, or 334 px in a compare block).

### Sequence diagrams (`sequence` block)

`actors` (two to five), `messages` with `from`, `to`, `label` (short), `kind` (`sync`, `reply` or `async`), a `caption` for each message (shown when it is the current step), and optionally `lost: true` (the message never arrives). `groups` bracket consecutive messages (1-based, inclusive). A message cannot go from an actor to itself. On a phone, two or three actors keep their columns; with four or five, the diagram becomes a numbered list of its messages (both actors, the arrow style and the label), so keep message labels short enough to read on their own.

### Other visual blocks

- `decision`: an interactive flowchart. Questions with two or three options; leaves are `{ kind: 'result', id, title, why, lessonId? }`.
- `compare`: two sides, each with a title, points, and optionally a small diagram.
- `table`: generic table; first column is the row header.
- `numbers`: a list of ballpark numbers with labels.
- `annotated`: code-like lines (an HTTP request, a schema) with a plain-English note per line.
- `code`: a plain code block.
- `quickCheck`: one question inside the body (not scored).

## Simulators and widgets

Simulators are the seventeen in spec section 9; they appear in their lesson's "Try it" and on the Playground. Widgets are smaller interactives that live inside one lesson. Both are discovered automatically from their folder once `View.tsx` exists.

### Folder layout

```text
src/simulators/<id>/logic.ts       pure, deterministic simulation (no React, no DOM)
src/simulators/<id>/logic.test.ts  vitest tests of the logic
src/simulators/<id>/View.tsx       default export: React component taking SimulatorProps
src/widgets/<id>/View.tsx          default export: React component taking WidgetProps
src/widgets/<id>/logic.ts(+test)   when the widget computes anything non-trivial
```

- Simulator props: `{ preset?, embedded? }` from `src/simulators/registry.ts`. When `embedded` is true (inside a lesson), start with `<SimHeader title intro />`. Read the lesson's `preset` for starting values.
- Widget props: `{ props? }` from `src/widgets/registry.ts`. The lesson renders the widget's title and caption around it; the widget renders its own panel.
- Use the existing simulators as models: `src/simulators/load-balancer/` (a component diagram driven by simulation state), `src/simulators/message-queue/` (a time series with a `LineChart`) and `src/simulators/cache/`. For a widget with custom SVG, see `src/widgets/snowflake-bits/` or `src/widgets/percentile-histogram/`.
- Known limits of the diagram engine: a step cannot remove a node (use `focus` and `fail` instead), and two sequence diagrams cannot sit side by side. If a visual needs either, draw it in a widget.
- If your simulator or widget builds a `DiagramSpec`, test every spec it can build with `lintDiagram(spec)` from `src/diagram/chips.ts`, expecting `[]`. It lays the diagram out in all three modes and checks cards, lines and labels, plus the chips at every step: notes, arrival tags and "Down" tags must not overlap each other, other cards, edge labels or arrowheads, or run off the diagram. The content check runs the same check on lesson diagrams. Keep notes short (about 20 characters) so they fit on phones.
- In zustand selectors, never return a new array or object (`s.list ?? []`); use a constant defined outside the component. A fresh value on every read causes an infinite render loop.

### Engineering rules (spec section 9)

- Logic is real: an actual LRU cache, actual token-bucket math. Keep it in `logic.ts`, separate from the UI, deterministic (use `createRng(seed)` and `createZipf` from `src/lib/random.ts`), and unit-tested. Write tests that confirm what each challenge's explanation claims.
- Each simulator has three or four "Try this" challenges using `<Challenges simId challenges touched />` from `src/simulators/shared/Challenges.tsx`. Each challenge's `attempted` flag is computed from the simulator's state.
- Keep simulations fast enough to recompute on every slider move (under about 30 ms), or use `useDeferredValue`.

### Design rules (spec sections 8 and 12)

- Colors come only from tokens. Use Tailwind classes built from them (`bg-paper`, `bg-canvas`, `text-ink`, `text-graphite`, `border-rule`, `bg-wash`, `text-blueprint`, `bg-blueprint`, `text-alert`, `text-success`, `bg-signal`, `text-on-signal`) or `var(--token)` in SVG (`var(--panel)`, `var(--panel-line)`, `var(--panel-text)`, `var(--panel-muted)`, `var(--signal)`, `var(--card)`, `var(--card-ink)`, `var(--panel-alert)`, `var(--panel-success)`, `var(--type-cache)` and the other `--type-*` colors). No hex colors in components.
- Visuals that show systems sit on the blueprint panel: a container with classes `on-panel blueprint-grid rounded-panel`, white cards (`var(--card)`), white line work, signal-yellow dots. Reuse the `Diagram` component (`variant="plain"`) when the visual is a component diagram; draw custom SVG only for things it cannot show (a histogram, a bit layout, a map).
- Controls and readouts sit on paper: `ControlPanel`, `Stat` and `SimHeader` from `src/simulators/shared/SimParts.tsx`, and `Slider`, `Toggle`, `Segmented`, `Chip`, `Callout` from `src/design/primitives.tsx`, `Button` from `src/design/Button.tsx`, `LineChart` from `src/simulators/shared/LineChart.tsx` (hairline axes, direct labels, no legends).
- Lucide icons only, at `strokeWidth={1.5}`. Sentence case. Buttons say exactly what happens. No emoji, confetti or sound.
- Radius by hierarchy: `rounded-control` (6 px) for buttons and inputs, `rounded-card` (8 px) for cards, `rounded-panel` (12 px) for panels, `rounded-full` for chips. No shadows on cards.
- Motion explains, never decorates. Read `useReducedMotion()` from `src/state/settings.ts`; when it is true, show discrete states instead of animating.
- Accessibility: every control is labeled and keyboard-operable; every visual has a text alternative (`role="img"` with `aria-label`, or a visible description); color is never the only signal.
- Responsive: works from 375 px to 1920 px with no horizontal page scroll. Test your layout mentally at 375 px: stack controls, wrap readouts, scale SVGs with `viewBox` and `width="100%"`.
- Numbers in readouts and tables use tabular figures (class `tabular`).

## Interview problems

The problem bank is spec section 7; the content model is `Problem` in `src/content/types.ts`; titles, tiers and flagship flags live in `src/content/problem-list.ts`.

- File: `src/content/problems/<problem id>.ts`, default export a `Problem`. Files are found automatically. `id`, `title`, `tier` and `flagship` must match `problem-list.ts`. `minutes` is 45, or 60 for tier 3 problems.
- Check one problem with `npm run check:content -- url-shortener`. A problem is not done until it prints `ok`.
- Titles may name a well-known product as the example ("Design a chat app like WhatsApp"). Never claim that a company asks a question. Problems are generic interview prompts, not part of the Snapgram story; mention Snapgram only to point back at a lesson.

| Field | What the check enforces, and what good looks like |
| --- | --- |
| `prompt` | One to three sentences, short and deliberately vague, as an interviewer says it. |
| `concepts` | At least three lesson ids, the lessons the problem exercises. |
| `hints` | Exactly three, progressive: the first nudges, the third nearly gives the shape of the answer. |
| `clarifyingQuestions` | At least four. `why` says how each answer changes the design. |
| `requirements` | At least three functional, three non-functional and two out of scope. |
| `estimation` | At least three assumptions and three steps (`math` shows the arithmetic, `result` the rounded answer). `calculator` pre-fills the embedded estimation calculator: keys of `EstimationInputs` in `src/simulators/estimation/logic.ts`. |
| `api` | At least two endpoints or method signatures; `signature` is code. |
| `dataModel` | Entities with at least two fields each (fields are code), the chosen store and why. |
| `stages` | At least three, usually v1 "It works", v2 "It scales" and v3 "It survives failures". Each `diagram` is an animated `DiagramSpec` with at least two steps, and passes the same layout check as lesson diagrams (cards, lines, labels and chips, in all three modes). `solves` is the problem this stage fixes; `explanation` is a short note. Designs usually grow with `add` from stage to stage. |
| `deepDives` | Two to four of the hardest parts, each with the problem, a trade-off table (`options.rows`: option, good at, bad at, pick it when; two or more rows) and a recommendation. |
| `failureModes` | At least four: what breaks at 10× and 100× load, and what happens when each major component dies. |
| `levelSignals` | Entry, mid and senior, at least two signals each. |
| `followUps` | At least five, with model answers. Mock interviews show two or three of them during the deep dives, so phrase them as an interviewer would: "The cache cluster just went down. What happens?" |
| `rubric` | At least six items whose weights are whole numbers adding up to 100. Link at least 80% of items to the lesson that teaches them (`lessonId`); missed items become "review next" links. |

Notes from the writers of the six flagship problems (read `src/content/problems/url-shortener.ts` as the model):

- Reading order for the checks is title, prompt, hints, clarifying questions, requirements, estimation, API, data model, stages, deep dives, failure modes, signals, follow-ups, rubric. The title is scanned for acronyms, so a title such as "URL shortener" needs the expansion in the prompt. Entity names and `store` text are scanned; fields and signatures are code and are not. Link a glossary term at its first use in that order, which is often a hint or a clarifying question.
- Nine nodes per diagram is the limit, so plan the v3 layout first and let v1 and v2 grow into it with `add`; a fourth stage is fine when a design has another slice (the URL shortener puts analytics in its own stage). Show failures with `fail`, notes and an added edge rather than new cards.
- A step cannot move a request to another node. To show a replica taking over, `add` an edge for the new path and pin its `fromSide`/`toSide` if needed.
- Flow hops written as objects reverse with `reverse: true`; the `'<'` prefix works only on plain string hops.
- Put notes on cards with few arrows; a note on a card with arrows on several sides can fail the chip check in the compact layout. Edge labels sit best on straight edges.
- Two edges with no card in common may not run along the same line. The router shifts crossing edges apart on its own; when it cannot (two crossing edges whose cards sit at the same heights), stagger the cards by half a row, as lesson 6.5's MapReduce diagram does.
- The calculator treats each request as one stored object. When a problem is not storage-heavy, add an assumption such as "In the calculator: a check counts as a read, a new bucket as a write; ignore the yearly storage line."
- No lesson teaches some problem-specific ideas (adaptive bitrate streaming, virtual waiting rooms); explain them in the problem, and link rubric items to the closest lesson.

The writing rules for lessons apply to every text field: acronyms spelled out at their first use in the problem, no paragraph over four sentences, no banned words, ballpark labels on numbers, no invented statistics. Markdown works as in lessons, including `[text](lesson:id)` and `[[shown text|glossary-id]]` for existing glossary terms. Keep each item tight: one to three sentences. A complete problem usually runs 3,000 to 4,500 words.

## The Snapgram story arc

One story runs through the curriculum: Snapgram, a fictional photo-sharing app that grows from 100 users to 100 million. Each lesson picks up where the last one ended. Recurring characters: the founders (unnamed) and Maya, a friend of the founders who uses Snapgram from Singapore. Snapgram's first servers are in a data center in Oregon.

| Lesson | Where Snapgram is |
| --- | --- |
| 0.1 | An idea for sharing photos. Version one runs on a single server, app and database together, for about 100 users. The lesson previews the road to 100 million. |
| 0.2 | Snapgram is the running example; every module continues its story. |
| 0.3 | "Design a photo-sharing app" is a classic interview prompt, and Snapgram is that app. |
| 1.1 | A few weeks old, one server in Oregon, a few hundred users. Maya says pages take almost a second. (written) |
| 1.2 | The founders rent their first server: a public IP address, the web server on port 443, the database on port 5432 reachable only from the server itself. |
| 1.3 | They buy snapgram.com and point it at the server. Later they move to a new server, and some users reach the old one for hours because of a long TTL. |
| 1.4 | Photos and pages travel over TCP. The team adds live video of events, where retransmitted packets cause stalls; UDP-based delivery keeps it live. |
| 1.5 | The mobile app speaks HTTP: liking a photo, status codes, a cookie that keeps you logged in. |
| 1.6 | A public API for partners (REST), a mobile profile screen that needs one round trip (GraphQL), internal services talking gRPC; cursor pagination for the photo grid. |
| 1.7 | Notifications when someone likes your photo: polling every few seconds drains batteries, so the app moves to a push connection; webhooks for partners. |
| 2.1 | About 100,000 daily users. Uploads feel slow at peak: latency, throughput and bandwidth are different problems. |
| 2.2 | The average page loads in 200 ms, but one load in a hundred takes 3 seconds; the home page fans out to ten backend calls. |
| 2.3 | The single server crashed on a Saturday and Snapgram was down for four hours. How many nines is that? |
| 2.4 | The server runs out of headroom. First a bigger machine, then more machines. |
| 2.5 | Why reading from memory beats reading from disk, and both beat crossing an ocean. |
| 2.6 | Planning for one million daily users: requests per second, storage per year, bandwidth, cache size. |
| 2.7 | The team argues about how fresh like counts must be, and what it costs. |
| 3.1 | Snapgram adds a second app server; users get logged out at random because sessions live in one server's memory. |
| 3.2 | Traffic is spread across several app servers. One dies; health checks take it out of rotation. |
| 3.3 | Snapgram splits into a few services; the mobile app talks to one gateway that handles TLS, login checks, rate limits and routing. |
| 3.4 | About two million daily users; popular profiles hammer the database. (written) |
| 3.5 | Photos are viewed worldwide; Maya in Singapore again, now served from a nearby edge. |
| 3.6 | Likes and comments live in tables. Paid "boosts" move credits between accounts, which must never half-happen. |
| 3.7 | Different data wants different stores: users in SQL, the activity feed in a wide-column store, sessions in a key-value store. |
| 3.8 | "All photos by one user" takes seconds on a table of 50 million rows, until an index fixes it. |
| 3.9 | Photos on the app server's disk fill it up; they move to object storage, with metadata in the database and uploads through pre-signed URLs. |
| 3.10 | Making thumbnails during the upload makes uploads slow; a celebrity post brings a spike; a queue absorbs it, and a broken file lands in a dead-letter queue. |
| 3.11 | Users want to search captions and hashtags; `LIKE '%sunset%'` scans hundreds of millions of rows; an inverted index fixes it. |
| 3.12 | Photo data is split across several databases; auto-increment IDs collide; Snowflake-style IDs sort by time. |
| 4.1 | About 10 million daily users, with photo data split across four databases (3.12). Each database is still one machine: a disk failure would lose data, and profile reads swamp it. Each gets a leader and two followers in Oregon, and reads move to the followers. One night a leader’s disk dies and a follower is promoted; with asynchronous replication, the last second of likes is lost. |
| 4.2 | Maya edits her caption, refreshes, and sees the old one: the read went to a lagging follower. A new comment appears, then vanishes on the next refresh. Fixes: read your own profile from the leader for a minute after changing it, and pin each user’s reads to one follower. |
| 4.3 | How the four-way split from 3.12 works. Hashing the user ID spreads data evenly; splitting by signup date would send every new user’s writes to one database; a celebrity account makes one shard hot. “All photos tagged #sunset” must ask every shard. Growing from four shards to eight means moving data. |
| 4.4 | The cache cluster from 3.4 grows from four nodes to five. With `hash % N`, about four keys in five move to a different node, and the misses hit the database at once. A hash ring moves about a fifth; virtual nodes even out the load. |
| 4.5 | Snapgram runs a second region in Singapore (the one GeoDNS sent Maya to in 1.3), and its databases replicate with Oregon. The link across the Pacific fails for 20 minutes: Singapore can keep accepting writes and merge later, or refuse writes it cannot confirm. Likes choose availability; unique usernames and boost credits choose consistency. Even with no failure, waiting for Oregon adds a trans-Pacific round trip, roughly 150 to 200 ms, to every write (PACELC). |
| 4.6 | Which Snapgram features need which guarantee: boost credit balances need strong consistency; like counts can be eventually consistent; a reply must never appear before the comment it answers (causal); your own new post must show up on your profile at once (read-your-writes). |
| 4.7 | The activity store (the wide-column store from 3.7) keeps three copies of each event, with no leader. With N = 3, W = 2 and R = 2, every read overlaps the latest write; view counts use W = 1 for speed. |
| 4.8 | Snapgram Prints launches: order a printed photo book. An order touches the order service, the payment service and an outside print shop. If the print shop rejects the order, the payment must be refunded (a saga’s compensating action). Two-phase commit would block if its coordinator died; a transactional outbox makes sure the “order placed” event is never lost. |
| 4.9 | The profile page shows follower, post and like counts. Counting rows on every view is too slow at this size, so the counts are stored with the profile and updated on every write, and a profile read model is kept up to date from events. Counters can drift; a nightly recount repairs them. |
| 5.1 | About 30 million daily users and dozens of services in two regions. A photo upload touches six services, and the call to the thumbnail service times out: did it make the thumbnail or not? Messages get lost, delayed and duplicated; the fallacies of distributed computing. |
| 5.2 | The profile service slows down for a minute. Every app retries at once, three times, and load triples, so the service cannot recover even after the cause is fixed: a retry storm. Timeouts, exponential backoff with jitter, and a retry budget fix it. |
| 5.3 | Snapgram Prints again: Maya taps “Pay” on a train with a flaky connection. The charge succeeds but the response is lost; the app retries, and her card is charged twice. An idempotency key makes the retry safe. |
| 5.4 | The “Suggested for you” service goes down, and every home feed waits for it and times out. A circuit breaker stops calling it, the feed loads without suggestions (graceful degradation), and a separate connection pool (a bulkhead) keeps it from starving everything else. |
| 5.5 | A scraper hammers the partner API from 1.6, and a buggy app version sends likes in a tight loop. A token bucket per API key and per user, enforced at the gateway from 3.3, with counters shared in Redis across gateway instances. |
| 5.6 | Comments are written in both regions and sorted by server time. A Singapore clock running 300 ms fast puts a reply before the comment it answers. Logical clocks order them correctly; version vectors catch two edits made at the same time. |
| 5.7 | Failover from 4.1 needs exactly one leader. During a network glitch, two database nodes both act as leader (split brain). A majority vote, as in Raft, allows only one leader per term; Snapgram keeps leader records in etcd. |
| 5.8 | The cache cluster has 200 nodes. Which are alive? One central checker cannot keep up: heartbeats with timeouts detect failures, and gossip spreads the news to every node in a few rounds. A long pause makes a healthy node look dead. |
| 5.9 | The weekly “your week in photos” email job runs on several workers, and some users get it twice. A lock with a lease fixes that, until a worker pauses for 15 seconds, its lease expires, and it wakes up still thinking it holds the lock. Fencing tokens make storage reject the stale worker. |
| 5.10 | “Has Maya already seen this photo?” across billions of user and photo pairs (a Bloom filter); unique viewers per photo in a few kilobytes (HyperLogLog); trending hashtags (a Count-Min Sketch for the top K). |
| 6.1 | About 50 million daily users and 300 engineers in one codebase. A deploy takes hours and one team’s bug blocks everyone. The team first splits the code into modules with clear owners, then pulls out a few services (photos, feed, notifications, Prints payments), and learns what network calls, operations and data ownership cost. |
| 6.2 | Forty services whose instances come and go with autoscaling, so hard-coded addresses break. A registry lets services find each other; quick lookups stay synchronous (REST or gRPC) while slower work moves to events; a service mesh in one paragraph. |
| 6.3 | One upload has to trigger thumbnails, feed updates, notifications, search indexing and moderation. The upload service publishes one “photo uploaded” event and each service subscribes. Then the pitfalls: a notification arrives before the photo is visible, duplicates, and debugging a chain nobody owns. |
| 6.4 | Snapgram Prints orders are stored as events (placed, paid, printed, shipped, refunded). Support asks what happened to an order, and the team replays its events; the order status page reads from a separate read model. Likes, by contrast, need none of this. |
| 6.5 | The “year in photos” recap is built by a nightly batch job, while trending hashtags come from a stream with five-minute windows. Phones that were offline upload late, so some events arrive after their window has closed. |
| 6.6 | The home feed. Copying each new post into every follower’s feed (fan-out on write) makes reads fast, until a celebrity with 30 million followers posts. Building the feed at read time is cheap to write but slow to read. Snapgram goes hybrid: push for most accounts, pull for celebrities. |
| 6.7 | “Photos near me”: finding posts within a kilometer of Maya in Singapore. Latitude and longitude ranges are slow to query; geohashes and quadtrees split the map, finer where it is crowded. |
| 6.8 | Shared albums: Maya and a friend edit the same album description at the same moment, and with last write wins one edit vanishes. Operational transformation and CRDTs keep both, and presence shows who else is editing. |
| 7.1 | About 100 million daily users. People say the feed is slow, but the dashboards look normal. Logs, metrics and a trace waterfall find the slow call; the four golden signals; alerts that fire when the SLO is at risk, not on every blip. |
| 7.2 | Logging in with a password, sessions vs. tokens, “Sign in with Google” through OAuth 2.0, TLS everywhere, photos encrypted at rest, secrets kept out of code, services with least privilege, and a credential-stuffing attack slowed by the rate limits from 5.5. |
| 7.3 | A bad deploy took the feed down for 20 minutes. Rolling, blue-green and canary releases; a feature flag for shared albums; renaming a database column with expand-and-contract, without downtime. |
| 7.4 | The Oregon region has a long outage. Active-passive vs. active-active (Singapore from 4.5), RPO and RTO, backups that are restored in regular tests, and data residency: European users’ photos stay in a new Frankfurt region. |
| 7.5 | The cloud bill: compute, storage tiers (old photos move to colder, cheaper storage) and data transfer, with rough relative costs taken from public price lists, and how cost shapes design choices. |
| 8.1 | Snapgram is hiring engineers, and Maya, the friend in Singapore who has used Snapgram since its first weeks, applies. In her first practice interview she spends 25 minutes on requirements and never draws a design. The six-step framework and its 45-minute budget. |
| 8.2 | The prompt is “Design a photo-sharing app.” The questions that change the design (scale, read/write ratio, latency, consistency, geography), and scoping things out so the design fits in the time. |
| 8.3 | In her second practice round Maya computes storage to the byte and loses ten minutes: what to estimate, how to round, and when to skip. |
| 8.4 | The minimum API for posting and viewing photos, then choosing storage and a schema, with the reasons said out loud. |
| 8.5 | Two practice whiteboards for the same prompt: a tangle of fifteen boxes, and a simple design walked through with one request, every arrow labeled. |
| 8.6 | The interviewer asks, “The feed cache just died. What happens?” Maya learns to pick the two or three hardest parts and lead the deep dives instead of waiting to be asked. |
| 8.7 | Snapgram’s own decisions (how fresh like counts must be in 2.7, fan-out in 6.6) turned into the trade-off template, so Maya can say them in one breath. |
| 8.8 | The same prompt answered at entry, mid, senior and staff levels; Maya is interviewing for a mid-level role. |
| 8.9 | Transcripts from practice interviews, each showing one classic mistake, and then Maya’s real interview, done right. |

## Before you report

- `npm run check:content -- <your lesson ids>` prints `ok` for every lesson.
- `npx vitest run` passes for your simulator and widget folders.
- `npx tsc -p tsconfig.app.json --noEmit` shows no errors in your files.
- Real-world sources are verified, and every number is ballpark-labeled or sourced.
- In your report: what you wrote, any spec item you could not meet and why, any change you need in a file you do not own, and any glossary id you suspect another group also defined.
