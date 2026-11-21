import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Shuffle, Star, Timer } from 'lucide-react';
import { problemList, getProblem, type ProblemSummary } from '@/content/problem-list';
import { problemConcepts } from '@/content/generated/problem-concepts';
import { getOutline } from '@/content/modules';
import { Button } from '@/design/Button';
import { Segmented } from '@/design/primitives';
import { Page, PageHeader } from '@/features/shared/PageHeader';
import { LineChart } from '@/simulators/shared/LineChart';
import { cn } from '@/lib/cn';
import { timerElapsed, useProblems, type MockSession } from '@/state/problems';
import { formatClock, formatDay, matchesConcept, pickRandomProblem, problemStatus, scoreSeries, type TierChoice } from './logic';
import { FlagshipMark, StatusChip } from './parts';
import { isWritten } from './source';

const TIERS = [
  { tier: 1, title: 'Tier 1: Core building blocks', intro: 'Smaller, well-scoped systems. Each one exercises a handful of building blocks, so start here.' },
  { tier: 2, title: 'Tier 2: Product systems', intro: 'Classic product designs, each with one or two genuinely hard parts.' },
  { tier: 3, title: 'Tier 3: Infrastructure', intro: 'Problems that go deep into distributed systems. Plan on 60 minutes for each.' },
] as const;

type TierFilter = 'all' | '1' | '2' | '3';
type LengthFilter = 'any' | '45' | '60';

/** What the concept filter searches for each problem: its title, its concepts and the titles of the lessons it draws on. */
const conceptText = new Map(
  problemList.map((p) => [p.id, [p.title, p.concepts, ...(problemConcepts[p.id] ?? []).map((id) => getOutline(id)?.title ?? '')].join('. ')]),
);

/** Tier, concept and length filters, kept in the address so Back returns to the same list. */
function useFilters() {
  const [params, setParams] = useSearchParams();
  const [tier, setTier] = useState<TierFilter>(() => {
    const t = params.get('tier');
    return t === '1' || t === '2' || t === '3' ? t : 'all';
  });
  const [length, setLength] = useState<LengthFilter>(() => {
    const l = params.get('length');
    return l === '45' || l === '60' ? l : 'any';
  });
  const [concept, setConcept] = useState(() => params.get('concept') ?? '');

  useEffect(() => {
    const next = new URLSearchParams();
    if (tier !== 'all') next.set('tier', tier);
    if (length !== 'any') next.set('length', length);
    if (concept.trim()) next.set('concept', concept.trim());
    if (next.toString() !== params.toString()) setParams(next, { replace: true, preventScrollReset: true });
  }, [tier, length, concept, params, setParams]);

  const matches = (p: ProblemSummary) =>
    (tier === 'all' || p.tier === Number(tier)) && (length === 'any' || p.minutes === Number(length)) && matchesConcept(concept, conceptText.get(p.id) ?? '');
  const clear = () => {
    setTier('all');
    setLength('any');
    setConcept('');
  };
  const active = tier !== 'all' || length !== 'any' || concept.trim() !== '';
  return { tier, setTier, length, setLength, concept, setConcept, matches, clear, active };
}

export default function ProblemsPage() {
  const written = useMemo(() => problemList.filter((p) => isWritten(p.id)), []);
  const writtenIds = useMemo(() => new Set(written.map((p) => p.id)), [written]);
  const filters = useFilters();
  const shown = problemList.filter(filters.matches);

  useEffect(() => {
    document.title = 'Problems — Blueprint';
  }, []);

  return (
    <Page>
      <PageHeader
        title="Problems"
        intro="Twenty-six classic interview problems in three tiers. Try each one on your own first, then compare with a staged walkthrough and score yourself against its rubric."
      >
        <p className="flex items-center gap-1.5 text-ui text-graphite">
          <Star className="h-4 w-4 shrink-0 text-blueprint" strokeWidth={1.5} aria-hidden />
          marks the six flagship problems. Together they cover the widest range of ideas, so begin with them.
        </p>
      </PageHeader>

      <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[auto_1fr] xl:items-start xl:gap-x-12">
        <MockPanel written={written} className="xl:col-start-2 xl:row-start-1" />
        <div className="flex min-w-0 flex-col gap-12 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <Filters {...filters} shown={shown.length} />
          {TIERS.map((t) => {
            const inTier = shown.filter((p) => p.tier === t.tier);
            if (!inTier.length) return null;
            return (
              <TierSection
                key={t.tier}
                title={t.title}
                intro={t.intro}
                problems={inTier}
                total={problemList.filter((p) => p.tier === t.tier).length}
                writtenIds={writtenIds}
              />
            );
          })}
        </div>
        <History className="xl:col-start-2 xl:row-start-2" />
      </div>
    </Page>
  );
}

