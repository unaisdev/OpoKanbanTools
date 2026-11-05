import { useEffect, useMemo, useState } from 'react';
import type { ToolModalProps } from '@/src/core/types';
import { sentryApi } from './client';
import type {
  SentryActionResult,
  SentryExistingComment,
  SentryIssueDetails,
  SentryMe,
} from './types';
import styles from './SentryResolveModal.module.css';

type ActionKey = 'resolve' | 'assign' | 'comment';

type ActionUiState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success'; already?: boolean }
  | { kind: 'error'; message: string };

const INITIAL_ACTIONS: Record<ActionKey, ActionUiState> = {
  resolve: { kind: 'idle' },
  assign: { kind: 'idle' },
  comment: { kind: 'idle' },
};

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

function isResolvedStatus(status: string): boolean {
  const s = status.toLowerCase();
  // Treat any resolved* as already done in the UI (incl. plain "resolved").
  return (
    s === 'resolved' ||
    s === 'resolvedinnextrelease' ||
    s.startsWith('resolved')
  );
}

function isAssignedToMe(issue: SentryIssueDetails, me: SentryMe | null): boolean {
  if (!me) return false;
  if (issue.assigneeUserId && issue.assigneeUserId === me.id) return true;
  if (
    issue.assigneeEmail &&
    me.email &&
    issue.assigneeEmail.toLowerCase() === me.email.toLowerCase()
  ) {
    return true;
  }
  return false;
}

function actionStatusClass(state: ActionUiState): string {
  if (state.kind === 'success') return styles.actionOk ?? '';
  if (state.kind === 'error') return styles.actionError ?? '';
  if (state.kind === 'running') return styles.actionRunning ?? '';
  return '';
}

