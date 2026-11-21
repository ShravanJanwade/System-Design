/**
 * Build-time content check (blueprint sections 15 and 18).
 * Fails the build when a lesson, a problem or the glossary misses its definition of done,
 * so nothing incomplete ships. Runs in `npm run build` and in the test suite.
 */
import type { Block, DecisionNode, DecisionResult, DiagramSpec, Lesson, Problem, Question, SequenceSpec } from '../types';
import { SIMULATOR_IDS, WIDGET_IDS } from '../types';
import { allLessonOutlines, getOutline } from '../modules';
import { problemList } from '../problem-list';
import { glossary, glossaryById } from '../glossary';
import { acronyms, notAcronyms } from '../acronyms';
import { countSentences, linkHrefs, mdToPlain, parseMd, inlineToPlain, termIds } from '../../lib/md';
import { lintDiagram } from '../../diagram/chips';
import { chooseLayout } from '../../diagram/fit';
import { layoutDiagram } from '../../diagram/layout';
import { PHONE_COMPARE_PANEL, PHONE_MIN_SCALE, PHONE_PANEL } from '../../diagram/phone';

export { PHONE_COMPARE_PANEL, PHONE_MIN_SCALE, PHONE_PANEL };

const BANNED = [
  'delve',
  'robust',
  'leverage',
  'seamless',
  'cutting-edge',
  'cutting edge',
  'it’s important to note',
  "it's important to note",
  'in conclusion',
  'unlock your potential',
  'supercharge',
  'elevate',
  'game-changer',
  'game changer',
  'lorem',
  'ipsum',
  'coming soon',
  'todo',
  'tbd',
];

const EMOJI = /\p{Extended_Pictographic}/u;
const outlineIndex = new Map(allLessonOutlines.map((l, i) => [l.id, i]));

/* ------------------------------------------------------------------ */
/* Text extraction, in the order a reader meets it                     */
/* ------------------------------------------------------------------ */

export type Seg = { where: string; md: string; prose: boolean };

export function questionSegs(q: Question, where: string): Seg[] {
  const out: Seg[] = [{ where: `${where} prompt`, md: q.prompt, prose: true }];
  switch (q.kind) {
    case 'single':
    case 'multi':
      q.options.forEach((o, i) => {
        out.push({ where: `${where} option ${i + 1}`, md: o.text, prose: false });
        out.push({ where: `${where} option ${i + 1} explanation`, md: o.why, prose: true });
      });
      break;
    case 'order':
      q.items.forEach((it, i) => out.push({ where: `${where} item ${i + 1}`, md: it, prose: false }));
      out.push({ where: `${where} explanation`, md: q.why, prose: true });
      break;
    case 'numeric':
      q.solution.forEach((s, i) => out.push({ where: `${where} solution line ${i + 1}`, md: s, prose: true }));
      break;
    case 'bottleneck':
      out.push({ where: `${where} explanation`, md: q.why, prose: true });
      for (const [id, why] of Object.entries(q.others)) out.push({ where: `${where} note for ${id}`, md: why, prose: true });
      break;
  }
  return out;
}

function decisionSegs(node: DecisionNode | DecisionResult, where: string): Seg[] {
  if (node.kind === 'result') return [{ where, md: `${node.title}. ${node.why}`, prose: true }];
  const out: Seg[] = [{ where, md: node.question, prose: true }];
  if (node.help) out.push({ where, md: node.help, prose: true });
  for (const o of node.options) {
    out.push({ where, md: o.label, prose: false });
    out.push(...decisionSegs(o.next, where));
  }
  return out;
}

