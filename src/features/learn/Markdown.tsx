import { Fragment, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { parseInline, parseMd, inlineToPlain, type Inline } from '@/lib/md';
import { cn } from '@/lib/cn';
import { Term } from '@/features/reference/Term';
import { isLessonWritten } from '@/content/lessons';
import { lessonPath } from '@/content/modules';
import { useHighlight } from '@/diagram/highlight';

/** Block-level markdown: paragraphs and lists, in the reading style. */
export function Md({ md, className }: { md: string; className?: string }) {
  const blocks = useMemo(() => parseMd(md), [md]);
  return (
    <div className={cn('prose-blueprint', className)}>
      {blocks.map((b, i) => {
        if (b.t === 'p') return <p key={i}>{renderInline(b.c, `p${i}`)}</p>;
        const items = b.items.map((it, j) => <li key={j}>{renderInline(it, `l${i}-${j}`)}</li>);
        return b.t === 'ul' ? <ul key={i}>{items}</ul> : <ol key={i} start={b.start}>{items}</ol>;
      })}
    </div>
  );
}

/** Inline-only markdown, for captions, options and short labels. Line breaks become spaces. */
export function MdInline({ md }: { md: string }) {
  const nodes = useMemo(() => parseInline(md.replace(/\s*\n\s*/g, ' ')), [md]);
  return <>{renderInline(nodes, 'i')}</>;
}

function Strong({ text, children }: { text: string; children: ReactNode }) {
  const highlight = useHighlight();
  const matches = highlight ? highlight.matches(text) : false;
  if (!highlight || !matches) return <strong>{children}</strong>;
  return (
    <strong
      data-node-match="true"
      onMouseEnter={() => highlight.setTerm(text)}
      onMouseLeave={() => highlight.setTerm(null)}
    >
      {children}
    </strong>
  );
}

function LessonLink({ id, children }: { id: string; children: ReactNode }) {
  if (!isLessonWritten(id)) return <>{children}</>;
  return (
    <Link to={lessonPath(id)} className="md-link">
      {children}
    </Link>
  );
}

export function renderInline(nodes: Inline[], prefix: string): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${prefix}-${i}`;
    switch (n.t) {
      case 'text':
        return <Fragment key={key}>{n.v}</Fragment>;
      case 'code':
        return (
          <code key={key} className="md-code">
            {n.v}
          </code>
        );
      case 'em':
        return <em key={key}>{renderInline(n.c, key)}</em>;
      case 'mark':
        return <mark key={key}>{renderInline(n.c, key)}</mark>;
      case 'strong':
        return (
          <Strong key={key} text={inlineToPlain(n.c)}>
            {renderInline(n.c, key)}
          </Strong>
        );
      case 'term':
        return (
          <Term key={key} id={n.id}>
            {renderInline(n.c, key)}
          </Term>
        );
      case 'link': {
        if (n.href.startsWith('lesson:')) {
          return (
            <LessonLink key={key} id={n.href.slice('lesson:'.length)}>
              {renderInline(n.c, key)}
            </LessonLink>
          );
        }
        if (n.href.startsWith('#')) {
          return (
            <a key={key} href={n.href} className="md-link">
              {renderInline(n.c, key)}
            </a>
          );
        }
        if (n.href.startsWith('/')) {
          return (
            <Link key={key} to={n.href} className="md-link">
              {renderInline(n.c, key)}
            </Link>
          );
        }
        return (
          <a key={key} href={n.href} className="md-link" target="_blank" rel="noreferrer">
            {renderInline(n.c, key)}
          </a>
        );
      }
    }
  });
}
