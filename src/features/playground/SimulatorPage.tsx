import { Suspense, useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { getSimulator } from '@/simulators/registry';
import { getOutline, lessonPath } from '@/content/modules';
import { isLessonWritten } from '@/content/lessons';
import { ButtonLink } from '@/design/Button';
import { SimulatorLoading, lazySimulator } from '@/features/learn/blocks';
import { Page, PageHeader } from '@/features/shared/PageHeader';

export default function SimulatorPage() {
  const { simId } = useParams();
  const meta = simId ? getSimulator(simId) : undefined;
  const Sim = meta ? lazySimulator(meta.id) : null;
  const lesson = meta ? getOutline(meta.lessonId) : undefined;

  useEffect(() => {
    if (meta) document.title = `${meta.title} simulator — Blueprint`;
  }, [meta]);

  if (!meta || !Sim) {
    return (
      <Page>
        <PageHeader title="Simulator not found" intro="There is no simulator at this address. The Playground lists every simulator." />
        <ButtonLink to="/playground">Open the Playground</ButtonLink>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title={`${meta.title} simulator`} intro={meta.summary}>
        {lesson ? (
          <p className="text-ui text-graphite">
            Taught in{' '}
            {isLessonWritten(lesson.id) ? (
              <Link to={lessonPath(lesson.id)} className="md-link">
                lesson {lesson.number}, {lesson.title}
              </Link>
            ) : (
              `lesson ${lesson.number}, ${lesson.title}`
            )}
            .
          </p>
        ) : null}
      </PageHeader>
      <div className="max-w-[960px]">
        <Suspense fallback={<SimulatorLoading />}>
          <Sim />
        </Suspense>
      </div>
    </Page>
  );
}