export function blockSegs(b: Block, where: string): Seg[] {
  switch (b.kind) {
    case 'prose':
    case 'callout':
      return [{ where, md: b.md, prose: true }];
    case 'heading':
      return [{ where, md: b.text, prose: false }];
    case 'diagram':
      return [
        ...(b.title ? [{ where: `${where} title`, md: b.title, prose: false }] : []),
        { where: `${where} caption`, md: b.caption, prose: true },
        ...(b.spec.steps ?? []).flatMap((s, i) => [
          { where: `${where} step ${i + 1}`, md: s.caption, prose: true },
          ...(s.notes ?? []).map((n) => ({ where: `${where} step ${i + 1} note`, md: n.text, prose: false })),
        ]),
      ];
    case 'sequence':
      return [
        ...(b.title ? [{ where: `${where} title`, md: b.title, prose: false }] : []),
        { where: `${where} caption`, md: b.caption, prose: true },
        ...b.spec.messages.map((m, i) => ({ where: `${where} message ${i + 1}`, md: m.caption, prose: true })),
      ];
    case 'decision':
      return [{ where: `${where} title`, md: b.title, prose: false }, ...(b.caption ? [{ where, md: b.caption, prose: true }] : []), ...decisionSegs(b.tree, `${where} flowchart`)];
    case 'table':
      return [...b.rows.flatMap((r) => r.map((c) => ({ where: `${where} cell`, md: c, prose: true }))), ...(b.caption ? [{ where: `${where} caption`, md: b.caption, prose: true }] : [])];
    case 'compare':
      return [
        ...[b.left, b.right].flatMap((s) => [
          { where, md: s.title, prose: false },
          ...(s.summary ? [{ where, md: s.summary, prose: true }] : []),
          ...s.points.map((p) => ({ where, md: p, prose: true })),
          ...(s.verdict ? [{ where, md: s.verdict, prose: true }] : []),
        ]),
        ...(b.caption ? [{ where: `${where} caption`, md: b.caption, prose: true }] : []),
      ];
    case 'numbers':
      return [...b.items.flatMap((it) => [{ where, md: `${it.label} ${it.value} ${it.note ?? ''}`, prose: false }]), ...(b.caption ? [{ where: `${where} caption`, md: b.caption, prose: true }] : [])];
    case 'code':
      return b.caption ? [{ where: `${where} caption`, md: b.caption, prose: true }] : [];
    case 'annotated':
      return [
        ...(b.title ? [{ where: `${where} title`, md: b.title, prose: false }] : []),
        ...(b.caption ? [{ where: `${where} caption`, md: b.caption, prose: true }] : []),
        ...b.lines.flatMap((line, i) => (line.note ? [{ where: `${where} note ${i + 1}`, md: line.note, prose: true }] : [])),
      ];
    case 'simulator':
      return b.intro ? [{ where: `${where} intro`, md: b.intro, prose: true }] : [];
    case 'widget':
      return [...(b.title ? [{ where: `${where} title`, md: b.title, prose: false }] : []), { where: `${where} caption`, md: b.caption, prose: true }];
    case 'quickCheck':
      return questionSegs(b.question, `${where} quick check`);
  }
}

/** Every piece of text a reader sees, in reading order. */
export function lessonSegments(l: Lesson, opts: { includeDeeper?: boolean; includeQuiz?: boolean } = {}): Seg[] {
  const { includeDeeper = true, includeQuiz = true } = opts;
  const segs: Seg[] = [
    { where: 'title', md: l.title, prose: false },
    { where: 'idea', md: l.idea, prose: true },
    ...l.outcomes.map((o, i) => ({ where: `outcome ${i + 1}`, md: o, prose: true })),
    { where: 'analogy title', md: l.analogy.title, prose: false },
    { where: 'analogy', md: l.analogy.body, prose: true },
    { where: 'why it matters', md: l.whyItMatters, prose: true },
    ...l.body.flatMap((b, i) => blockSegs(b, `body block ${i + 1} (${b.kind})`)),
    ...(l.tryIt ?? []).flatMap((b, i) => blockSegs(b, `try it block ${i + 1} (${b.kind})`)),
  ];
  if (l.tradeoffs) {
    if (l.tradeoffs.caption) segs.push({ where: 'trade-offs caption', md: l.tradeoffs.caption, prose: true });
    l.tradeoffs.rows.forEach((r, i) => {
      segs.push({ where: `trade-off row ${i + 1}`, md: r.option, prose: false });
      for (const c of [r.goodAt, r.badAt, r.pickWhen]) segs.push({ where: `trade-off row ${i + 1}`, md: c, prose: true });
    });
  }
  if (l.realWorld) {
    segs.push({ where: 'real world title', md: l.realWorld.title, prose: false });
    segs.push({ where: 'real world', md: l.realWorld.body, prose: true });
  }
  segs.push({ where: 'when to mention', md: l.interview.whenToMention, prose: true });
  l.interview.sayItLikeThis.forEach((s, i) => segs.push({ where: `say it like this ${i + 1}`, md: s, prose: true }));
  l.interview.followUps.forEach((f, i) => {
    segs.push({ where: `follow-up ${i + 1} question`, md: f.q, prose: true });
    segs.push({ where: `follow-up ${i + 1} answer`, md: f.a, prose: true });
  });
  l.interview.redFlags.forEach((r, i) => segs.push({ where: `red flag ${i + 1}`, md: r, prose: true }));
  l.mistakes.forEach((m, i) => segs.push({ where: `mistake ${i + 1}`, md: m, prose: true }));
  if (includeQuiz) l.quiz.forEach((q, i) => segs.push(...questionSegs(q, `quiz question ${i + 1}`)));
  l.takeaways.forEach((t, i) => segs.push({ where: `takeaway ${i + 1}`, md: t, prose: true }));
  if (includeDeeper) (l.deeper ?? []).forEach((b, i) => segs.push(...blockSegs(b, `go deeper block ${i + 1}`)));
  return segs;
}

