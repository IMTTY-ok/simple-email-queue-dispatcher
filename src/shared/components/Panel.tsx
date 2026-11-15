import type { ReactNode } from 'react';

interface PanelProps {
  /** The module heading, e.g. `MODULE 1 | EMAIL QUEUE CREATOR`. */
  title: string;
  /** A small hint on the right-hand side of the heading bar. */
  hint?: ReactNode;
  /** Buttons or badges rendered at the right of the heading bar. */
  actions?: ReactNode;
  children: ReactNode;
  /** Remove the body padding (for tables and lists that bleed to the edge). */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
}

/**
 * The one card component the whole dashboard is built from.
 *
 * Every module renders inside a `Panel`, so the heading bar, the radius, the
 * hairline and the padding are identical everywhere — one design system
 * rather than five look-alikes.
 */
export function Panel({
  title,
  hint,
  actions,
  children,
  flush = false,
  className = '',
  bodyClassName = '',
}: PanelProps) {
  return (
    <section className={`card ${className}`}>
      <header className="card-head">
        <h2 className="card-title">{title}</h2>
        <div className="flex items-center gap-2 min-w-0">
          {hint && <span className="text-[11px] text-ink-muted truncate">{hint}</span>}
          {actions}
        </div>
      </header>
      <div className={flush ? 'card-body-flush' : `card-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}
