import { useId, useState, type ReactNode } from 'react';
import styles from './Section.module.css';

type Props = {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  /** When set, the body starts collapsed and the summary stays visible. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  summary?: ReactNode;
};

export function Section({
  title,
  description,
  children,
  action,
  collapsible = false,
  defaultOpen = false,
  summary,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const expanded = !collapsible || open;

  return (
    <section className={styles.root} data-collapsed={collapsible && !open ? '' : undefined}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          {collapsible ? (
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
            >
              <span className={styles.chevron} aria-hidden>
                {open ? '▾' : '▸'}
              </span>
              <span className={styles.titleBlock}>
                <h2 className={styles.title}>{title}</h2>
                {description ? (
                  <span className={styles.description}>{description}</span>
                ) : null}
              </span>
            </button>
          ) : (
            <div className={styles.titleBlock}>
              <h2 className={styles.title}>{title}</h2>
              {description ? (
                <p className={styles.description}>{description}</p>
              ) : null}
            </div>
          )}

          {summary && (!collapsible || !open) ? (
            <div className={styles.summary}>{summary}</div>
          ) : null}
        </div>
        {action ? <div className={styles.action}>{action}</div> : null}
      </header>

      {expanded ? (
        <div className={styles.body} id={collapsible ? panelId : undefined}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