function plainForScan(md: string): string {
  return mdToPlain(md.replace(/`[^`]*`/g, ' '));
}

/* ------------------------------------------------------------------ */
/* Individual checks                                                   */
/* ------------------------------------------------------------------ */

export function checkAcronyms(l: Lesson): string[] {
  return acronymProblems(lessonSegments(l));
}

/** Every acronym must be spelled out near its first use, in reading order across the segments. */
export function acronymProblems(segs: Seg[]): string[] {
  const problems: string[] = [];
  const full = segs.map((s) => plainForScan(s.md)).join('\n');
  const seen = new Set<string>();
  const re = /\b([A-Z]{2,})s?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(full))) {
    const word = m[1]!;
    if (seen.has(word) || notAcronyms.has(word)) continue;
    seen.add(word);
    const expansions = acronyms[word];
    if (!expansions) {
      problems.push(`uses "${word}", which is not in content/acronyms.ts. Add it with its expansion, or rephrase.`);
      continue;
    }
    const window = full.slice(Math.max(0, m.index - 160), m.index + word.length + 160).toLowerCase();
    if (!expansions.some((e) => window.includes(e.toLowerCase()))) {
      problems.push(`does not spell out "${word}" (${expansions[0]}) at its first use: "…${full.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}…"`);
    }
  }
  return problems;
}

export function checkSentences(l: Lesson): string[] {
  return sentenceProblems(lessonSegments(l));
}

/** No paragraph or list item in prose may run past four sentences. */
export function sentenceProblems(segs: Seg[]): string[] {
  const problems: string[] = [];
  for (const seg of segs) {
    if (!seg.prose) continue;
    for (const block of parseMd(seg.md.replace(/`[^`]*`/g, 'code'))) {
      const paragraphs = block.t === 'p' ? [inlineToPlain(block.c)] : block.items.map(inlineToPlain);
      for (const p of paragraphs) {
        const n = countSentences(p);
        if (n > 4) problems.push(`${seg.where}: a paragraph has ${n} sentences (the limit is four): "${p.slice(0, 70)}…"`);
      }
    }
  }
  return problems;
}

export function checkWording(l: Lesson): string[] {
  const problems = wordingProblems(lessonSegments(l));
  for (const f of l.flashcards) if (EMOJI.test(f.front + f.back)) problems.push('a flashcard contains an emoji');
  return problems;
}

/** Banned words and emoji. */
export function wordingProblems(segs: Seg[]): string[] {
  const problems: string[] = [];
  for (const seg of segs) {
    const text = seg.md.toLowerCase();
    for (const banned of BANNED) {
      const re = new RegExp(`(^|[^a-z])${banned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
      if (re.test(text)) problems.push(`${seg.where}: avoid "${banned}"`);
    }
    if (EMOJI.test(seg.md)) problems.push(`${seg.where}: contains an emoji`);
  }
  return problems;
}

export function checkDiagram(spec: DiagramSpec, where: string, phoneWidth = PHONE_PANEL): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const n of spec.nodes) {
    if (ids.has(n.id)) problems.push(`${where}: duplicate id "${n.id}"`);
    ids.add(n.id);
    if (n.x < 0 || n.y < 0 || n.x > spec.grid.cols - 1 || n.y > spec.grid.rows - 1) problems.push(`${where}: node "${n.id}" is outside the grid`);
  }
  for (const e of spec.edges) {
    if (ids.has(e.id)) problems.push(`${where}: duplicate id "${e.id}"`);
    ids.add(e.id);
    if (!spec.nodes.some((n) => n.id === e.from)) problems.push(`${where}: edge "${e.id}" starts at unknown node "${e.from}"`);
    if (!spec.nodes.some((n) => n.id === e.to)) problems.push(`${where}: edge "${e.id}" ends at unknown node "${e.to}"`);
  }
  if (spec.nodes.length > 9) problems.push(`${where}: ${spec.nodes.length} nodes; beginner diagrams stay at about nine. Split it into stages.`);
  const edgeIds = new Set(spec.edges.map((e) => e.id));
  spec.steps?.forEach((s, i) => {
    const at = `${where} step ${i + 1}`;
    for (const id of [...(s.focus ?? []), ...(s.add ?? []), ...(s.fail ?? [])]) if (!ids.has(id)) problems.push(`${at}: unknown id "${id}"`);
    for (const note of s.notes ?? []) if (!ids.has(note.target)) problems.push(`${at}: note targets unknown id "${note.target}"`);
    for (const item of s.flow ?? []) {
      for (const hop of Array.isArray(item) ? item : [item]) {
        const edge = typeof hop === 'string' ? hop.replace(/^</, '') : hop.edge;
        if (!edgeIds.has(edge)) problems.push(`${at}: flow uses unknown edge "${edge}"`);
      }
    }
  });
  if (problems.length === 0) {
    for (const p of lintDiagram(spec)) problems.push(`${where}: ${p}`);
    const layouts = { wide: layoutDiagram(spec, 'wide'), compact: layoutDiagram(spec, 'compact'), narrow: layoutDiagram(spec, 'narrow') };
    const fit = chooseLayout(layouts, phoneWidth);
    if (fit.scale < PHONE_MIN_SCALE) {
      problems.push(
        `${where}: on a 375 px phone it draws at ${Math.round(fit.scale * 100)}%, so labels shrink to about ${Math.round(14 * fit.scale)} px. ` +
          `Give it a \`narrow\` layout at most ${Math.floor(phoneWidth / PHONE_MIN_SCALE)} px wide (it is ${layouts.narrow.width} px now): ` +
          `usually three columns or fewer, with labeled edges running top to bottom.`,
      );
    }
  }
  return problems;
}