function Filters({
  tier,
  setTier,
  length,
  setLength,
  concept,
  setConcept,
  clear,
  active,
  shown,
}: ReturnType<typeof useFilters> & { shown: number }) {
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <section aria-labelledby={`${uid}-h`} className="flex flex-col gap-3">
      <h2 id={`${uid}-h`} className="sr-only">
        Filter problems
      </h2>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="flex w-full flex-col gap-1.5 sm:w-72">
          <label htmlFor={`${uid}-concept`} className="text-ui font-semibold text-ink">
            Concept
          </label>
          <input
            ref={input}
            id={`${uid}-concept`}
            type="search"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="For example, caching or sharding"
            className="h-10 w-full rounded-control border border-control bg-paper px-3 text-ui-lg text-ink placeholder:text-graphite"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-ui font-semibold text-ink">Tier</span>
          <Segmented
            value={tier}
            onChange={setTier}
            label="Tier"
            options={[
              { value: 'all', label: 'All tiers' },
              { value: '1', label: 'Tier 1' },
              { value: '2', label: 'Tier 2' },
              { value: '3', label: 'Tier 3' },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-ui font-semibold text-ink">Length</span>
          <Segmented
            value={length}
            onChange={setLength}
            label="Length"
            options={[
              { value: 'any', label: 'Any length' },
              { value: '45', label: '45 minutes' },
              { value: '60', label: '60 minutes' },
            ]}
          />
        </div>
      </div>
      <div className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-2">
        <p role="status" className="tabular text-ui text-graphite">
          {active ? (shown ? `Showing ${shown} of ${problemList.length} problems.` : 'No problem matches these filters.') : ''}
        </p>
        {active ? (
          <Button
            size="sm"
            onClick={() => {
              clear();
              input.current?.focus();
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function TierSection({
  title,
  intro,
  problems,
  total,
  writtenIds,
}: {
  title: string;
  intro: string;
  problems: ProblemSummary[];
  total: number;
  writtenIds: Set<string>;
}) {
  const headingId = useId();
  const workspaces = useProblems((s) => s.workspaces);
  const assessments = useProblems((s) => s.assessments);
  const activeMocks = useProblems((s) => s.activeMocks);
  const count = problems.filter((p) => writtenIds.has(p.id)).length;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="measure flex flex-col gap-1">
        <h2 id={headingId} className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
          {title}
        </h2>
        <p className="text-ui-lg text-graphite">
          {intro}{' '}
          <span className="tabular">
            {problems.length < total
              ? `${problems.length} of ${total} ${total === 1 ? 'problem matches' : 'problems match'}.`
              : count === problems.length
                ? `${count} problems.`
                : `${count} of ${problems.length} written so far.`}
          </span>
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {problems.map((p) => {
          const open = writtenIds.has(p.id);
          const status = problemStatus(workspaces[p.id], assessments[p.id], activeMocks[p.id]);
          return (
            <li key={p.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="flex flex-wrap items-center gap-x-2 text-h3 font-bold">
                  {open ? (
                    <Link to={`/problems/${p.id}`} className="text-ink underline-offset-4 hover:text-blueprint hover:underline">
                      {p.title}
                    </Link>
                  ) : (
                    <span className="text-graphite">{p.title}</span>
                  )}
                  {p.flagship ? <FlagshipMark /> : null}
                </h3>
                <p className="text-ui text-graphite">{p.concepts}</p>
              </div>
              <div className="shrink-0 sm:pt-1">{open ? <StatusChip status={status} /> : <span className="text-small text-graphite">Not written yet</span>}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const selectClass = 'h-10 w-full rounded-control border border-control bg-paper px-3 text-ui-lg text-ink';

function MockPanel({ written, className }: { written: ProblemSummary[]; className?: string }) {
  const navigate = useNavigate();
  const uid = useId();
  const activeMocks = useProblems((s) => s.activeMocks);
  const [how, setHow] = useState<'pick' | 'random'>('pick');
  const [pickId, setPickId] = useState(written[0]?.id ?? '');
  const [tier, setTier] = useState<TierChoice>('any');
  const [length, setLength] = useState<'45' | '60'>('45');
  const pool = written.filter((p) => tier === 'any' || p.tier === tier);
  const resumable = Object.values(activeMocks).filter((m) => getProblem(m.problemId) && written.some((p) => p.id === m.problemId));
  const canStart = how === 'pick' ? written.some((p) => p.id === pickId) : pool.length > 0;

  const start = () => {
    const chosen = how === 'pick' ? written.find((p) => p.id === pickId) : pickRandomProblem(written, tier, Math.random);
    if (chosen) navigate(`/problems/${chosen.id}/mock?length=${length}`);
  };

  return (
    <section aria-labelledby={`${uid}-h`} className={cn('flex flex-col gap-4 rounded-card border border-rule bg-paper p-5', className)}>
      <div className="flex flex-col gap-1">
        <h2 id={`${uid}-h`} className="font-display text-h2-sm font-semibold text-ink">
          Start a mock interview
        </h2>
        <p className="text-ui text-graphite">A timed session that moves through the six phases of a real interview, with follow-up questions during the deep dives.</p>
      </div>

      {resumable.length ? (
        <ul className="flex flex-col gap-2 rounded-control border border-rule bg-wash px-3 py-2.5">
          {resumable.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-ui">
              <span className="text-ink">
                In progress: <span className="font-semibold">{getProblem(m.problemId)?.title}</span>{' '}
                <span className="tabular text-graphite">{formatClock(timerElapsed(m.timer, Date.now()))}</span>
              </span>
              <Link to={`/problems/${m.problemId}/mock`} className="font-semibold text-blueprint hover:underline">
                Resume
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {written.length ? (
        <>
          <Segmented
            value={how}
            onChange={setHow}
            label="How to choose the problem"
            options={[
              { value: 'pick', label: 'Pick a problem' },
              { value: 'random', label: 'Random' },
            ]}
          />
          {how === 'pick' ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-pick`} className="text-ui font-semibold text-ink">
                Problem
              </label>
              <select id={`${uid}-pick`} value={pickId} onChange={(e) => setPickId(e.target.value)} className={selectClass}>
                {TIERS.map((t) => {
                  const items = written.filter((p) => p.tier === t.tier);
                  if (!items.length) return null;
                  return (
                    <optgroup key={t.tier} label={`Tier ${t.tier}`}>
                      {items.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-tier`} className="text-ui font-semibold text-ink">
                Tier
              </label>
              <select
                id={`${uid}-tier`}
                value={String(tier)}
                onChange={(e) => setTier(e.target.value === 'any' ? 'any' : (Number(e.target.value) as 1 | 2 | 3))}
                className={selectClass}
              >
                <option value="any">Any tier</option>
                <option value="1">Tier 1</option>
                <option value="2">Tier 2</option>
                <option value="3">Tier 3</option>
              </select>
              <p className="text-small text-graphite">
                {pool.length
                  ? `Picks one of ${pool.length} written ${pool.length === 1 ? 'problem' : 'problems'} at random.`
                  : 'No problem in this tier is written yet. Choose another tier.'}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-ui font-semibold text-ink">Length</span>
            <Segmented
              value={length}
              onChange={setLength}
              label="Interview length"
              options={[
                { value: '45', label: '45 minutes' },
                { value: '60', label: '60 minutes' },
              ]}
            />
          </div>
          <Button variant="primary" onClick={start} disabled={!canStart} className="w-full sm:w-auto">
            {how === 'random' ? <Shuffle className="h-4 w-4" strokeWidth={1.5} aria-hidden /> : <Timer className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
            Start mock interview
          </Button>
        </>
      ) : (
        <p className="text-ui text-ink">No problem is written yet in this build, so there is nothing to interview on. Written problems appear in the list as links.</p>
      )}
    </section>
  );
}

const EMPTY_SESSIONS: MockSession[] = [];

function History({ className }: { className?: string }) {
  const uid = useId();
  const sessions = useProblems((s) => s.sessions) ?? EMPTY_SESSIONS;
  const series = useMemo(() => scoreSeries(sessions).map((p) => ({ x: p.x - 1, y: p.y })), [sessions]);
  const recent = useMemo(() => [...sessions].sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '')).slice(0, 8), [sessions]);
  const last = series[series.length - 1];

  return (
    <section aria-labelledby={`${uid}-h`} className={cn('flex flex-col gap-4', className)}>
      <h2 id={`${uid}-h`} className="font-display text-h2-sm font-semibold text-ink">
        Mock interview history
      </h2>
      {!sessions.length ? <p className="text-ui text-graphite">No sessions yet. Finish a mock interview and your scores appear here.</p> : null}
      {series.length >= 2 && last ? (
        <LineChart
          title="Scores by session"
          series={[{ id: 'score', label: 'Score', points: series }]}
          xMax={Math.max(1, series.length - 1)}
          yMax={100}
          xTicks={series.length <= 8 ? series.map((p) => p.x) : [0, Math.round((series.length - 1) / 2), series.length - 1]}
          yTicks={[0, 50, 100]}
          formatX={(v) => String(v + 1)}
          formatY={(v) => `${v}%`}
          height={160}
          summary={`${series.length} sessions. The first scored ${series[0]!.y} and the latest scored ${last.y}, out of 100.`}
        />
      ) : null}
      {recent.length ? (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {recent.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="flex min-w-0 flex-col">
                <Link to={`/problems/${s.problemId}/mock?session=${s.id}`} className="text-ui font-semibold text-ink hover:text-blueprint hover:underline">
                  {getProblem(s.problemId)?.title ?? s.problemId}
                </Link>
                <span className="text-small text-graphite">
                  {formatDay(s.finishedAt)}, {s.length} minutes
                </span>
              </div>
              <span className="tabular text-ui-lg font-semibold text-ink">{s.score}%</span>
            </li>
          ))}
        </ul>
      ) : null}
      {sessions.length > recent.length ? <p className="text-small text-graphite">Showing your latest {recent.length} of {sessions.length} sessions.</p> : null}
    </section>
  );
}
