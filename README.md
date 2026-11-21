# Blueprint

A system design learning app, from first request to FAANG-level interviews. Static React app, no backend; progress stays in the browser.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # simulator and widget logic, scheduler, study plans, layout engine, content check
npm run check:content  # definition-of-done check: lessons, problems, practice items, cheat sheets, glossary
npm run check:content -- dns url-shortener   # the same, for just these lessons or problems
npm run manifest       # regenerate the term manifest, practice pool and problem concepts (the build does this too)
npm run search-index   # regenerate the full-text index behind the command palette (the build does this too)
npm run build          # manifest, search index, content check, type-check, then a production build in dist/
```

## Where things live

```text
src/
  app/          router, app shell (sidebar, tab bar), error and 404 pages
  design/       tokens.css, buttons, callouts, tabs, sliders, toggles, dialogs, progress ring
  diagram/      layout engine and router, node glyphs, Diagram + step player,
                SequenceDiagram, DecisionTree, layout lint, chip placement (chips.ts)
  simulators/   one folder each: logic.ts, logic.test.ts, View.tsx; registry.ts lists all 17
  content/
    modules.ts  the full 70-lesson outline (titles, reading times, prerequisites)
    lessons/    one file per written lesson, found automatically by file name
    problems/   one file per interview problem, found automatically by file name
    practice/   spot-the-bottleneck and pick-the-tool items (estimation drills come from lesson quizzes)
    cheatsheets/ the ten printable cheat sheets, one file each, listed in list.ts
    glossary/   glossary terms, split into files; they power the glossary page and the popovers
    acronyms/   acronyms and the expansions the content check accepts
    generated/  written by scripts: the term manifest, the practice pool, problem concepts, the search index
    check/      the build-time content check (lessons, problems, practice items, cheat sheets)
  widgets/      smaller in-lesson interactives, one folder each
  features/     home, onboarding, plan, learn (lesson renderer), quiz, playground, problems,
                builder (architecture canvas and checker), mock (mock interviews), practice (drills,
                sandbox), reference (cheat sheets, glossary), search (command palette), settings
  state/        progress, Leitner scheduler, study plan, settings, problems and practice stores
  lib/          seeded random, markdown dialect, formatting, hooks
```

## Adding a lesson

`AUTHORING.md` is the full guide: lesson structure, writing rules, the diagram format, simulators and widgets, and the Snapgram story arc.

1. Write `src/content/lessons/<module>-<order>-<id>.ts` following the `Lesson` type in `src/content/types.ts`. Lesson files are found automatically.
2. Add new glossary terms to a file in `src/content/glossary/` and new acronyms to `src/content/acronyms/`.
3. Run `npm run check:content -- <id>`. It fails on anything that misses the definition of done: section counts,
   quiz explanations, acronyms not spelled out, paragraphs over four sentences, glossary links,
   banned words, and diagram layouts where lines cross cards or labels, where notes, tags or reduced-motion step
   badges collide, or that would draw below 85% on a 375 px phone (fix those with a `narrow` layout; see AUTHORING.md).
   Simulators test the diagrams they build with `lintDiagram` from `src/diagram/chips.ts` and `phoneScale` from `src/diagram/phone.ts`.
4. Run `npm run manifest` so the glossary's "Used in" links include the new lesson.

Simulators (`src/simulators/<id>/`) and widgets (`src/widgets/<id>/`) are picked up automatically once their `View.tsx` exists.

Markdown in content supports `**bold**`, `*italic*`, `` `code` ``, `==highlight==`, `[text](lesson:id)` and
`[[shown text|glossary-id]]`. Bold component names highlight the matching node in the section's diagram.

## Build status

| Phase | Scope | Status |
| --- | --- | --- |
| 1. Foundation | Tokens, fonts, themes, shell, routing, diagram engine, lesson renderer, quiz, progress store, lessons 1.1 and 3.4 with their simulators | Done |
| 2. Core curriculum | All 29 lessons in Modules 0–3 with five more simulators and nine widgets, flashcard review, Home dashboard, onboarding and study plans | Done |
| 3. Scaling and resilience | All 19 lessons in Modules 4–5 with eight more simulators and four widgets | Done |
| 4. Patterns and production | All 13 lessons in Modules 6–7 with the last two simulators and five widgets; the Playground, grouped by module | Done |
| 5. Interview | Module 8's nine lessons, all 26 problems, the problem page, the architecture builder and mock interviews | Done |
| 6. Practice and polish | Estimation, spot-the-bottleneck and pick-the-tool drills, the builder sandbox, ten printable cheat sheets, the glossary page, full-text search, problem filters, accessibility and responsive QA | Done |

`npm audit` reports a ReDoS advisory in `picomatch`, pulled in by Vite and Vitest. It affects build tooling only, not the shipped app, and the suggested fix downgrades Vite to version 6.
