import { Suspense, lazy, useMemo, type ComponentType, type ReactNode } from 'react';
import type { Block, CalloutTone, CompareSide, SimulatorId, SimulatorPreset, TradeoffTable, WidgetId } from '@/content/types';
import { Callout, CalloutLead, type CalloutKind } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import { SequenceDiagram } from '@/diagram/SequenceDiagram';
import { DecisionTree } from '@/diagram/DecisionTree';
import { QuestionView } from '@/features/quiz/QuestionView';
import { getSimulator, type SimulatorProps } from '@/simulators/registry';
import { widgetLoader, type WidgetProps } from '@/widgets/registry';
import { parseMd } from '@/lib/md';
import { cn } from '@/lib/cn';
import { Md, MdInline, renderInline } from './Markdown';

/** Markdown whose first paragraph opens with a callout's bold type label. */
export function MdWithLead({ md, kind, lead }: { md: string; kind: CalloutKind; lead?: string }) {
  const blocks = useMemo(() => parseMd(md), [md]);
  return (
    <div className="prose-blueprint">
      {blocks.map((b, i) => {
        if (b.t === 'p') {
          return (
            <p key={i}>
              {i === 0 ? <CalloutLead kind={kind} text={lead} /> : null}
              {renderInline(b.c, `c${i}`)}
            </p>
          );
        }
        const items = b.items.map((it, j) => <li key={j}>{renderInline(it, `cl${i}-${j}`)}</li>);
        return b.t === 'ul' ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>;
      })}
    </div>
  );
}

const toneToKind: Record<CalloutTone, CalloutKind> = {
  intuition: 'intuition',
  interview: 'interview',
  mistake: 'mistake',
  simplification: 'simplification',
};

/** Width classes: prose stays at reading width; figures may break out wider on big screens. */
export const READ = 'measure';
export const WIDE = 'w-full max-w-[960px]';

export function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'prose':
      return <Md md={block.md} className={READ} />;
    case 'heading':
      return <h3 className={cn(READ, 'pt-2 text-h3 font-bold text-ink')}>{block.text}</h3>;
    case 'callout':
      return (
        <Callout kind={toneToKind[block.tone]} className={READ}>
          <MdWithLead md={block.md} kind={toneToKind[block.tone]} />
        </Callout>
      );
    case 'diagram':
      return (
        <div className={WIDE}>
          <Diagram spec={block.spec} caption={block.caption} title={block.title} />
        </div>
      );
    case 'sequence':
      return (
        <div className={WIDE}>
          <SequenceDiagram spec={block.spec} caption={block.caption} title={block.title} />
        </div>
      );
    case 'decision':
      return (
        <div className={WIDE}>
          <DecisionTree tree={block.tree} title={block.title} caption={block.caption} />
        </div>
      );
    case 'table':
      return <TableView columns={block.columns} rows={block.rows} caption={block.caption} />;
    case 'compare':
      return <CompareView left={block.left} right={block.right} caption={block.caption} />;
    case 'numbers':
      return <NumbersView items={block.items} caption={block.caption} />;
    case 'code':
      return <CodeBlock code={block.code} caption={block.caption} />;
    case 'annotated':
      return <AnnotatedBlock lines={block.lines} title={block.title} caption={block.caption} />;
    case 'widget':
      return <WidgetEmbed id={block.id} props={block.props} title={block.title} caption={block.caption} />;
    case 'simulator':
      return <SimulatorEmbed id={block.id} preset={block.preset} intro={block.intro} />;
    case 'quickCheck':
      return (
        <div className={cn(READ, 'rounded-card border border-rule bg-paper p-5')}>
          <p className="mb-3 text-small font-semibold text-graphite">Quick check</p>
          <QuestionView question={block.question} />
        </div>
      );
  }
}