function actionStatusLabel(key: ActionKey, state: ActionUiState): string {
  if (state.kind === 'running') {
    if (key === 'resolve') return 'Resolviendo…';
    if (key === 'assign') return 'Asignando…';
    return 'Publicando comentario…';
  }
  if (state.kind === 'success') {
    if (state.already) {
      if (key === 'resolve') return 'Ya estaba resuelto';
      if (key === 'assign') return 'Ya estabas asignado';
      return 'Ya hay un comentario con el link de Kanban';
    }
    if (key === 'resolve') return 'Resuelto in next release';
    if (key === 'assign') return 'Asignado a ti';
    return 'Comentario publicado';
  }
  if (state.kind === 'error') return state.message;
  return '';
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

  const [loading, setLoading] = useState(!missingToken && Boolean(sentry));
  const [issue, setIssue] = useState<SentryIssueDetails | null>(null);
  const [me, setMe] = useState<SentryMe | null>(null);
  const [existingComment, setExistingComment] =
    useState<SentryExistingComment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noToken, setNoToken] = useState(missingToken);
  const [comment, setComment] = useState(defaultComment);
  const [actions, setActions] =
    useState<Record<ActionKey, ActionUiState>>(INITIAL_ACTIONS);

  const commentNeedle =
    kanbanUrl ||
    (task.taskId ? `kanbanflow.com/t/${task.taskId}` : comment.trim());

  const issueRef = useMemo(
    () =>
      sentry
        ? {
            apiBase: sentry.apiBase,
            org: sentry.org,
            issueId: sentry.issueId,
          }
        : null,
    [sentry?.apiBase, sentry?.org, sentry?.issueId],
  );

  const resolvedDone =
    actions.resolve.kind === 'success' ||
    (issue != null && isResolvedStatus(issue.status));

  const assignedDone =
    actions.assign.kind === 'success' ||
    (issue != null && isAssignedToMe(issue, me));

  const commentedDone =
    actions.comment.kind === 'success' || existingComment != null;

  const anyRunning = Object.values(actions).some((a) => a.kind === 'running');

  useEffect(() => {
    if (missingToken || !sentry) return;

    let cancelled = false;
    const needle = kanbanUrl || (task.taskId ? `kanbanflow.com/t/${task.taskId}` : '');

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const issuePayload = {
          apiBase: sentry!.apiBase,
          org: sentry!.org,
          issueId: sentry!.issueId,
        };
        const [details, user, found] = await Promise.all([
          sentryApi.getIssue(issuePayload),
          sentryApi.getMe({ apiBase: sentry!.apiBase }).catch(() => null),
          needle
            ? sentryApi
                .findComment({ ...issuePayload, needle })
                .catch(() => ({ found: false, comment: null }))
            : Promise.resolve({ found: false, comment: null }),
        ]);
        if (cancelled) return;
        setIssue(details);
        setMe(user);
        setExistingComment(found.comment);
        setActions({
          resolve: isResolvedStatus(details.status)
            ? { kind: 'success', already: true }
            : { kind: 'idle' },
          assign:
            user && isAssignedToMe(details, user)
              ? { kind: 'success', already: true }
              : { kind: 'idle' },
          comment: found.found
            ? { kind: 'success', already: true }
            : { kind: 'idle' },
        });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('Falta el token')) {
          setNoToken(true);
          return;
        }
        setLoadError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    missingToken,
    sentry?.apiBase,
    sentry?.org,
    sentry?.issueId,
    kanbanUrl,
    task.taskId,
  ]);

  function applyActionResult(
    key: ActionKey,
    result: SentryActionResult,
  ): void {
    if (!result.ok) {
      setActions((prev) => ({
        ...prev,
        [key]: {
          kind: 'error',
          message: result.error || 'Error desconocido',
        },
      }));
      return;
    }

    setActions((prev) => ({
      ...prev,
      [key]: { kind: 'success', already: result.already },
    }));

    if (key === 'comment' && result.existingComment) {
      setExistingComment(result.existingComment);
    }

    setIssue((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      if (result.permalink) next.permalink = result.permalink;
      if (key === 'resolve' && result.status) {
        next.status = result.status;
      }
      if (key === 'assign') {
        if (result.assigneeName !== undefined) {
          next.assigneeName = result.assigneeName;
        }
        if (result.assigneeEmail !== undefined) {
          next.assigneeEmail = result.assigneeEmail ?? null;
        }
        if (result.assigneeUserId !== undefined) {
          next.assigneeUserId = result.assigneeUserId ?? null;
        }
      }
      return next;
    });
  }

  async function runAction(key: ActionKey) {
    if (!issueRef || anyRunning) return;

    setActions((prev) => ({ ...prev, [key]: { kind: 'running' } }));

    try {
      let result: SentryActionResult;
      if (key === 'resolve') {
        result = await sentryApi.resolve(issueRef);
      } else if (key === 'assign') {
        result = await sentryApi.assign(issueRef);
      } else {
        const text = comment.trim();
        if (!text) {
          setActions((prev) => ({
            ...prev,
            comment: {
              kind: 'error',
              message: 'El comentario no puede estar vacío',
            },
          }));
          return;
        }
        result = await sentryApi.comment({
          ...issueRef,
          comment: text,
          needle: commentNeedle || text,
        });
        if (result.ok && !result.existingComment) {
          setExistingComment({
            id: 'local',
            text,
            dateCreated: new Date().toISOString(),
          });
        }
      }
      applyActionResult(key, result);
    } catch (e) {
      setActions((prev) => ({
        ...prev,
        [key]: {
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        },
      }));
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

  if (loading && !loadError) {
    return (
      <p>
        <span className={styles.spinner} />
        Cargando issue de Sentry…
      </p>
    );
  }

  const permalink = issue?.permalink || sentry.url;

  return (
    <div>
      {!task.taskId ? (
        <div className={styles.warn}>
          No se ha detectado el ID de la tarea de KanbanFlow. Sin él no se puede
          publicar el comentario con el enlace. Cierra el panel, vuelve a abrir
          la tarea e inténtalo de nuevo.
        </div>
      ) : null}

      {loadError ? <div className={styles.error}>{loadError}</div> : null}

      {issue ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Issue de Sentry</div>
          <p className={styles.issueTitle}>
            <a href={permalink} target="_blank" rel="noreferrer">
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
              {assignedDone && me ? (
                <span className={styles.muted}> · tú</span>
              ) : null}
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
      ) : !loadError ? (
        <div className={styles.warn}>
          No se pudo cargar el detalle del issue ({sentry.org} / {sentry.issueId}
          ). Aun así puedes intentar las acciones.
        </div>
      ) : null}

      <div className={styles.sectionTitle}>Acciones</div>
      <div className={styles.actions}>
        <ActionRow
          actionKey="resolve"
          title="Resolver in next release"
          description="Marca el issue como resolved para la siguiente release."
          state={actions.resolve}
          done={resolvedDone}
          busy={anyRunning}
          disabled={!issueRef}
          buttonLabel={
            resolvedDone
              ? actions.resolve.kind === 'success' && actions.resolve.already
                ? 'Ya resuelto'
                : 'Hecho'
              : 'Resolver'
          }
          onRun={() => void runAction('resolve')}
        />

        <ActionRow
          actionKey="assign"
          title="Asignarme"
          description={
            me?.name || me?.email
              ? `Asigna el issue a ${me.name || me.email}.`
              : 'Asigna el issue al usuario del token de Sentry.'
          }
          state={actions.assign}
          done={assignedDone}
          busy={anyRunning}
          disabled={!issueRef}
          buttonLabel={
            assignedDone
              ? actions.assign.kind === 'success' && actions.assign.already
                ? 'Ya asignado'
                : 'Hecho'
              : 'Asignar'
          }
          onRun={() => void runAction('assign')}
        />

        <div
          className={`${styles.actionRow} ${actionStatusClass(actions.comment)}`.trim()}
        >
          <div className={styles.actionBody}>
            <div className={styles.actionTitle}>Comentar con link de Kanban</div>
            <div className={styles.actionDesc}>
              Publica un comentario en el issue con el enlace a la tarea. Al
              abrir el panel se comprueba si ya existe uno con ese link.
            </div>
            {existingComment ? (
              <div className={styles.existingComment}>
                <div className={styles.existingCommentMeta}>
                  Comentario existente
                  {existingComment.dateCreated
                    ? ` · ${formatWhen(existingComment.dateCreated)}`
                    : ''}
                </div>
                <pre className={styles.existingCommentText}>
                  {existingComment.text}
                </pre>
              </div>
            ) : (
              <>
                <label className={styles.fieldLabel} htmlFor="okt-sentry-comment">
                  Comentario
                </label>
                <textarea
                  id="okt-sentry-comment"
                  className={styles.textarea}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={!task.taskId || commentedDone || anyRunning}
                  placeholder="Kanban: https://kanbanflow.com/t/…"
                />
              </>
            )}
            {actions.comment.kind !== 'idle' ? (
              <div
                className={
                  actions.comment.kind === 'error'
                    ? styles.actionFeedbackError
                    : styles.actionFeedbackOk
                }
              >
                {actionStatusLabel('comment', actions.comment)}
              </div>
            ) : null}
          </div>
          <div className={styles.actionAside}>
            <button
              type="button"
              className={`${styles.btn} ${commentedDone ? styles.doneBtn : styles.primary}`}
              disabled={
                !issueRef ||
                !task.taskId ||
                (!existingComment && !comment.trim()) ||
                commentedDone ||
                anyRunning
              }
              onClick={() => void runAction('comment')}
            >
              {actions.comment.kind === 'running' ? (
                <>
                  <span className={styles.spinner} />
                  …
                </>
              ) : commentedDone ? (
                actions.comment.kind === 'success' && actions.comment.already
                  ? 'Ya comentado'
                  : 'Hecho'
              ) : actions.comment.kind === 'error' ? (
                'Reintentar'
              ) : (
                'Comentar'
              )}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        {permalink ? (
          <a
            className={styles.btn}
            href={permalink}
            target="_blank"
            rel="noreferrer"
          >
            Abrir en Sentry
          </a>
        ) : null}
        <button type="button" className={styles.btn} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

function ActionRow({
  actionKey,
  title,
  description,
  state,
  done,
  busy,
  disabled,
  buttonLabel,
  onRun,
}: {
  actionKey: ActionKey;
  title: string;
  description: string;
  state: ActionUiState;
  done: boolean;
  busy: boolean;
  disabled: boolean;
  buttonLabel: string;
  onRun: () => void;
}) {
  const showRetry = state.kind === 'error';
  const label = showRetry ? 'Reintentar' : buttonLabel;

  return (
    <div className={`${styles.actionRow} ${actionStatusClass(state)}`.trim()}>
      <div className={styles.actionBody}>
        <div className={styles.actionTitle}>{title}</div>
        <div className={styles.actionDesc}>{description}</div>
        {state.kind !== 'idle' ? (
          <div
            className={
              state.kind === 'error'
                ? styles.actionFeedbackError
                : styles.actionFeedbackOk
            }
          >
            {actionStatusLabel(actionKey, state)}
          </div>
        ) : null}
      </div>
      <div className={styles.actionAside}>
        <button
          type="button"
          className={`${styles.btn} ${done && !showRetry ? styles.doneBtn : styles.primary}`}
          disabled={disabled || busy || (done && !showRetry)}
          onClick={onRun}
        >
          {state.kind === 'running' ? (
            <>
              <span className={styles.spinner} />
              …
            </>
          ) : (
            label
          )}
        </button>
      </div>
    </div>
  );
}
