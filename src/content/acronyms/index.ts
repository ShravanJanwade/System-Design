import { coreAcronyms } from './core';
import * as groupA from './group-a';
import * as groupB from './group-b';
import * as groupC from './group-c';
import * as groupD from './group-d';
import * as groupE from './group-e';
import * as groupF from './group-f';
import * as groupG from './group-g';
import * as groupH from './group-h';
import * as groupI from './group-i';
import * as groupJ from './group-j';
import * as groupK from './group-k';
import * as groupL from './group-l';
import * as groupM from './group-m';
import * as groupN from './group-n';
import * as groupO from './group-o';
import * as groupP from './group-p';
import * as groupQ from './group-q';
import * as groupR from './group-r';
import * as groupS from './group-s';
import * as groupT from './group-t';
import * as groupU from './group-u';
import * as groupV from './group-v';
import * as groupW from './group-w';
import * as groupX from './group-x';
import * as groupY from './group-y';
import * as problemsA from './problems-a';
import * as problemsB from './problems-b';
import * as problemsC from './problems-c';
import * as problemsD from './problems-d';
import * as problemsE from './problems-e';
import * as problemsF from './problems-f';
import * as problemsG from './problems-g';
import * as problemsH from './problems-h';
import * as practice from './practice';
import * as cheatsheets from './cheatsheets';

const groups = [
  groupA, groupB, groupC, groupD, groupE, groupF, groupG, groupH,
  groupI, groupJ, groupK, groupL, groupM, groupN, groupO, groupP,
  groupQ, groupR, groupS, groupT, groupU, groupV, groupW, groupX, groupY,
  problemsA, problemsB, problemsC, problemsD, problemsE, problemsF, problemsG, problemsH,
  practice, cheatsheets,
];

/**
 * Acronyms and the spellings that count as spelled out, for the build-time check.
 * Every acronym a lesson uses must appear here, and its first use in each lesson
 * must sit near one of these expansions.
 */
export const acronyms: Record<string, string[]> = Object.assign({}, coreAcronyms, ...groups.map((g) => g.groupAcronyms));

/** Capitalized words that are names or keywords rather than acronyms. */
export const notAcronyms = new Set<string>(['OK', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'QUIC', 'USENIX', 'NSDI', 'MB', 'KB', 'GB', 'TB', ...groups.flatMap((g) => g.groupNotAcronyms)]);
