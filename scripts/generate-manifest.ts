/**
 * npm run manifest: regenerates the files in src/content/generated/:
 * - manifest.ts: which lessons use each glossary term, plus small per-lesson facts;
 * - practice-pool.ts: the estimation and spot-the-bottleneck questions from lesson quizzes,
 *   kept apart so only the practice pages load them;
 * - problem-concepts.ts: the lessons each written problem draws on, for the Problems page filter.
 * Run it after adding or editing lessons or problems. The build runs it automatically.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadLessons, root } from './load-lessons';
import { loadProblems } from './load-problems';
import { renderManifest, renderPracticePool, renderProblemConcepts } from '../src/content/check/manifest';

const lessons = await loadLessons();
const out = path.join(root, 'src/content/generated/manifest.ts');
writeFileSync(out, renderManifest(lessons));
const pool = path.join(root, 'src/content/generated/practice-pool.ts');
writeFileSync(pool, renderPracticePool(lessons));
const problems = await loadProblems();
const concepts = path.join(root, 'src/content/generated/problem-concepts.ts');
writeFileSync(concepts, renderProblemConcepts(problems));
console.log(`Wrote the manifest, practice pool and problem concepts for ${lessons.length} lessons and ${problems.length} problems.`);