function checkSequence(spec: SequenceSpec, where: string): string[] {
  const problems: string[] = [];
  const ids = new Set(spec.actors.map((a) => a.id));
  spec.messages.forEach((m, i) => {
    if (!ids.has(m.from) || !ids.has(m.to)) problems.push(`${where}: message ${i + 1} uses an unknown actor`);
    if (!m.caption.trim()) problems.push(`${where}: message ${i + 1} has no caption`);
  });
  for (const g of spec.groups ?? []) {
    if (g.from < 1 || g.to > spec.messages.length || g.from > g.to) problems.push(`${where}: group "${g.label}" is out of range`);
  }
  return problems;
}

function checkDecision(node: DecisionNode | DecisionResult, where: string): string[] {
  if (node.kind === 'result') {
    const problems: string[] = [];
    if (!node.why.trim()) problems.push(`${where}: result "${node.title}" has no reason`);
    if (node.lessonId && !getOutline(node.lessonId)) problems.push(`${where}: result links unknown lesson "${node.lessonId}"`);
    return problems;
  }
  const problems = node.options.length < 2 ? [`${where}: question "${node.question}" needs at least two options`] : [];
  for (const o of node.options) problems.push(...checkDecision(o.next, where));
  return problems;
}

export function checkQuestion(q: Question, where: string): string[] {
  const problems: string[] = [];
  if (!q.prompt.trim()) problems.push(`${where}: empty prompt`);
  switch (q.kind) {
    case 'single':
    case 'multi': {
      const correct = q.options.filter((o) => o.correct).length;
      if (q.options.length < 3) problems.push(`${where}: needs at least three options`);
      if (q.kind === 'single' && correct !== 1) problems.push(`${where}: a single-choice question needs exactly one correct option`);
      if (q.kind === 'multi' && correct < 1) problems.push(`${where}: a multiple-choice question needs a correct option`);
      q.options.forEach((o, i) => !o.why.trim() && problems.push(`${where}: option ${i + 1} has no explanation`));
      break;
    }
    case 'order':
      if (q.items.length < 3) problems.push(`${where}: an ordering question needs at least three items`);
      if (!q.why.trim()) problems.push(`${where}: needs an explanation`);
      break;
    case 'numeric':
      if (!(q.tolerance > 1)) problems.push(`${where}: tolerance must be a ratio above 1`);
      if (q.solution.length === 0) problems.push(`${where}: needs a worked solution`);
      break;
    case 'bottleneck': {
      if (!q.diagram.nodes.some((n) => n.id === q.answerNodeId)) problems.push(`${where}: the answer node does not exist`);
      for (const n of q.diagram.nodes) {
        if (n.id !== q.answerNodeId && !q.others[n.id]?.trim()) problems.push(`${where}: no explanation for picking "${n.id}"`);
      }
      if (!q.why.trim()) problems.push(`${where}: needs an explanation`);
      problems.push(...checkDiagram(q.diagram, `${where} diagram`));
      break;
    }
  }
  return problems;
}

function visualBlocks(blocks: Block[]) {
  return blocks.filter((b) => b.kind === 'diagram' || b.kind === 'sequence');
}

function isAnimated(b: Block): boolean {
  return (b.kind === 'diagram' && (b.spec.steps?.length ?? 0) >= 2) || b.kind === 'sequence';
}

/** Rough reading time: words at 200 per minute, plus time for diagrams, simulators and questions. */
export function estimateMinutes(l: Lesson): number {
  const words = lessonSegments(l, { includeDeeper: false, includeQuiz: false })
    .map((s) => plainForScan(s.md).split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0);
  const steps = l.body.reduce((n, b) => n + (b.kind === 'diagram' ? (b.spec.steps?.length ?? 0) : b.kind === 'sequence' ? b.spec.messages.length : 0), 0);
  const all = [...l.body, ...(l.tryIt ?? [])];
  const sims = all.filter((b) => b.kind === 'simulator').length + all.filter((b) => b.kind === 'widget').length * 0.75;
  return words / 200 + steps * 0.15 + sims * 2 + l.quiz.length * 0.4;
}

