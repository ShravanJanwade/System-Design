import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Boxes, Layers, Timer, type LucideIcon } from 'lucide-react';
import { getOutline, lessonPath } from '@/content/modules';
import { ProgressRing } from '@/design/primitives';
import { Page, PageHeader } from '@/features/shared/PageHeader';
import { toDay } from '@/lib/dates';
import { plural } from '@/lib/format';
import { dueCards } from '@/state/leitner';
import { DRILL_MODES, usePractice, type DrillMode } from '@/state/practice';
import { useProblems } from '@/state/problems';
import { useProgress } from '@/state/progress';
import { usePracticeContent } from './data';
import { missedByLesson, modeSummary, summaryLine, type ModeSummary } from './logic';
import { DRILLS } from './modes';

/** /practice: every mode with one line on what it does and where the learner stands. */
export function PracticeHome() {
  const deck = useProgress((s) => s.deck);
  const records = usePractice((s) => s.items);
  const sandbox = usePractice((s) => s.sandbox);
  const sessions = useProblems((s) => s.sessions);
  const activeMocks = useProblems((s) => s.activeMocks);
  const { state } = usePracticeContent();
  const content = state.status === 'ready' ? state.content : null;

  const cards = Object.keys(deck).length;
  const due = dueCards(deck, toDay()).length;
  const cardStatus = !cards
    ? 'Your deck is empty. Add a lesson’s cards from the end of the lesson.'
    : due
      ? `${due} due today, ${plural(cards, 'card')} in your deck.`
      : `Nothing due today. ${plural(cards, 'card')} in your deck.`;

  const parts = sandbox.nodes.length;
  const links = sandbox.edges.length;
  const sandboxStatus = parts
    ? `Your sandbox has ${plural(parts, 'component')}${links ? ` and ${plural(links, 'connection')}` : ''}.`
    : 'Your sandbox is empty.';

  const inProgress = Object.keys(activeMocks).length;
  const latest = sessions[sessions.length - 1];
  const mockStatus = [
    latest ? `${plural(sessions.length, 'mock interview')} finished, latest score ${latest.score ?? 0}%.` : 'No mock interviews finished yet.',
    inProgress ? `${plural(inProgress, 'interview')} in progress.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const missed = content ? missedByLesson(DRILL_MODES.flatMap((m) => content[m]), records) : [];

  return (
    <Page>
      <PageHeader title="Practice" intro="Turn understanding into recall, then into interview performance." />
      <div className="grid gap-12 xl:grid-cols-[minmax(0,46rem)_minmax(0,18rem)] xl:gap-16">
        <div className="flex min-w-0 flex-col gap-10">
          <ModeGroup id="recall" title="Recall and drills">
            <ModeRow to="/practice/flashcards" icon={Layers} title="Flashcards" summary="Recall each lesson’s key ideas just before you would forget them." status={cardStatus} />
            {DRILL_MODES.map((mode) => (
              <DrillRow key={mode} mode={mode} summary={content ? modeSummary(content[mode], records) : null} />
            ))}
          </ModeGroup>
          <ModeGroup id="build" title="Build and interview">
            <ModeRow
              to="/practice/builder"
              icon={Boxes}
              title="Architecture builder"
              summary={
                <>
                  Place components on a canvas, connect them, and get feedback from simple rules. Sketch freely in the sandbox, or design for a problem
                  on its own canvas in the{' '}
                  <Link to="/problems" className="md-link">
                    problem bank
                  </Link>
                  .
                </>
              }
              status={sandboxStatus}
            />
            <ModeRow
              to="/problems"
              icon={Timer}
              title="Mock interviews"
              summary="Run a timed 45 or 60 minute interview, then score yourself against the problem’s rubric. You start one from the problem bank."
              status={mockStatus}
            />
          </ModeGroup>
        </div>

        <aside aria-labelledby="review-next" className="flex min-w-0 flex-col gap-3 lg:border-l lg:border-rule lg:pl-8">
          <h2 id="review-next" className="text-h3 font-bold text-ink">
            Review next
          </h2>
          {!content ? (
            <p className="text-ui text-graphite">{state.status === 'error' ? 'Your drill history could not be loaded. Reload the page to try again.' : 'Checking your drill answers.'}</p>
          ) : missed.length ? (
            <>
              <p className="text-ui text-graphite">Lessons behind the drill questions you missed the last time you answered them.</p>
              <ul className="flex flex-col border-t border-rule">
                {missed.slice(0, 6).map((m) => {
                  const lesson = getOutline(m.lessonId);
                  return (
                    <li key={m.lessonId} className="flex flex-col gap-0.5 border-b border-rule py-3">
                      <Link to={lessonPath(m.lessonId)} className="md-link text-ui-lg">
                        {lesson ? `${lesson.number} ${lesson.title}` : 'Open the lesson'}
                      </Link>
                      <span className="text-small text-graphite">{plural(m.missed, 'question')} missed</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-ui text-graphite">Nothing to review yet. When you miss a drill question, its lesson shows up here.</p>
          )}
        </aside>
      </div>
    </Page>
  );
}

function ModeGroup({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-2">
      <h2 id={`${id}-heading`} className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
        {title}
      </h2>
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">{children}</ul>
    </section>
  );
}

function ModeRow({
  to,
  icon: Icon,
  title,
  summary,
  status,
  meter,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  summary: ReactNode;
  status?: string;
  meter?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-4 py-5">
      <Icon className="mt-1 h-5 w-5 shrink-0 text-graphite" strokeWidth={1.5} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="text-h3 font-bold">
          <Link to={to} className="rounded-control text-blueprint underline-offset-4 hover:underline">
            {title}
          </Link>
        </h3>
        <p className="text-ui-lg text-graphite">{summary}</p>
        {status ? <p className="tabular text-ui text-ink">{status}</p> : null}
      </div>
      {meter}
    </li>
  );
}

function DrillRow({ mode, summary }: { mode: DrillMode; summary: ModeSummary | null }) {
  const info = DRILLS[mode];
  return (
    <ModeRow
      to={info.path}
      icon={info.icon}
      title={info.title}
      summary={info.summary}
      status={summary ? summaryLine(summary) : undefined}
      meter={
        summary && summary.tried ? (
          <ProgressRing value={summary.right / summary.total} label={`${summary.right} of ${summary.total} right the last time you answered them`} />
        ) : null
      }
    />
  );
}
