import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Problem } from '@/content/types';
import { SectionHeading } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import { HighlightProvider } from '@/diagram/highlight';
import { AnnotatedBlock, READ, SimulatorEmbed, TableView, TradeoffView, WIDE } from '@/features/learn/blocks';
import { Md, MdInline } from '@/features/learn/Markdown';
import { toDiagramSpec, type BuilderDesign } from '@/features/builder/model';
import { cn } from '@/lib/cn';
import { finalDesignSpec, stageTitle } from './logic';
import { FollowUpItem } from './parts';
import { SelfAssessment } from './SelfAssessment';

export const WALKTHROUGH_SECTIONS = [
  { id: 'wt-clarifying', title: 'Clarifying questions' },
  { id: 'wt-requirements', title: 'Requirements' },
  { id: 'wt-estimation', title: 'Estimation' },
  { id: 'wt-api', title: 'API' },
  { id: 'wt-data-model', title: 'Data model' },
  { id: 'wt-stages', title: 'High-level design in stages' },
  { id: 'wt-deep-dives', title: 'Deep dives' },
  { id: 'wt-failures', title: 'Bottlenecks and failure modes' },
  { id: 'wt-strong-answer', title: 'What a strong answer looks like' },
  { id: 'wt-follow-ups', title: 'Follow-up questions' },
  { id: 'wt-self-assessment', title: 'Self-assessment' },
] as const;

type SectionId = (typeof WALKTHROUGH_SECTIONS)[number]['id'];

const LEVEL_NAME = { entry: 'Entry level', mid: 'Mid level', senior: 'Senior' } as const;

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const title = WALKTHROUGH_SECTIONS.find((s) => s.id === id)!.title;
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-24 flex-col gap-6">
      <HighlightProvider>
        <SectionHeading id={`${id}-h`} className={READ}>
          {title}
        </SectionHeading>
        {children}
      </HighlightProvider>
    </section>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className={cn(READ, 'text-h3 font-bold text-ink')}>{children}</h3>;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className={cn(READ, 'flex list-disc flex-col gap-1.5 pl-5 text-body text-ink marker:text-graphite')}>
      {items.map((it, i) => (
        <li key={i}>
          <MdInline md={it} />
        </li>
      ))}
    </ul>
  );
}