export function checkLesson(l: Lesson): string[] {
  const p: string[] = [];
  const outline = getOutline(l.id);
  if (!outline) return [`is not in the curriculum outline (content/modules.ts)`];
  if (outline.module !== l.module || outline.order !== l.order) p.push(`module/order (${l.module}, ${l.order}) disagree with the outline (${outline.module}, ${outline.order})`);
  if (outline.title !== l.title) p.push(`title "${l.title}" disagrees with the outline "${outline.title}"`);
  if (outline.minutes !== l.minutes) p.push(`reading time ${l.minutes} disagrees with the outline (${outline.minutes})`);
  if (JSON.stringify(outline.prerequisites) !== JSON.stringify(l.prerequisites)) p.push('prerequisites disagree with the outline');

  // Header
  if (l.minutes < 8 || l.minutes > 15) p.push(`reading time must be 8 to 15 minutes, not ${l.minutes}`);
  if (countSentences(mdToPlain(l.idea)) !== 1) p.push('the idea must be one sentence');
  if (l.outcomes.length < 2 || l.outcomes.length > 3) p.push('needs two or three outcomes');
  for (const id of l.prerequisites) {
    if (!getOutline(id)) p.push(`unknown prerequisite "${id}"`);
    else if ((outlineIndex.get(id) ?? 0) >= (outlineIndex.get(l.id) ?? 0)) p.push(`prerequisite "${id}" comes after this lesson`);
  }

  // Analogy and story
  if (!l.analogy.title.trim() || !l.analogy.body.trim()) p.push('needs an analogy');
  if (!/snapgram/i.test(l.whyItMatters)) p.push('"Why it matters" must continue the Snapgram story');

  // How it works and Try it
  const how = l.body;
  if (l.body.some((b) => b.kind === 'simulator')) p.push('simulators belong in tryIt, not in body');
  if (l.tryIt && l.tryIt.length && !l.tryIt.some((b) => b.kind === 'simulator' || b.kind === 'widget')) {
    p.push('"Try it" needs a simulator or a widget');
  }
  for (const b of [...l.body, ...(l.tryIt ?? []), ...(l.deeper ?? [])]) {
    if (b.kind === 'simulator' && !SIMULATOR_IDS.includes(b.id)) p.push(`unknown simulator "${b.id}"`);
    if (b.kind === 'widget' && !(WIDGET_IDS as readonly string[]).includes(b.id)) p.push(`unknown widget "${b.id}"`);
    if (b.kind === 'annotated' && b.lines.length === 0) p.push('an annotated block needs lines');
  }
  const visuals = visualBlocks([...l.body, ...(l.tryIt ?? []), ...(l.deeper ?? [])]);
  if (visuals.length < 2) p.push(`needs at least two diagrams; found ${visuals.length}`);
  const stepped = how.filter((b) => isAnimated(b));
  if (stepped.length === 0) p.push('"How it works" needs an animated step-through diagram');
  const main = how.find((b) => b.kind === 'diagram' && (b.spec.steps?.length ?? 0) >= 2);
  if (main && main.kind === 'diagram') {
    const n = main.spec.steps!.length;
    if (n < 3 || n > 6) p.push(`the main "How it works" diagram has ${n} steps; the template asks for 3 to 6`);
  }
  if (![...l.body, ...(l.deeper ?? [])].some((b) => b.kind === 'callout' && b.tone === 'simplification')) {
    p.push('needs a "Simplification" callout that says what was left out');
  }

  // Trade-offs, real world, interview
  if (['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'].includes(l.module) && !l.tradeoffs) p.push('needs a trade-off table');
  if (l.tradeoffs && l.tradeoffs.rows.length < 2) p.push('the trade-off table needs at least two options');
  if (l.realWorld && l.realWorld.sourceUrl && !l.realWorld.sourceUrl.startsWith('https://')) p.push('the real-world source must be an https link');
  if (!l.interview.whenToMention.trim()) p.push('"In the interview" needs "when to bring it up"');
  if (l.interview.sayItLikeThis.length < 2) p.push('needs at least two "Say it like this" sentences');
  if (l.interview.followUps.length !== 3) p.push(`needs exactly three follow-up questions; found ${l.interview.followUps.length}`);
  if (l.interview.redFlags.length < 2) p.push('needs at least two red flags');

  // Mistakes, quiz, takeaways, flashcards
  if (l.mistakes.length < 3 || l.mistakes.length > 5) p.push(`needs 3 to 5 common mistakes; found ${l.mistakes.length}`);
  if (l.quiz.length < 4 || l.quiz.length > 6) p.push(`needs 4 to 6 quiz questions; found ${l.quiz.length}`);
  if (new Set(l.quiz.map((q) => q.kind)).size < 2) p.push('quiz questions must mix at least two types');
  l.quiz.forEach((q, i) => p.push(...checkQuestion(q, `quiz question ${i + 1}`)));
  if (l.takeaways.length !== 3) p.push('needs exactly three takeaways');
  if (l.flashcards.length < 5 || l.flashcards.length > 8) p.push(`needs 5 to 8 flashcards; found ${l.flashcards.length}`);
  l.flashcards.forEach((f, i) => (!f.front.trim() || !f.back.trim()) && p.push(`flashcard ${i + 1} is empty`));

  // Links and glossary
  for (const id of l.related) if (!getOutline(id)) p.push(`unknown related lesson "${id}"`);
  const allMd = lessonSegments(l).map((s) => s.md);
  for (const href of allMd.flatMap(linkHrefs)) {
    if (href.startsWith('lesson:') && !getOutline(href.slice(7))) p.push(`links to unknown lesson "${href}"`);
  }
  const referenced = new Set(allMd.flatMap(termIds));
  for (const id of referenced) {
    const term = glossaryById.get(id);
    if (!term) p.push(`links glossary term "${id}", which does not exist`);
  }
  for (const id of l.glossaryTerms) {
    if (!glossaryById.has(id)) p.push(`key term "${id}" is not in the glossary`);
    else if (!referenced.has(id)) p.push(`key term "${id}" is never linked in the text`);
  }
  for (const id of referenced) if (!l.glossaryTerms.includes(id)) p.push(`links "${id}" but does not list it in glossaryTerms`);

  // Diagrams, sequences and flowcharts
  [...l.body, ...(l.tryIt ?? []), ...(l.deeper ?? [])].forEach((b, i) => {
    if (b.kind === 'diagram') p.push(...checkDiagram(b.spec, `diagram "${b.title ?? `block ${i + 1}`}"`));
    if (b.kind === 'compare') {
      for (const side of [b.left, b.right]) if (side.diagram) p.push(...checkDiagram(side.diagram, `diagram in "${side.title}"`, PHONE_COMPARE_PANEL));
    }
    if (b.kind === 'sequence') p.push(...checkSequence(b.spec, `sequence "${b.title ?? `block ${i + 1}`}"`));
    if (b.kind === 'decision') p.push(...checkDecision(b.tree, `flowchart "${b.title}"`));
    if (b.kind === 'quickCheck') p.push(...checkQuestion(b.question, `quick check ${i + 1}`));
  });

  // Writing rules
  p.push(...checkAcronyms(l), ...checkSentences(l), ...checkWording(l));

  const est = estimateMinutes(l);
  if (Math.abs(est - l.minutes) > 5) p.push(`says ${l.minutes} minutes, but reads in about ${est.toFixed(1)}`);

  return p;
}

