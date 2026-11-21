import { useRef, useState, type ReactNode } from 'react';
import { Download, RotateCcw, Upload } from 'lucide-react';
import { Button } from '@/design/Button';
import { Dialog } from '@/design/Dialog';
import { Segmented, Toggle } from '@/design/primitives';
import { Link } from 'react-router';
import { experienceLabel, levelAdjective, usePlan, type PlanAnswers } from '@/state/plan';
import { Page, PageHeader } from '@/features/shared/PageHeader';
import { useSettings, type MotionPref, type TextSize, type ThemePref } from '@/state/settings';
import { buildExport, parseImport, useProgress, type ExportFile } from '@/state/progress';
import { problemsSnapshot, sanitizeProblemsData, useProblems } from '@/state/problems';
import { practiceSnapshot, replaceAll as replacePractice, reset as resetPractice } from '@/state/practice';
import { toDay } from '@/lib/dates';
import { plural } from '@/lib/format';

export default function SettingsPage() {
  const s = useSettings();
  const progress = useProgress();
  const plan = usePlan();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState<ExportFile | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const lessonsTouched = Object.keys(progress.lessons).length;
  const cards = Object.keys(progress.deck).length;

  const exportProgress = () => {
    const file = buildExport(
      {
        lessons: progress.lessons,
        deck: progress.deck,
        lastLessonId: progress.lastLessonId,
        challenges: progress.challenges,
        activeDays: progress.activeDays,
      },
      { theme: s.theme, textSize: s.textSize, reducedMotion: s.reducedMotion, showStreak: s.showStreak },
      { answers: plan.answers, startDay: plan.startDay },
      problemsSnapshot(),
      practiceSnapshot(),
    );
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blueprint-progress-${toDay()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ tone: 'ok', text: 'Exported your progress as a JSON file.' });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const parsed = parseImport(await f.text());
    if (fileRef.current) fileRef.current.value = '';
    if (!parsed.ok) {
      setMessage({ tone: 'error', text: parsed.error });
      return;
    }
    setPending(parsed.file);
  };

  return (
    <Page>
      <PageHeader title="Settings" intro="Settings and progress are saved in this browser only. Nothing is sent anywhere." />

      <section aria-labelledby="appearance-h" className="measure flex flex-col gap-6">
        <h2 id="appearance-h" className="font-display text-h2-sm font-semibold text-ink">
          Reading and appearance
        </h2>
        <Field label="Theme" hint="Match the system follows your device’s light or dark setting.">
          <Segmented<ThemePref>
            label="Theme"
            value={s.theme}
            onChange={s.setTheme}
            options={[
              { value: 'system', label: 'Match the system' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Field>
        <Field label="Text size" hint="Changes the size of lesson text.">
          <Segmented<TextSize>
            label="Text size"
            value={s.textSize}
            onChange={s.setTextSize}
            options={[
              { value: 'smaller', label: 'Smaller' },
              { value: 'default', label: 'Default' },
              { value: 'larger', label: 'Larger' },
            ]}
          />
        </Field>
        <Field label="Motion" hint="With reduced motion, animated diagrams become numbered still steps.">
          <Segmented<MotionPref>
            label="Motion"
            value={s.reducedMotion}
            onChange={s.setReducedMotion}
            options={[
              { value: 'system', label: 'Match the system' },
              { value: 'reduce', label: 'Reduce motion' },
              { value: 'full', label: 'Allow motion' },
            ]}
          />
        </Field>
      </section>

      <section aria-labelledby="plan-h" className="measure flex flex-col gap-4">
        <h2 id="plan-h" className="font-display text-h2-sm font-semibold text-ink">
          Study plan and habits
        </h2>
        <p className="text-ui-lg text-graphite">
          {plan.answers
            ? `${plan.answers.weeks} weeks to prepare for ${levelAdjective[plan.answers.level]} interviews, ${experienceLabel[plan.answers.experience].toLowerCase()}.`
            : 'You have not set up a study plan yet.'}{' '}
          <Link to="/plan" className="md-link">
            {plan.answers ? 'Open your plan or change your answers' : 'Set up your plan'}
          </Link>
        </p>
        <Toggle
          id="show-streak"
          label="Show my study streak on Home"
          description="Counts days in a row with a lesson read, a quiz attempted or cards reviewed."
          checked={s.showStreak}
          onChange={s.setShowStreak}
        />
      </section>

      <section aria-labelledby="progress-h" className="measure flex flex-col gap-4">
        <h2 id="progress-h" className="font-display text-h2-sm font-semibold text-ink">
          Progress
        </h2>
        <p className="text-ui-lg text-graphite">
          You have opened {plural(lessonsTouched, 'lesson')} and have {plural(cards, 'flashcard')} in your deck.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportProgress}>
            <Download className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Export progress
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Import progress
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset progress
          </Button>
        </div>
        {message ? (
          <p className={message.tone === 'error' ? 'text-ui text-alert' : 'text-ui text-success'} role="status">
            {message.text}
          </p>
        ) : null}
      </section>

      <Dialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Import progress?"
        description={
          pending
            ? `This replaces your current progress with the file’s: ${plural(Object.keys(pending.progress.lessons).length, 'lesson')} and ${plural(Object.keys(pending.progress.deck).length, 'card')}.`
            : undefined
        }
      >
        <div className="flex justify-end gap-2">
          <Button onClick={() => setPending(null)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (pending) {
                progress.replaceAll(pending.progress);
                const st = pending.settings as Partial<{ theme: ThemePref; textSize: TextSize; reducedMotion: MotionPref }> | undefined;
                if (st?.theme) s.setTheme(st.theme);
                if (st?.textSize) s.setTextSize(st.textSize);
                if (st?.reducedMotion) s.setReducedMotion(st.reducedMotion);
                const imported = pending.plan as { answers?: PlanAnswers | null; startDay?: string | null } | undefined;
                if (imported?.answers) usePlan.setState({ answers: imported.answers, startDay: imported.startDay ?? null });
                if (pending.problems !== undefined) useProblems.getState().replaceAll(sanitizeProblemsData(pending.problems));
                if (pending.practice !== undefined) replacePractice(pending.practice);
                setMessage({ tone: 'ok', text: 'Imported your progress.' });
              }
              setPending(null);
            }}
          >
            Import progress
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset all progress?"
        description="This clears lesson status, quiz scores, flashcards, simulator challenges, practice drill results, your sandbox design, and your problem notes, designs, self-assessments and mock interviews in this browser. Export first if you might want them back."
      >
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              progress.reset();
              useProblems.getState().reset();
              resetPractice();
              setConfirmReset(false);
              setMessage({ tone: 'ok', text: 'Reset your progress.' });
            }}
          >
            Reset progress
          </Button>
        </div>
      </Dialog>
    </Page>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-ui font-semibold text-ink">{label}</span>
      <div className="flex flex-wrap">{children}</div>
      {hint ? <p className="text-small text-graphite">{hint}</p> : null}
    </div>
  );
}
