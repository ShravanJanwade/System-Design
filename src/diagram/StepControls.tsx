import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { IconButton } from '@/design/Button';
import { Kbd } from '@/design/primitives';
import { cn } from '@/lib/cn';

type Props = {
  step: number;
  total: number;
  playing: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onRestart: () => void;
  onJump: (i: number) => void;
};

/** Previous, Play, Next and Restart, a "Step 3 of 7" counter, and a clickable step track. */
export function StepControls({ step, total, playing, onPrev, onNext, onTogglePlay, onRestart, onJump }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1" role="group" aria-label="Steps">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onJump(i)}
            aria-label={`Go to step ${i + 1}`}
            aria-current={i === step ? 'step' : undefined}
            className="group flex h-4 flex-1 items-center"
          >
            <span
              className={cn(
                'h-1 w-full rounded-full transition-colors ease-ui',
                i < step ? 'bg-blueprint' : i === step ? 'bg-signal' : 'bg-rule group-hover:bg-wash-strong',
              )}
            />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="tabular text-ui font-semibold text-ink" aria-live="off">
          Step {step + 1} of {total}
        </p>
        <div className="flex items-center gap-1">
          <span className="mr-2 hidden items-center gap-1 text-small text-graphite sm:flex">
            <Kbd>←</Kbd>
            <Kbd>→</Kbd>
          </span>
          <IconButton label="Restart" size="sm" onClick={onRestart}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
          </IconButton>
          <IconButton label="Previous step" size="sm" onClick={onPrev} disabled={step === 0}>
            <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
          </IconButton>
          <IconButton label={playing ? 'Pause' : 'Play'} size="sm" onClick={onTogglePlay}>
            {playing ? <Pause className="h-4 w-4" strokeWidth={1.5} /> : <Play className="h-4 w-4" strokeWidth={1.5} />}
          </IconButton>
          <IconButton label="Next step" size="sm" onClick={onNext} disabled={step === total - 1}>
            <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