/* ------------------------------------------------------------------ */
/* Problems (blueprint sections 7 and 18)                              */
/* ------------------------------------------------------------------ */

const code = (s: string) => `\`${s}\``;

/** A problem's text in the order the problem page shows it. Signatures and fields count as code. */
export function problemSegments(p: Problem): Seg[] {
  const s: Seg[] = [
    { where: 'title', md: p.title, prose: false },
    { where: 'prompt', md: p.prompt, prose: true },
    ...p.hints.map((h, i) => ({ where: `hint ${i + 1}`, md: h, prose: true })),
    ...p.clarifyingQuestions.flatMap((c, i) => [
      { where: `clarifying question ${i + 1}`, md: c.q, prose: true },
      { where: `clarifying question ${i + 1} why`, md: c.why, prose: true },
    ]),
    ...p.requirements.functional.map((r) => ({ where: 'functional requirement', md: r, prose: true })),
    ...p.requirements.nonFunctional.map((r) => ({ where: 'non-functional requirement', md: r, prose: true })),
    ...p.requirements.outOfScope.map((r) => ({ where: 'out of scope', md: r, prose: true })),
    ...p.estimation.assumptions.map((a) => ({ where: 'estimation assumption', md: `${a.label}: ${a.value}`, prose: false })),
    ...p.estimation.steps.map((st) => ({ where: 'estimation step', md: `${st.label}: ${st.math} = ${st.result}`, prose: false })),
    ...p.api.flatMap((a) => [
      { where: 'API signature', md: code(a.signature), prose: false },
      { where: 'API description', md: a.description, prose: true },
    ]),
    ...p.dataModel.flatMap((d) => [
      { where: 'data model', md: `${d.entity}: ${d.fields.map(code).join(', ')}. ${d.store}`, prose: false },
      { where: `data model "${d.entity}" why`, md: d.why, prose: true },
    ]),
  ];
  p.stages.forEach((st, i) => {
    const where = `stage ${i + 1}`;
    s.push({ where, md: st.title, prose: false }, { where: `${where} solves`, md: st.solves, prose: true });
    (st.diagram.steps ?? []).forEach((step, j) => {
      s.push({ where: `${where} diagram step ${j + 1}`, md: step.caption, prose: true });
      for (const n of step.notes ?? []) s.push({ where: `${where} diagram step ${j + 1} note`, md: n.text, prose: false });
    });
    s.push({ where: `${where} explanation`, md: st.explanation, prose: true });
  });
  p.deepDives.forEach((d, i) => {
    const where = `deep dive ${i + 1}`;
    s.push({ where, md: d.title, prose: false }, { where: `${where} problem`, md: d.problem, prose: true });
    for (const r of d.options.rows) s.push(...[r.option, r.goodAt, r.badAt, r.pickWhen].map((md) => ({ where: `${where} table`, md, prose: true })));
    if (d.options.caption) s.push({ where: `${where} table caption`, md: d.options.caption, prose: true });
    s.push({ where: `${where} recommendation`, md: d.recommendation, prose: true });
  });
  for (const f of p.failureModes) s.push(...[f.scenario, f.impact, f.mitigation].map((md) => ({ where: 'failure mode', md, prose: true })));
  for (const l of p.levelSignals) s.push(...l.signals.map((md) => ({ where: `${l.level} signal`, md, prose: true })));
  p.followUps.forEach((f, i) => s.push({ where: `follow-up ${i + 1}`, md: f.q, prose: true }, { where: `follow-up ${i + 1} answer`, md: f.a, prose: true }));
  for (const r of p.rubric) s.push({ where: 'rubric item', md: r.item, prose: false });
  return s;
}