/** The walkthrough (blueprint section 7): always the same eleven sections, in order. */
export function Walkthrough({ problem, design }: { problem: Problem; design: BuilderDesign }) {
  const active = useActiveSection(WALKTHROUGH_SECTIONS.map((s) => s.id));
  const yourSpec = useMemo(() => toDiagramSpec(design), [design]);
  const finalSpec = useMemo(() => finalDesignSpec(problem), [problem]);
  const est = problem.estimation;

  return (
    <div className="flex min-w-0 gap-10">
      <div className="flex min-w-0 flex-1 flex-col gap-14">
        <Section id="wt-clarifying">
          <p className={cn(READ, 'text-ui-lg text-graphite')}>What to ask before you design, and how each answer changes the design.</p>
          <ul className={cn(READ, 'flex flex-col divide-y divide-rule border-y border-rule')}>
            {problem.clarifyingQuestions.map((c, i) => (
              <li key={i} className="flex flex-col gap-1 py-4">
                <p className="text-body font-semibold text-ink">
                  <MdInline md={c.q} />
                </p>
                <p className="text-ui-lg text-graphite">
                  <MdInline md={c.why} />
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="wt-requirements">
          <SubHeading>Functional</SubHeading>
          <Bullets items={problem.requirements.functional} />
          <SubHeading>Non-functional</SubHeading>
          <Bullets items={problem.requirements.nonFunctional} />
          <SubHeading>Out of scope</SubHeading>
          <Bullets items={problem.requirements.outOfScope} />
        </Section>

        <Section id="wt-estimation">
          <SubHeading>Assumptions</SubHeading>
          <dl className={cn(READ, 'divide-y divide-rule rounded-card border border-rule bg-paper')}>
            {est.assumptions.map((a, i) => (
              <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5">
                <dt className="text-ui-lg text-ink">
                  <MdInline md={a.label} />
                </dt>
                <dd className="tabular text-ui-lg font-semibold text-ink">
                  <MdInline md={a.value} />
                </dd>
              </div>
            ))}
          </dl>
          <SubHeading>Step by step</SubHeading>
          <ol className={cn(WIDE, 'flex flex-col divide-y divide-rule rounded-card border border-rule bg-paper')}>
            {est.steps.map((s, i) => (
              <li key={i} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5">
                  <span className="text-ui-lg font-semibold text-ink">
                    <MdInline md={s.label} />
                  </span>
                  <span className="tabular text-ui-lg font-semibold text-ink">
                    <MdInline md={s.result} />
                  </span>
                </div>
                <p className="tabular text-ui-lg text-graphite">
                  <MdInline md={s.math} />
                </p>
              </li>
            ))}
          </ol>
          {est.calculator ? (
            <SimulatorEmbed
              id="estimation"
              preset={est.calculator}
              intro="The calculator starts from these assumptions. Change one at a time and watch which numbers move."
            />
          ) : null}
        </Section>

        <Section id="wt-api">
          <AnnotatedBlock lines={problem.api.map((a) => ({ code: a.signature, note: a.description }))} />
        </Section>

        <Section id="wt-data-model">
          <div className={cn(WIDE, 'grid gap-4 md:grid-cols-2')}>
            {problem.dataModel.map((d, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-card border border-rule bg-paper p-5">
                <h3 className="text-h3 font-bold text-ink">
                  <MdInline md={d.entity} />
                </h3>
                <ul className="flex flex-wrap gap-1.5">
                  {d.fields.map((f, j) => (
                    <li key={j}>
                      <code className="md-code text-ui">{f}</code>
                    </li>
                  ))}
                </ul>
                <p className="text-ui-lg text-ink">
                  <span className="font-semibold">Store: </span>
                  <MdInline md={d.store} />
                </p>
                <p className="text-ui-lg text-graphite">
                  <MdInline md={d.why} />
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="wt-stages">
          <p className={cn(READ, 'text-ui-lg text-graphite')}>
            The design grows in stages. Each stage fixes one problem with the stage before it. Step through each diagram with the arrow keys or the controls.
          </p>
          {problem.stages.map((s, i) => (
            <div key={i} className="flex flex-col gap-4">
              <h3 className={cn(READ, 'text-h3 font-bold text-ink')}>
                <MdInline md={stageTitle(s.title, i)} />
              </h3>
              <p className={cn(READ, 'text-body text-ink')}>
                <span className="font-semibold">The problem it solves. </span>
                <MdInline md={s.solves} />
              </p>
              <div className={WIDE}>
                <Diagram spec={s.diagram} />
              </div>
              <Md md={s.explanation} className={READ} />
            </div>
          ))}
          {yourSpec && finalSpec ? (
            <div className={cn(WIDE, 'flex flex-col gap-3')}>
              <h3 className="text-h3 font-bold text-ink">Your design next to the final stage</h3>
              <div className="grid gap-4 xl:grid-cols-2">
                <figure className="flex min-w-0 flex-col gap-2">
                  <figcaption className="text-ui font-semibold text-ink">Your design</figcaption>
                  <Diagram spec={yourSpec} variant="plain" />
                </figure>
                <figure className="flex min-w-0 flex-col gap-2">
                  <figcaption className="text-ui font-semibold text-ink">
                    Reference, <MdInline md={stageTitle(problem.stages[problem.stages.length - 1]!.title, problem.stages.length - 1)} />
                  </figcaption>
                  <Diagram spec={finalSpec} variant="plain" />
                </figure>
              </div>
            </div>
          ) : null}
        </Section>

        <Section id="wt-deep-dives">
          {problem.deepDives.map((d, i) => (
            <div key={i} className="flex flex-col gap-4">
              <h3 className={cn(READ, 'text-h3 font-bold text-ink')}>
                <MdInline md={d.title} />
              </h3>
              <Md md={d.problem} className={READ} />
              <TradeoffView table={d.options} />
              <p className={cn(READ, 'text-body text-ink')}>
                <span className="font-semibold">Recommendation. </span>
                <MdInline md={d.recommendation} />
              </p>
            </div>
          ))}
        </Section>

        <Section id="wt-failures">
          <p className={cn(READ, 'text-ui-lg text-graphite')}>What breaks first as load grows, and what happens when each part fails.</p>
          <TableView columns={['Scenario', 'Impact', 'Mitigation']} rows={problem.failureModes.map((f) => [f.scenario, f.impact, f.mitigation])} />
        </Section>

        <Section id="wt-strong-answer">
          <div className={cn(WIDE, 'grid gap-4 lg:grid-cols-3')}>
            {(['entry', 'mid', 'senior'] as const).map((level) => {
              const signals = problem.levelSignals.find((l) => l.level === level)?.signals ?? [];
              if (!signals.length) return null;
              return (
                <div key={level} className="flex flex-col gap-2 rounded-card border border-rule bg-paper p-5">
                  <h3 className="text-h3 font-bold text-ink">{LEVEL_NAME[level]}</h3>
                  <ul className="flex list-disc flex-col gap-1.5 pl-5 text-ui-lg text-ink marker:text-graphite">
                    {signals.map((s, i) => (
                      <li key={i}>
                        <MdInline md={s} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Section>

        <Section id="wt-follow-ups">
          <p className={cn(READ, 'text-ui-lg text-graphite')}>Answer each one out loud before you reveal the model answer.</p>
          <div className={cn(READ, 'flex flex-col gap-3')}>
            {problem.followUps.map((f, i) => (
              <FollowUpItem key={i} q={f.q} a={f.a} />
            ))}
          </div>
        </Section>

        <Section id="wt-self-assessment">
          <SelfAssessment problem={problem} />
        </Section>
      </div>

      <aside className="sticky top-8 hidden h-fit w-[220px] shrink-0 xl:block" aria-label="Walkthrough sections">
        <nav aria-label="Sections of the walkthrough">
          <p className="mb-2 text-small font-semibold text-graphite">On this page</p>
          <ul className="flex flex-col border-l border-rule">
            {WALKTHROUGH_SECTIONS.map((s) => (
              <li key={s.id} className="-ml-px">
                <a
                  href={`#${s.id}`}
                  aria-current={active === s.id ? 'location' : undefined}
                  className={cn(
                    'block border-l-2 py-1 pl-3 text-ui transition-colors ease-ui',
                    active === s.id ? 'border-blueprint font-semibold text-ink' : 'border-transparent text-graphite hover:text-ink',
                  )}
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </div>
  );
}

/** The section whose heading has scrolled past the top third of the screen. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');
  useEffect(() => {
    const list = key.split('|');
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = Math.min(160, window.innerHeight * 0.3);
      let current: string | null = null;
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [key]);
  return active;
}
