import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from './AppShell';
import { RouteError } from './RouteError';

type PageModule = { default: ComponentType };
const page = (load: () => Promise<PageModule>) => async () => ({ Component: (await load()).default });

/** Every page is its own chunk (route-level code splitting). */
const routes: RouteObject[] = [
  {
    path: '/',
    Component: AppShell,
    ErrorBoundary: RouteError,
    hydrateFallbackElement: <div className="min-h-dvh bg-canvas" />,
    children: [
      { index: true, lazy: page(() => import('@/features/home/HomePage')) },
      { path: 'learn', lazy: page(() => import('@/features/learn/LearnPage')) },
      { path: 'learn/:moduleId/:lessonId', lazy: page(() => import('@/features/learn/LessonPage')) },
      { path: 'playground', lazy: page(() => import('@/features/playground/PlaygroundPage')) },
      { path: 'playground/:simId', lazy: page(() => import('@/features/playground/SimulatorPage')) },
      { path: 'problems', lazy: page(() => import('@/features/problems/ProblemsPage')) },
      { path: 'problems/:problemId', lazy: page(() => import('@/features/problems/ProblemPage')) },
      { path: 'problems/:problemId/mock', lazy: page(() => import('@/features/mock/MockPage')) },
      { path: 'practice', lazy: page(() => import('@/features/practice/PracticePage')) },
      { path: 'practice/:mode', lazy: page(() => import('@/features/practice/PracticePage')) },
      { path: 'reference', lazy: page(() => import('@/features/reference/ReferencePage')) },
      { path: 'reference/cheatsheets/:id', lazy: page(() => import('@/features/reference/CheatSheetPage')) },
      { path: 'reference/glossary', lazy: page(() => import('@/features/reference/GlossaryPage')) },
      { path: 'plan', lazy: page(() => import('@/features/plan/PlanPage')) },
      { path: 'settings', lazy: page(() => import('@/features/settings/SettingsPage')) },
      { path: '*', lazy: page(() => import('./NotFound')) },
    ],
  },
];

export const router = createBrowserRouter(routes);
