import { useReducer, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Repeat2, RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Chip, Kbd, Segmented } from '@/design/primitives';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/state/settings';
import type { WidgetProps } from '../registry';
import {
  CARD_COUNT,
  DECISIONS,
  PARTS,
  cardStatus,
  deckReducer,
  getDecision,
  initialDeck,
  keyAction,
  sentencePieces,
  type Decision,
  type DecisionId,
  type TemplatePart,
} from './logic';

const FACE = 'flex h-full min-h-[13rem] flex-col gap-3 rounded-card bg-paper p-4 sm:p-5';
const HIDE_BACK = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' } as const;

function FlipHint({ children }: { children: ReactNode }) {
  return (
    <span className="mt-auto flex items-center gap-1.5 text-small font-semibold text-blueprint">
      <Repeat2 className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
      {children}
    </span>
  );
}

/** The template side of a card: the part as the template says it, and what it is for. */
function Front({ part, index }: { part: TemplatePart; index: number }) {
  return (
    <span className={cn(FACE, 'border border-rule')}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-small font-semibold text-graphite tabular">
          Part {index + 1} of {CARD_COUNT}: {part.name.toLowerCase()}
        </span>
        <Chip>Template</Chip>
      </span>
      <span className="block text-h3 font-bold text-ink">{part.template}</span>
      <span className="block text-ui text-graphite">{part.hint}</span>
      <FlipHint>Flip for Snapgram’s version</FlipHint>
    </span>
  );
}

/** Snapgram's side of a card: how this part was said for the chosen decision. */
function Back({ part, decision }: { part: TemplatePart; decision: Decision }) {
  return (
    <span className={cn(FACE, 'border-2 border-blueprint')}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-small font-semibold text-graphite">{decision.source}</span>
        <Chip tone="blueprint">Snapgram’s version</Chip>
      </span>
      <span className="block text-ui-lg font-semibold text-ink">{decision.said[part.id]}</span>
      <span className="block text-small text-graphite">
        Template: <span className="italic">{part.template}</span>
      </span>
      <FlipHint>Flip back to the template</FlipHint>
    </span>
  );
}

/**
 * A deck of trade-off phrase cards. Each card is one part of the template; flipping it shows how the
 * part was said for one of Snapgram's decisions, and the whole sentence below fills in.
 * Props: `decision` (like-counts, home-feed or usernames) and `card` (index of the first card shown).
 */
export default function PhraseCards({ props }: WidgetProps) {
  const [state, dispatch] = useReducer(deckReducer, props, initialDeck);
  const reduced = useReducedMotion();

  const decision = getDecision(state.decision);
  const part = PARTS[state.index]!;
  const flipped = state.flipped[state.index] === true;
  const pieces = sentencePieces(decision, state.flipped);
  const allFlipped = state.flipped.every(Boolean);
  const atStart = state.index === 0;
  const atEnd = state.index === CARD_COUNT - 1;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const action = keyAction(e.key);
    if (!action) return;
    e.preventDefault();
    dispatch(action);
  };

  const front = <Front part={part} index={state.index} />;
  const back = <Back part={part} decision={decision} />;

  return (
    <div className="rounded-card border border-rule bg-wash p-4 sm:p-5">
      <div className="flex flex-col gap-2">
        <Segmented<DecisionId>
          size="sm"
          label="Snapgram decision"
          value={state.decision}
          onChange={(d) => dispatch({ type: 'choose', decision: d })}
          options={DECISIONS.map((d) => ({ value: d.id, label: d.short }))}
          className="self-start"
        />
        <p className="text-ui text-graphite">{decision.situation}</p>
      </div>

      <div
        role="group"
        aria-roledescription="card deck"
        aria-label={`Trade-off phrase cards for Snapgram’s ${decision.short.toLowerCase()}`}
        onKeyDown={onKeyDown}
        className="mt-4"
      >
        <button
          type="button"
          onClick={() => dispatch({ type: 'flip' })}
          className="block w-full rounded-card text-left"
        >
          {reduced ? (
            // Reduced motion: no turn, just the side in view.
            <span className="grid">{flipped ? back : front}</span>
          ) : (
            <span className="block" style={{ perspective: '1200px' }}>
              {/* Keyed by card, so moving to another card never plays a flip. */}
              <span
                key={`${state.decision}-${state.index}`}
                className="grid"
                style={{
                  transformStyle: 'preserve-3d',
                  transition: 'transform 450ms cubic-bezier(0.2, 0.7, 0.2, 1)',
                  transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                <span className="col-start-1 row-start-1" style={HIDE_BACK} aria-hidden={flipped}>
                  {front}
                </span>
                <span className="col-start-1 row-start-1" style={{ ...HIDE_BACK, transform: 'rotateY(180deg)' }} aria-hidden={!flipped}>
                  {back}
                </span>
              </span>
            </span>
          )}
        </button>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => dispatch({ type: 'prev' })} aria-disabled={atStart}>
              Previous card
            </Button>
            <Button size="sm" variant="primary" onClick={() => dispatch({ type: 'flip' })}>
              <Repeat2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              {flipped ? 'Flip back' : 'Flip card'}
            </Button>
            <Button size="sm" onClick={() => dispatch({ type: 'next' })} aria-disabled={atEnd}>
              Next card
            </Button>
          </div>
          <ol className="flex gap-2" aria-label="Go to a card">
            {PARTS.map((p, i) => {
              const current = i === state.index;
              const done = state.flipped[i] === true;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'go', index: i })}
                    aria-label={`Card ${i + 1}, ${p.name.toLowerCase()}${done ? ', flipped' : ''}`}
                    aria-current={current ? 'step' : undefined}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border text-small font-semibold tabular transition-colors ease-ui',
                      current ? 'border-ink bg-ink text-canvas' : done ? 'border-blueprint bg-paper text-blueprint' : 'border-rule bg-paper text-graphite hover:bg-wash-strong',
                    )}
                  >
                    {done ? <Check className="h-4 w-4" strokeWidth={1.5} aria-hidden /> : i + 1}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="mt-3 hidden flex-wrap items-center gap-1.5 text-small text-graphite sm:flex">
          <Kbd>
            <ArrowLeft className="h-3 w-3" strokeWidth={1.5} aria-label="Left arrow" />
          </Kbd>
          <Kbd>
            <ArrowRight className="h-3 w-3" strokeWidth={1.5} aria-label="Right arrow" />
          </Kbd>
          move between cards; <Kbd>Enter</Kbd> or <Kbd>Space</Kbd> flips the card in focus.
        </p>
        <p className="sr-only" aria-live="polite">
          {cardStatus(state)}
        </p>
      </div>

      <div className="mt-5 border-t border-rule pt-4">
        <p className="text-small font-semibold text-graphite">
          The whole sentence{allFlipped ? ', said for Snapgram' : ', filling in as you flip'}
        </p>
        <p className="mt-2 text-ui-lg">
          {pieces.map((piece, i) => (
            <span key={piece.part}>
              {i > 0 ? ' ' : null}
              <span className={piece.filled ? 'font-semibold text-ink' : 'italic text-graphite'}>{piece.text}</span>
            </span>
          ))}
        </p>
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={() => dispatch({ type: allFlipped ? 'reset' : 'flipAll' })}>
            {allFlipped ? (
              <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            ) : (
              <Repeat2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            )}
            {allFlipped ? 'Turn every card back' : 'Flip every card'}
          </Button>
        </div>
      </div>
    </div>
  );
}