/** The definition of done for a problem (blueprint sections 7 and 18). */
export function checkProblem(p: Problem): string[] {
  const out: string[] = [];
  const summary = problemList.find((x) => x.id === p.id);
  if (!summary) out.push('is not in the problem list (content/problem-list.ts)');
  else {
    if (summary.title !== p.title) out.push(`title "${p.title}" disagrees with the problem list ("${summary.title}")`);
    if (summary.tier !== p.tier) out.push(`tier ${p.tier} disagrees with the problem list (${summary.tier})`);
    if (summary.flagship !== Boolean(p.flagship)) out.push(`flagship disagrees with the problem list (${summary.flagship})`);
    if (summary.minutes !== p.minutes) out.push(`minutes ${p.minutes} disagree with the problem list (${summary.minutes})`);
  }
  if (p.minutes !== 45 && p.minutes !== 60) out.push('minutes must be 45 or 60');
  const promptSentences = countSentences(mdToPlain(p.prompt));
  if (promptSentences < 1 || promptSentences > 3) out.push(`the prompt should be one to three short sentences, as an interviewer says it; found ${promptSentences}`);
  if (p.concepts.length < 3) out.push(`needs at least three concept lessons; found ${p.concepts.length}`);
  for (const id of p.concepts) if (!getOutline(id)) out.push(`unknown concept lesson "${id}"`);
  if (p.hints.length !== 3 || p.hints.some((h) => !h.trim())) out.push('needs exactly three hints, each with text');

  if (p.clarifyingQuestions.length < 4) out.push(`needs at least four clarifying questions; found ${p.clarifyingQuestions.length}`);
  p.clarifyingQuestions.forEach((c, i) => {
    if (!c.q.trim() || !c.why.trim()) out.push(`clarifying question ${i + 1} needs the question and how its answer changes the design`);
  });
  const { functional, nonFunctional, outOfScope } = p.requirements;
  if (functional.length < 3) out.push('needs at least three functional requirements');
  if (nonFunctional.length < 3) out.push('needs at least three non-functional requirements');
  if (outOfScope.length < 2) out.push('needs at least two out-of-scope items');
  if (p.estimation.assumptions.length < 3) out.push('estimation needs at least three assumptions');
  if (p.estimation.steps.length < 3) out.push('estimation needs at least three steps');
  if (p.api.length < 2) out.push('needs at least two API endpoints or method signatures');
  if (p.dataModel.length < 1) out.push('needs a data model');
  p.dataModel.forEach((d) => {
    if (d.fields.length < 2) out.push(`data model "${d.entity}" needs at least two fields`);
    if (!d.store.trim() || !d.why.trim()) out.push(`data model "${d.entity}" needs a store and why it was chosen`);
  });

  if (p.stages.length < 3) out.push(`needs at least three design stages; found ${p.stages.length}`);
  p.stages.forEach((st, i) => {
    const where = `stage ${i + 1} ("${st.title}")`;
    if (!st.solves.trim() || !st.explanation.trim()) out.push(`${where} needs the problem it solves and an explanation`);
    if ((st.diagram.steps?.length ?? 0) < 2) out.push(`${where} must be an animated diagram with at least two steps`);
    out.push(...checkDiagram(st.diagram, where));
  });
  if (p.deepDives.length < 2 || p.deepDives.length > 4) out.push(`needs 2 to 4 deep dives; found ${p.deepDives.length}`);
  p.deepDives.forEach((d, i) => {
    if (d.options.rows.length < 2) out.push(`deep dive ${i + 1} needs a trade-off table with at least two options`);
    if (!d.problem.trim() || !d.recommendation.trim()) out.push(`deep dive ${i + 1} needs the problem and a recommendation`);
  });
  if (p.failureModes.length < 4) out.push(`needs at least four bottlenecks or failure modes; found ${p.failureModes.length}`);
  for (const level of ['entry', 'mid', 'senior'] as const) {
    const signals = p.levelSignals.find((x) => x.level === level)?.signals ?? [];
    if (signals.length < 2) out.push(`needs at least two ${level}-level signals`);
  }
  if (p.followUps.length < 5) out.push(`needs at least five follow-up questions; found ${p.followUps.length}`);
  p.followUps.forEach((f, i) => (!f.q.trim() || !f.a.trim()) && out.push(`follow-up ${i + 1} needs a question and a model answer`));

  if (p.rubric.length < 6) out.push(`needs a rubric of at least six items; found ${p.rubric.length}`);
  if (p.rubric.some((r) => !Number.isInteger(r.weight) || r.weight <= 0)) out.push('rubric weights must be positive whole numbers');
  const total = p.rubric.reduce((sum, r) => sum + r.weight, 0);
  if (total !== 100) out.push(`rubric weights must add up to 100; they add up to ${total}`);
  const linked = p.rubric.filter((r) => r.lessonId).length;
  if (linked < Math.ceil(p.rubric.length * 0.8)) out.push(`link at least 80% of rubric items to the lesson that teaches them; ${linked} of ${p.rubric.length} are linked`);
  for (const r of p.rubric) if (r.lessonId && !getOutline(r.lessonId)) out.push(`rubric item "${r.item}" links unknown lesson "${r.lessonId}"`);

  const segs = problemSegments(p);
  const allMd = segs.map((x) => x.md);
  for (const href of allMd.flatMap(linkHrefs)) {
    if (href.startsWith('lesson:') && !getOutline(href.slice(7))) out.push(`links to unknown lesson "${href}"`);
  }
  for (const id of new Set(allMd.flatMap(termIds))) if (!glossaryById.has(id)) out.push(`links glossary term "${id}", which does not exist`);
  out.push(...acronymProblems(segs), ...sentenceProblems(segs), ...wordingProblems(segs));
  return out;
}

