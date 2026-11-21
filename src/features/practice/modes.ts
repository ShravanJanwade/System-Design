import { Calculator, Gauge, Split, type LucideIcon } from 'lucide-react';
import type { DrillMode } from '@/state/practice';

export type DrillInfo = {
  title: string;
  path: string;
  icon: LucideIcon;
  /** One line for the practice home. */
  summary: string;
  /** The drill page's introduction. */
  intro: string;
  /** A tip shown beside the questions. */
  tip: string;
};

export const DRILLS: Record<DrillMode, DrillInfo> = {
  estimation: {
    title: 'Estimation drills',
    path: '/practice/estimation',
    icon: Calculator,
    summary: 'Work out a number, such as servers, storage or bandwidth, then compare your working with the solution line by line.',
    intro: 'Estimate the number, then compare your working with the solution. An answer within the stated range counts, because estimates only need the right order of magnitude.',
    tip: 'Type numbers as 1200, 1,200, 1.2k or 3m, then press Enter to check.',
  },
  bottleneck: {
    title: 'Spot the bottleneck',
    path: '/practice/bottleneck',
    icon: Gauge,
    summary: 'Read a described load and find the component that breaks first.',
    intro: 'Read the load, then select the component that runs out of capacity first. The answer explains why, and why not the others.',
    tip: 'Tab moves between components in the diagram. Press Enter or Space to select one.',
  },
  tools: {
    title: 'Pick the tool',
    path: '/practice/tools',
    icon: Split,
    summary: 'Choose the database, cache, queue or protocol that fits a set of requirements.',
    intro: 'Read the requirements, then choose the tool that fits. After each answer, the lesson and its decision flowchart are one link away.',
    tip: 'Every option explains why it fits or not, so read the ones you did not pick too.',
  },
};
