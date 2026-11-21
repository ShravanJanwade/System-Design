/**
 * Check for the practice banks (blueprint section 10): spot the bottleneck, pick the tool, and the
 * estimation and bottleneck questions generated from the lessons' quizzes. A practice item is read on
 * its own, so the writing rules apply within the item: every acronym is spelled out at its first use in it.
 */
import type { PracticeItem, Question } from '../types';
import { getOutline } from '../modules';
import { glossaryById } from '../glossary';
import { bottleneckItems, toolItems } from '../practice';
import { practicePool } from '../generated/practice-pool';
import { linkHrefs, termIds } from '../../lib/md';
import { acronymProblems, checkQuestion, questionSegs, sentenceProblems, wordingProblems, type Seg } from './check';

export type PracticeBank = 'bottleneck' | 'tools' | 'pool';

const banks: Record<PracticeBank, readonly PracticeItem[]> = { bottleneck: bottleneckItems, tools: toolItems, pool: practicePool };

/** The question kinds each bank may hold. */
const bankKinds: Record<PracticeBank, readonly Question['kind'][]> = {
  bottleneck: ['bottleneck'],
  tools: ['single', 'multi'],
  pool: ['numeric', 'bottleneck'],
};

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Which bank holds the item, found by identity. */
export function practiceBankOf(item: PracticeItem): PracticeBank | undefined {
  return (Object.keys(banks) as PracticeBank[]).find((b) => banks[b].includes(item));
}

/** The text a learner reads, in order: the title, the prompt, then the options or the reveal. */
export function practiceSegments(item: PracticeItem): Seg[] {
  return [{ where: 'title', md: item.title, prose: false }, ...questionSegs(item.question, 'question')];
}

/** Diagram labels are checked for wording, but not for acronyms (as in lessons). */
function labelSegs(q: Question): Seg[] {
  if (q.kind !== 'bottleneck') return [];
  return [
    ...q.diagram.nodes.map((n) => ({ where: `diagram node "${n.id}"`, md: `${n.label} ${n.sublabel ?? ''}`, prose: false })),
    ...q.diagram.edges.flatMap((e) => (e.label ? [{ where: `diagram edge "${e.id}"`, md: e.label, prose: false }] : [])),
  ];
}

/** Title Case reads as a heading; titles are names in sentence case ("Writes outgrow one database"). */
function looksTitleCase(title: string): boolean {
  const words = title.split(/\s+/).slice(1).filter((w) => /^[A-Za-z]{4,}$/.test(w));
  return words.length >= 2 && words.every((w) => /^[A-Z][a-z]/.test(w));
}

/** Everything wrong with one practice item. `bank` defaults to the bank that holds it. */
export function checkPracticeItem(item: PracticeItem, bank: PracticeBank | undefined = practiceBankOf(item)): string[] {
  const p: string[] = [];
  const q = item.question;

  // Identity and links
  if (!KEBAB.test(item.id)) p.push(`id "${item.id}" must be kebab-case: lowercase letters, digits and single hyphens`);
  const uses = Object.values(banks).reduce((n, list) => n + list.filter((x) => x.id === item.id).length, 0);
  if (uses > 1) p.push(`id "${item.id}" is used by ${uses} practice items`);
  const title = item.title.trim();
  if (!title) p.push('needs a title');
  else {
    if (!/^[A-Z0-9]/.test(title)) p.push(`title "${title}" should start with a capital letter`);
    if (/[.!?:;,]$/.test(title)) p.push(`title "${title}" is a name, so it ends without punctuation`);
    if (looksTitleCase(title)) p.push(`title "${title}" should be in sentence case`);
  }
  if (!getOutline(item.lessonId)) p.push(`lessonId "${item.lessonId}" is not a lesson in the outline`);
  if (item.flowchartLessonId !== undefined) {
    if (!getOutline(item.flowchartLessonId)) p.push(`flowchartLessonId "${item.flowchartLessonId}" is not a lesson in the outline`);
    if (bank !== 'tools') p.push('only pick-the-tool items link a decision flowchart');
  }

  // Question kind per bank, then the question itself (which also lays out bottleneck diagrams)
  if (!bank) p.push('is not in any practice bank');
  else if (!bankKinds[bank].includes(q.kind)) p.push(`a ${bank} item cannot be a "${q.kind}" question; use ${bankKinds[bank].join(' or ')}`);
  if (bank === 'tools' && (q.kind === 'single' || q.kind === 'multi') && q.options.length > 4) {
    p.push(`pick-the-tool questions offer three or four options; found ${q.options.length}`);
  }
  if (q.kind === 'bottleneck') {
    const nodeIds = new Set(q.diagram.nodes.map((n) => n.id));
    for (const id of Object.keys(q.others)) {
      if (id === q.answerNodeId) p.push(`the answer "${id}" also has a note in "others"`);
      else if (!nodeIds.has(id)) p.push(`"others" has a note for "${id}", which is not a node in the diagram`);
    }
  }
  p.push(...checkQuestion(q, 'question'));

  // Writing rules, in reading order within the item. The title is a name in a list (for quiz-pool items,
  // the lesson's title), so like a diagram label it is checked for wording but not for acronyms.
  const segs = practiceSegments(item);
  const md = segs.map((s) => s.md);
  for (const href of md.flatMap(linkHrefs)) {
    if (href.startsWith('lesson:') && !getOutline(href.slice(7))) p.push(`links to unknown lesson "${href}"`);
  }
  for (const id of new Set(md.flatMap(termIds))) if (!glossaryById.has(id)) p.push(`links glossary term "${id}", which does not exist`);
  p.push(...acronymProblems(segs.slice(1)), ...sentenceProblems(segs), ...wordingProblems([...segs, ...labelSegs(q)]));
  return p;
}