export function TableView({ columns, rows, caption }: { columns: string[]; rows: string[][]; caption?: string }) {
  return (
    <figure className={cn(WIDE, 'flex flex-col gap-2')}>
      {/* Wide screens: a real table */}
      <div className="hidden overflow-x-auto rounded-card border border-rule bg-paper md:block">
        <table className="w-full border-collapse text-left text-ui">
          <thead>
            <tr className="border-b border-rule">
              {columns.map((c) => (
                <th key={c} scope="col" className="px-4 py-3 font-semibold text-ink">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-rule last:border-b-0 align-top">
                {r.map((cell, j) =>
                  j === 0 ? (
                    <th key={j} scope="row" className="px-4 py-3 font-semibold text-ink">
                      <MdInline md={cell} />
                    </th>
                  ) : (
                    <td key={j} className="px-4 py-3 text-ink">
                      <MdInline md={cell} />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Phones: one block per row, so nothing scrolls sideways */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((r, i) => (
          <dl key={i} className="rounded-card border border-rule bg-paper p-4 text-ui">
            <dt className="sr-only">{columns[0]}</dt>
            <dd className="font-semibold text-ink">
              <MdInline md={r[0] ?? ''} />
            </dd>
            {r.slice(1).map((cell, j) => (
              <div key={j} className="mt-2">
                <dt className="text-small font-semibold text-graphite">{columns[j + 1]}</dt>
                <dd className="text-ink">
                  <MdInline md={cell} />
                </dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
      {caption ? (
        <figcaption className="text-ui text-graphite">
          <MdInline md={caption} />
        </figcaption>
      ) : null}
    </figure>
  );
}

export function TradeoffView({ table }: { table: TradeoffTable }) {
  return (
    <TableView
      columns={['Option', 'Good at', 'Bad at', 'Pick it when']}
      rows={table.rows.map((r) => [r.option, r.goodAt, r.badAt, r.pickWhen])}
      caption={table.caption}
    />
  );
}

function CompareView({ left, right, caption }: { left: CompareSide; right: CompareSide; caption?: string }) {
  // min-w-0 lets each side shrink below its content's width, so a diagram inside can adapt to a phone.
  const side = (s: CompareSide) => (
    <div className="flex min-w-0 flex-col gap-3 rounded-card border border-rule bg-paper p-5">
      <h4 className="font-display text-h3 font-semibold text-ink">{s.title}</h4>
      {s.summary ? (
        <p className="text-ui-lg text-graphite">
          <MdInline md={s.summary} />
        </p>
      ) : null}
      {s.diagram ? <Diagram spec={s.diagram} variant="plain" /> : null}
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-ui-lg text-ink marker:text-graphite">
        {s.points.map((p, i) => (
          <li key={i}>
            <MdInline md={p} />
          </li>
        ))}
      </ul>
      {s.verdict ? (
        <p className="mt-auto border-t border-rule pt-3 text-ui text-ink">
          <MdInline md={s.verdict} />
        </p>
      ) : null}
    </div>
  );
  return (
    <figure className={cn(WIDE, 'flex flex-col gap-2')}>
      <div className="grid gap-4 md:grid-cols-2">
        {side(left)}
        {side(right)}
      </div>
      {caption ? (
        <figcaption className="text-ui text-graphite">
          <MdInline md={caption} />
        </figcaption>
      ) : null}
    </figure>
  );
}

function NumbersView({ items, caption }: { items: { label: string; value: string; note?: string }[]; caption?: string }) {
  return (
    <figure className={cn(READ, 'flex flex-col gap-2')}>
      <dl className="divide-y divide-rule rounded-card border border-rule bg-paper">
        {items.map((it, i) => (
          <div key={`${i}-${it.label}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5">
            <dt className="text-ui-lg text-ink">
              <MdInline md={it.label} />
            </dt>
            <dd className="tabular text-ui-lg font-semibold text-ink">
              {it.value}
              {it.note ? <span className="ml-2 text-small font-normal text-graphite">{it.note}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      {caption ? (
        <figcaption className="text-ui text-graphite">
          <MdInline md={caption} />
        </figcaption>
      ) : null}
    </figure>
  );
}

export function CodeBlock({ code, caption }: { code: string; caption?: string }) {
  return (
    <figure className={cn(READ, 'flex flex-col gap-2')}>
      <pre className="overflow-x-auto rounded-card border border-rule bg-paper px-4 py-3 font-mono text-code text-ink">
        <code>{code}</code>
      </pre>
      {caption ? (
        <figcaption className="text-ui text-graphite">
          <MdInline md={caption} />
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Code-like lines, each with a plain-English note. Notes sit beside the code on wide screens and under it on phones. */
export function AnnotatedBlock({ lines, title, caption }: { lines: { code: string; note?: string }[]; title?: string; caption?: string }) {
  return (
    <figure className={cn(WIDE, 'flex flex-col gap-2')}>
      {title ? <p className="text-ui font-semibold text-ink">{title}</p> : null}
      <ol className="divide-y divide-rule overflow-hidden rounded-card border border-rule bg-paper">
        {lines.map((line, i) => (
          <li key={i} className="grid gap-x-6 gap-y-1 px-4 py-2.5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <code className="font-mono text-code break-all whitespace-pre-wrap text-ink">{line.code || ' '}</code>
            {line.note ? (
              <span className="text-ui text-graphite">
                <MdInline md={line.note} />
              </span>
            ) : (
              <span aria-hidden />
            )}
          </li>
        ))}
      </ol>
      {caption ? (
        <figcaption className="text-ui text-graphite">
          <MdInline md={caption} />
        </figcaption>
      ) : null}
    </figure>
  );
}

const widgetCache = new Map<string, ComponentType<WidgetProps>>();

/** A small interactive widget inside a lesson, framed with its title and caption. */
export function WidgetEmbed({ id, props, title, caption }: { id: WidgetId; props?: SimulatorPreset; title?: string; caption: string }) {
  const load = widgetLoader(id);
  if (!load) return null;
  let C = widgetCache.get(id);
  if (!C) {
    C = lazy(load);
    widgetCache.set(id, C);
  }
  return (
    <figure className={cn(WIDE, 'flex flex-col gap-3')}>
      {title ? <p className="text-ui font-semibold text-ink">{title}</p> : null}
      <Suspense fallback={<SimulatorLoading />}>
        <C props={props} />
      </Suspense>
      <figcaption className="measure text-ui text-graphite">
        <MdInline md={caption} />
      </figcaption>
    </figure>
  );
}

const lazyCache = new Map<string, ComponentType<SimulatorProps>>();
/**
 * One lazy component per simulator, created once at module level. Creating `lazy()` during render
 * would make every retry of a suspended navigation start a new load, so the page would never update.
 */
export function lazySimulator(id: SimulatorId): ComponentType<SimulatorProps> | null {
  const meta = getSimulator(id);
  if (!meta?.load) return null;
  let C = lazyCache.get(id);
  if (!C) {
    C = lazy(meta.load);
    lazyCache.set(id, C);
  }
  return C;
}

export function SimulatorEmbed({ id, preset, intro }: { id: SimulatorId; preset?: SimulatorPreset; intro?: string }) {
  const C = lazySimulator(id);
  if (!C) return null;
  return (
    <div className={cn(WIDE, 'flex flex-col gap-4')}>
      {intro ? <Md md={intro} className={READ} /> : null}
      <Suspense fallback={<SimulatorLoading />}>
        <C preset={preset} embedded />
      </Suspense>
    </div>
  );
}

export function SimulatorLoading(): ReactNode {
  return (
    <div className="blueprint-grid flex h-64 items-center justify-center rounded-panel" role="status">
      <span className="text-ui text-panel-muted">Loading the simulator</span>
    </div>
  );
}
