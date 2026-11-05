import { useEffect, useMemo, useState } from 'react';
import type { ToolModalProps } from '@/src/core/types';
import { sentryApi } from './client';
import type { SentryIssueDetails, SentryPublishResult } from './types';
import styles from './SentryResolveModal.module.css';

type View = 'loading' | 'ready' | 'done';

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  const base = styles.badge ?? '';
  if (s === 'unresolved' || s === 'regressed') {
    return `${base} ${styles.badgeUnresolved ?? ''}`.trim();
  }
  if (s === 'resolved' || s === 'resolvedinnextrelease' || s.startsWith('resolved')) {
    return `${base} ${styles.badgeResolved ?? ''}`.trim();
  }
  return base;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function SentryResolveModal({
  task,
  onClose,
  secretStatus,
}: ToolModalProps) {
  const sentry = task.links.sentryIssue;
  const missingToken = secretStatus?.sentry === false;
  const kanbanUrl = task.taskId
    ? `https://kanbanflow.com/t/${task.taskId}`
    : null;
  const defaultComment = kanbanUrl ? `Kanban: ${kanbanUrl}` : '';

  const [view, setView] = useState<View>(
    missingToken || !sentry ? 'ready' : 'loading',
  );
  const [issue, setIssue] = useState<SentryIssueDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noToken, setNoToken] = useState(missingToken);
  const [comment, setComment] = useState(defaultComment);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<SentryPublishResult | null>(null);

  const canPublish = useMemo(
    () =>
      Boolean(
        sentry?.apiBase &&
          sentry.org &&
          sentry.issueId &&
          task.taskId &&
          comment.trim() &&
          !publishing &&
          !noToken &&
          issue,
      ),
    [sentry, task.taskId, comment, publishing, noToken, issue],
  );

  useEffect(() => {
    if (missingToken || !sentry) return;

    let cancelled = false;

    async function load() {
      try {
        const details = await sentryApi.getIssue({
          apiBase: sentry!.apiBase,
          org: sentry!.org,
          issueId: sentry!.issueId,
        });
        if (cancelled) return;
        setIssue(details);
        setView('ready');
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('Falta el token')) {
          setNoToken(true);
          setView('ready');
          return;
        }
        setError(msg);
        setView('ready');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [missingToken, sentry?.apiBase, sentry?.org, sentry?.issueId]);

  async function handlePublish() {
    if (!sentry || !canPublish) return;
    setPublishing(true);
    setError(null);
    try {
      const published = await sentryApi.publish({
        apiBase: sentry.apiBase,
        org: sentry.org,
        issueId: sentry.issueId,
        comment: comment.trim(),
      });
      setResult(published);
      setView('done');
      if (published.resolved || published.assigned || published.commented) {
        setIssue((prev) =>
          prev
            ? {
                ...prev,
                status: published.resolved
                  ? 'resolvedInNextRelease'
                  : prev.status,
                assigneeName: published.assigned
                  ? published.assigneeName
                  : prev.assigneeName,
                permalink: published.permalink || prev.permalink,
              }
            : prev,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  }

  if (noToken) {
    return (
      <div className={styles.error}>
        Falta el token de Sentry.{' '}
        <button
          type="button"
          className={styles.link}
          onClick={() => void sentryApi.openOptions()}
        >
          Abrir configuración
        </button>
      </div>
    );
  }

  if (!sentry) {
    return (
      <div className={styles.error}>
        Esta tarea no tiene un enlace a un issue de Sentry en el título o la
        descripción.
      </div>
    );
  }

  if (view === 'loading' && !error) {
    return (
      <p>
        <span className={styles.spinner} />
        Cargando issue de Sentry…
      </p>
    );
  }

  const allOk =
    result &&
    result.resolved &&
    result.assigned &&
    result.commented &&
    result.errors.length === 0;

  return (
    <div>
      <div className={styles.meta}>
        <strong>{task.title || 'Tarea no detectada'}</strong>
        <span className={styles.muted}>
          {kanbanUrl ? (
            <a href={kanbanUrl} target="_blank" rel="noreferrer">
              kanbanflow.com/t/{task.taskId}
            </a>
          ) : (
            'ID de tarea no detectado — necesario para el comentario'
          )}
        </span>
      </div>

      {!task.taskId ? (
        <div className={styles.warn}>
          No se ha detectado el ID de la tarea de KanbanFlow. Sin él no se puede
          publicar el comentario con el enlace. Cierra el panel, vuelve a abrir
          la tarea e inténtalo de nuevo.
        </div>
      ) : null}

      {error ? <div className={styles.error}>{error}</div> : null}

      {issue ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Issue de Sentry</div>
          <p className={styles.issueTitle}>
            <a
              href={issue.permalink || sentry.url}
              target="_blank"
              rel="noreferrer"
            >
              {issue.shortId}
            </a>
            {' · '}
            {issue.title}
          </p>
          {issue.culprit ? (
            <div className={`${styles.muted} ${styles.mono}`}>{issue.culprit}</div>
          ) : null}
          <dl className={styles.row}>
            <dt>Proyecto</dt>
            <dd>{issue.projectName || issue.projectSlug || '—'}</dd>
            <dt>Estado</dt>
            <dd>
              <span className={statusBadgeClass(issue.status)}>
                {issue.status}
              </span>
            </dd>
            <dt>Asignado</dt>
            <dd>
              {issue.assigneeName ||
                issue.assigneeEmail ||
                'Sin asignar'}
            </dd>
            <dt>Eventos</dt>
            <dd>
              {issue.count ?? '—'}
              {issue.userCount != null ? ` · ${issue.userCount} users` : ''}
            </dd>
            <dt>Visto</dt>
            <dd>
              {formatWhen(issue.firstSeen)} → {formatWhen(issue.lastSeen)}
            </dd>
          </dl>
        </div>
      ) : !error ? (
        <div className={styles.warn}>
          No se pudo cargar el detalle del issue ({sentry.org} / {sentry.issueId}
          ).
        </div>
      ) : null}

      {view === 'done' && result ? (
        <>
          <div className={allOk ? styles.ok : styles.warn}>
            {allOk
              ? 'Publicado en Sentry: resuelto para la siguiente release, asignado y comentado.'
              : 'Publicación parcial — revisa el detalle:'}
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              <li>
                Resolver (next release): {result.resolved ? 'ok' : 'falló'}
              </li>
              <li>
                Asignar
                {result.assigneeName ? ` (${result.assigneeName})` : ''}:{' '}
                {result.assigned ? 'ok' : 'falló'}
              </li>
              <li>Comentario: {result.commented ? 'ok' : 'falló'}</li>
            </ul>
            {result.errors.length ? (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {result.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            ) : null}
            {result.permalink ? (
              <p style={{ margin: '8px 0 0' }}>
                <a href={result.permalink} target="_blank" rel="noreferrer">
                  Abrir issue en Sentry
                </a>
              </p>
            ) : null}
          </div>
          <div className={styles.footer}>
            <button type="button" className={styles.btn} onClick={onClose}>
              Cerrar
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.sectionTitle}>Al publicar</div>
          <ul className={styles.actionsPreview}>
            <li>Marcar como resolved in next release</li>
            <li>Asignarte (usuario del token)</li>
            <li>Dejar el comentario con el link de Kanban</li>
          </ul>

          <label className={styles.fieldLabel} htmlFor="okt-sentry-comment">
            Comentario
          </label>
          <textarea
            id="okt-sentry-comment"
            className={styles.textarea}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={!task.taskId}
            placeholder="Kanban: https://kanbanflow.com/t/…"
          />

          <div className={styles.footer}>
            <button type="button" className={styles.btn} onClick={onClose}>
              Cerrar
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.primary}`}
              disabled={!canPublish}
              onClick={() => void handlePublish()}
            >
              {publishing ? (
                <>
                  <span className={styles.spinner} />
                  Publicando…
                </>
              ) : (
                'Publicar'
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
