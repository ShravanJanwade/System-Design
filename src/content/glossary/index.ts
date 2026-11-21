import type { GlossaryTerm, RawTerm } from '../types';
import { termUsage } from '../generated/manifest';
import { coreTerms } from './terms-core';
import { groupTerms as groupA } from './terms-group-a';
import { groupTerms as groupB } from './terms-group-b';
import { groupTerms as groupC } from './terms-group-c';
import { groupTerms as groupD } from './terms-group-d';
import { groupTerms as groupE } from './terms-group-e';
import { groupTerms as groupF } from './terms-group-f';
import { groupTerms as groupG } from './terms-group-g';
import { groupTerms as groupH } from './terms-group-h';
import { sharedTerms } from './terms-shared';
import { groupTerms as groupI } from './terms-group-i';
import { groupTerms as groupJ } from './terms-group-j';
import { groupTerms as groupK } from './terms-group-k';
import { groupTerms as groupL } from './terms-group-l';
import { groupTerms as groupM } from './terms-group-m';
import { groupTerms as groupN } from './terms-group-n';
import { groupTerms as groupO } from './terms-group-o';
import { groupTerms as groupP } from './terms-group-p';
import { groupTerms as groupQ } from './terms-group-q';
import { groupTerms as groupR } from './terms-group-r';
import { groupTerms as groupS } from './terms-group-s';
import { groupTerms as groupT } from './terms-group-t';
import { groupTerms as groupU } from './terms-group-u';
import { groupTerms as groupV } from './terms-group-v';
import { groupTerms as groupW } from './terms-group-w';
import { groupTerms as groupX } from './terms-group-x';
import { groupTerms as groupY } from './terms-group-y';

/** Every term as authored, from all term files. */
export const rawTerms: RawTerm[] = [
  ...coreTerms,
  ...groupA,
  ...groupB,
  ...groupC,
  ...groupD,
  ...groupE,
  ...groupF,
  ...groupG,
  ...groupH,
  ...sharedTerms,
  ...groupI,
  ...groupJ,
  ...groupK,
  ...groupL,
  ...groupM,
  ...groupN,
  ...groupO,
  ...groupP,
  ...groupQ,
  ...groupR,
  ...groupS,
  ...groupT,
  ...groupU,
  ...groupV,
  ...groupW,
  ...groupX,
  ...groupY,
];

/**
 * The glossary. Definitions are plain English, 25 words or fewer, with a one-line example.
 * The same entries power the inline term popovers in lessons. Which lessons use each term
 * comes from the generated manifest (npm run manifest).
 */
export const glossary: GlossaryTerm[] = rawTerms.map((t) => ({ ...t, lessons: termUsage[t.id] ?? [] }));

export const glossaryById: ReadonlyMap<string, GlossaryTerm> = new Map(glossary.map((t) => [t.id, t]));