export function checkGlossary(): string[] {
  const p: string[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const t of glossary) {
    if (ids.has(t.id)) p.push(`glossary: duplicate id "${t.id}"`);
    ids.add(t.id);
    const name = t.term.toLowerCase();
    if (names.has(name)) p.push(`glossary: duplicate term "${t.term}"`);
    names.add(name);
    const words = t.definition.split(/\s+/).filter(Boolean).length;
    if (words > 25) p.push(`glossary: "${t.term}" definition has ${words} words (limit 25)`);
    if (!t.example.trim()) p.push(`glossary: "${t.term}" needs an example`);
    for (const id of t.lessons) if (!getOutline(id)) p.push(`glossary: "${t.term}" lists unknown lesson "${id}"`);
    if (EMOJI.test(t.definition + t.example)) p.push(`glossary: "${t.term}" contains an emoji`);
  }
  return p;
}

export type CheckReport = { lessons: Record<string, string[]>; problems: Record<string, string[]>; glossary: string[]; total: number };

/**
 * Check every lesson, every problem and the glossary. With a generated manifest, also confirm it is
 * up to date, so the glossary's "Used in" links match the lessons.
 */
export function checkContent(
  lessons: Lesson[],
  manifest?: { termUsage: Record<string, string[]>; computed: Record<string, string[]> },
  problems: Problem[] = [],
): CheckReport {
  const report: CheckReport = { lessons: {}, problems: {}, glossary: checkGlossary(), total: 0 };
  if (manifest && JSON.stringify(manifest.termUsage) !== JSON.stringify(manifest.computed)) {
    report.glossary.push('the generated manifest is out of date: run npm run manifest');
  }
  for (const l of lessons) report.lessons[l.id] = checkLesson(l);
  for (const p of problems) report.problems[p.id] = checkProblem(p);
  const count = (r: Record<string, string[]>) => Object.values(r).reduce((n, list) => n + list.length, 0);
  report.total = report.glossary.length + count(report.lessons) + count(report.problems);
  return report;
}
