import { Link } from 'react-router';
import { Check, FlaskConical } from 'lucide-react';
import { builtSimulators, type SimulatorMeta } from '@/simulators/registry';
import { getOutline, lessonPath, modules } from '@/content/modules';
import { Page, PageHeader } from '@/features/shared/PageHeader';
import { useProgress } from '@/state/progress';

/** Every built simulator, grouped by the module whose lesson teaches it, in curriculum order. */
const groups = modules
  .map((m) => ({ module: m, sims: builtSimulators.filter((s) => getOutline(s.lessonId)?.module === m.id) }))
  .filter((g) => g.sims.length > 0);

export default function PlaygroundPage() {
  const challenges = useProgress((s) => s.challenges);
  return (
    <Page>
      <PageHeader
        title="Playground"
        intro="Every simulator in one place, grouped by module. Break the idea, then fix it. Each simulator is also embedded in the lesson that teaches it."
      />
      <div className="flex max-w-[960px] flex-col gap-10">
        {groups.map(({ module: m, sims }) => (
          <section key={m.id} aria-labelledby={`playground-${m.id}`} className="flex flex-col gap-4">
            <h2 id={`playground-${m.id}`} className="text-h3 font-bold text-ink">
              Module {m.number}: {m.title}
            </h2>
            <ul className="grid gap-4 md:grid-cols-2">
              {sims.map((s) => (
                <SimulatorCard key={s.id} sim={s} tried={challenges[s.id]?.length ?? 0} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Page>
  );
}

function SimulatorCard({ sim, tried }: { sim: SimulatorMeta; tried: number }) {
  const lesson = getOutline(sim.lessonId);
  return (
    <li className="flex flex-col gap-3 rounded-card border border-rule bg-paper p-5">
      <div className="flex items-center gap-2 text-graphite">
        <FlaskConical className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        {lesson ? (
          <Link to={lessonPath(lesson.id)} className="text-small font-semibold hover:underline">
            From lesson {lesson.number}, {lesson.title}
          </Link>
        ) : null}
      </div>
      <h3 className="font-display text-h3 font-semibold text-ink">
        <Link to={`/playground/${sim.id}`} className="hover:underline">
          {sim.title}
        </Link>
      </h3>
      <p className="text-ui-lg text-graphite">{sim.summary}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Link to={`/playground/${sim.id}`} className="text-ui font-semibold text-blueprint hover:underline">
          Open the {sim.title.toLowerCase()} simulator
        </Link>
        {tried > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-small text-graphite">
            <Check className="h-4 w-4 text-success" strokeWidth={1.5} aria-hidden />
            {tried} {tried === 1 ? 'challenge' : 'challenges'} tried
          </span>
        ) : null}
      </div>
    </li>
  );
}
