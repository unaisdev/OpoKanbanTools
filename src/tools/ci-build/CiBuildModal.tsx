import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolModalProps } from '@/src/core/types';
import { ciBuildApi } from './client';
import type { PullRequestRef, WorkflowInput, WorkflowRun } from './types';
import styles from './CiBuildModal.module.css';

const OTHER = '__other__';

const STATUS_LABEL: Record<string, string> = {
  queued: 'en cola',
  in_progress: 'en curso',
  waiting: 'esperando',
  pending: 'pendiente',
  requested: 'solicitado',
  success: 'success',
  failure: 'failure',
  cancelled: 'cancelado',
  skipped: 'skipped',
  timed_out: 'timeout',
};

type View = 'loading' | 'form' | 'runs';
type Flash = { type: 'ok' | 'warn' | 'error'; text: string; link?: string } | null;
type RunUi = { cancelling: boolean; cancelRequested: boolean; cancelError: string | null };

function isActive(run: WorkflowRun): boolean {
  return run.status !== 'completed';
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '';
  const min = Math.round(ms / 60000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

function Badge({ run }: { run: WorkflowRun }) {
  const key = run.conclusion || run.status;
  const tone = !isActive(run)
    ? run.conclusion === 'success'
      ? styles.badgeOk
      : run.conclusion === 'cancelled'
        ? styles.badgeNeutral
        : styles.badgeErr
    : styles.badgeRun;
  return (
    <span className={`${styles.badge} ${tone}`}>
      {isActive(run) ? <span className={styles.spinner} /> : null}
      {STATUS_LABEL[key] || key}
    </span>
  );
}

export function CiBuildModal({
  task,
  config,
  onClose,
  secretStatus,
}: ToolModalProps) {
  const taskKey = task.taskId || (task.title ? `title:${task.title}` : null);
  const owner = String(config.owner ?? 'opositatest');
  const repo = String(config.repo ?? 'react-web-app');
  const missingToken = secretStatus?.github === false;

  const [view, setView] = useState<View>(missingToken ? 'form' : 'loading');
  const [prs, setPrs] = useState<PullRequestRef[]>([]);
  const [prError, setPrError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<WorkflowInput[]>([]);
  const [inputsSource, setInputsSource] = useState<'github' | 'fallback' | null>(
    null,
  );
  const [selection, setSelection] = useState(OTHER);
  const [otherBranch, setOtherBranch] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [runUi, setRunUi] = useState<Record<number, RunUi>>({});
  const [flash, setFlash] = useState<Flash>(null);
  const [historyFromForm, setHistoryFromForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noToken, setNoToken] = useState(missingToken);

  const pollTimer = useRef<number | null>(null);
  const runsRef = useRef(runs);
  const runUiRef = useRef(runUi);
  runsRef.current = runs;
  runUiRef.current = runUi;

  const selectedBranch = (
    selection === OTHER ? otherBranch : selection || ''
  ).trim();

  const getRunUi = (id: number): RunUi =>
    runUi[id] ?? { cancelling: false, cancelRequested: false, cancelError: null };

  const mergeRun = useCallback((fresh: WorkflowRun) => {
    setRuns((prev) =>
      prev.map((r) => (r.id === fresh.id ? { ...r, ...fresh } : r)),
    );
  }, []);

  const pollRuns = useCallback(
    (delay?: number) => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
      const active = runsRef.current.filter(isActive);
      if (!active.length) return;
      const fast = active.some(
        (r) => runUiRef.current[r.id]?.cancelRequested,
      );
      pollTimer.current = window.setTimeout(async () => {
        const results = await Promise.allSettled(
          active.map((r) =>
            ciBuildApi.getRun({
              id: r.id,
              inputs: r.tracked ? r.inputs : null,
            }),
          ),
        );
        results.forEach((res) => {
          if (res.status === 'fulfilled') mergeRun(res.value);
        });
        pollRuns();
      }, delay ?? (fast ? 3000 : 15000));
    },
    [mergeRun],
  );

  useEffect(() => {
    if (missingToken) return;

    let cancelled = false;

    async function load() {
      try {
        const [prsResult, inputsResult] = await Promise.allSettled([
          ciBuildApi.findPullRequests({
            taskId: task.taskId,
            title: task.title,
          }),
          ciBuildApi.getWorkflowInputs(),
        ]);

        if (cancelled) return;

        let nextPrs: PullRequestRef[] = [];
        if (prsResult.status === 'fulfilled') {
          nextPrs = prsResult.value;
          setPrs(nextPrs);
          const first = nextPrs.find((p) => !p.fromFork);
          setSelection(first ? first.branch : OTHER);
        } else {
          const msg = prsResult.reason?.message || String(prsResult.reason);
          if (msg.includes('Falta el token')) {
            setNoToken(true);
            setError(null);
            return;
          }
          setPrError(msg);
        }

        let nextInputs: WorkflowInput[] = [];
        if (inputsResult.status === 'fulfilled') {
          nextInputs = inputsResult.value.inputs;
          setInputs(nextInputs);
          setInputsSource(inputsResult.value.source);
        } else {
          const msg =
            inputsResult.reason?.message || String(inputsResult.reason);
          if (msg.includes('Falta el token')) {
            setNoToken(true);
            return;
          }
          setError(msg);
        }

        const last = {
          environment: String(config.lastEnvironment ?? ''),
          platform: String(config.lastPlatform ?? ''),
        };
        const nextValues: Record<string, string> = {};
        for (const input of nextInputs) {
          const remembered = last[input.name as keyof typeof last];
          nextValues[input.name] =
            remembered &&
            (!input.options.length || input.options.includes(remembered))
              ? remembered
              : input.default || input.options[0] || '';
        }
        setValues(nextValues);

        try {
          const nextRuns = await ciBuildApi.getTaskRuns({
            taskKey,
            branches: nextPrs.filter((p) => !p.fromFork).map((p) => p.branch),
          });
          if (cancelled) return;
          setRuns(nextRuns);
          setView(nextRuns.some(isActive) ? 'runs' : 'form');
          runsRef.current = nextRuns;
          pollRuns();
        } catch (e) {
          if (cancelled) return;
          setRunsError(e instanceof Error ? e.message : String(e));
          setView('form');
        }

        void ciBuildApi.listBranches().then((list) => {
          if (!cancelled) setBranches(list);
        });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('Falta el token')) setNoToken(true);
        else setError(msg);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, [
    missingToken,
    task.taskId,
    task.title,
    taskKey,
    config.lastEnvironment,
    config.lastPlatform,
    pollRuns,
  ]);

  function duplicateRun(branch: string) {
    return runs.find(
      (r) =>
        isActive(r) &&
        r.branch === branch &&
        r.inputs &&
        inputs.every((i) => r.inputs![i.name] === values[i.name]),
    );
  }

  async function handleRun() {
    const branch = selectedBranch;
    if (!branch) return;
    const dup = duplicateRun(branch);
    if (
      dup &&
      !confirm(
        `Ya hay un build igual en curso (Run #${dup.id}). ¿Lanzar otro igualmente?`,
      )
    ) {
      return;
    }
    if (
      values.environment === 'production' &&
      !confirm(`¿Lanzar build de PRODUCTION sobre "${branch}"?`)
    ) {
      return;
    }

    setRunning(true);
    setError(null);
    try {
      if (selection === OTHER) {
        const { exists } = await ciBuildApi.checkBranch({ branch });
        if (!exists) throw new Error(`La rama "${branch}" no existe en GitHub.`);
      }
      const dispatchInputs = { ...values };
      const { run: newRun, actionsUrl } = await ciBuildApi.dispatch({
        branch,
        inputs: dispatchInputs,
        taskKey,
      });
      const summary = `${branch} (${Object.entries(dispatchInputs)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')})`;
      if (newRun) {
        setRuns((prev) => [newRun, ...prev.filter((r) => r.id !== newRun.id)]);
        setFlash({ type: 'ok', text: `Workflow lanzado sobre ${summary}.` });
      } else {
        setFlash({
          type: 'warn',
          text: `Workflow lanzado sobre ${summary}, pero no se ha localizado el run.`,
          link: actionsUrl,
        });
      }
      setView('runs');
      setHistoryFromForm(false);
      pollRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function handleCancel(id: number) {
    const target = runs.find((r) => r.id === id);
    const ui = getRunUi(id);
    if (!target || ui.cancelling) return;
    if (!confirm(`¿Cancelar el run #${id} sobre "${target.branch}"?`)) return;

    setRunUi((prev) => ({
      ...prev,
      [id]: { ...getRunUi(id), cancelling: true, cancelError: null },
    }));
    try {
      mergeRun(
        await ciBuildApi.cancelRun({
          id,
          inputs: target.tracked ? target.inputs : null,
        }),
      );
      setRunUi((prev) => ({
        ...prev,
        [id]: {
          cancelling: false,
          cancelRequested: true,
          cancelError: null,
        },
      }));
      pollRuns(3000);
    } catch (e) {
      setRunUi((prev) => ({
        ...prev,
        [id]: {
          cancelling: false,
          cancelRequested: false,
          cancelError: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  }

  async function copyText(label: string, button: HTMLButtonElement) {
    try {
      await navigator.clipboard.writeText(label);
      button.textContent = 'Copiado ✓';
    } catch {
      button.textContent = 'No se pudo copiar';
    }
  }

  if (noToken) {
    return (
      <div className={styles.error}>
        Falta el token de GitHub.{' '}
        <button
          type="button"
          className={styles.link}
          onClick={() => void ciBuildApi.openOptions()}
        >
          Abrir configuración
        </button>
      </div>
    );
  }

  if (view === 'loading' && !error) {
    return (
      <p>
        <span className={styles.spinner} />
        Buscando PRs, builds previos y leyendo el workflow…
      </p>
    );
  }

  const dup = selectedBranch ? duplicateRun(selectedBranch) : undefined;
  const foreign = selectedBranch
    ? runs.filter(
        (r) => isActive(r) && r.branch === selectedBranch && !r.inputs,
      )
    : [];
  const isProduction = values.environment === 'production';
  const active = runs.filter(isActive);
  const previous = runs.filter((r) => !isActive(r));

  return (
    <div>
      <div className={styles.meta}>
        <strong>{task.title || 'Tarea no detectada'}</strong>
        <span className={styles.muted}>
          {task.taskId ? (
            <a
              href={`https://kanbanflow.com/t/${task.taskId}`}
              target="_blank"
              rel="noreferrer"
            >
              kanbanflow.com/t/{task.taskId}
            </a>
          ) : (
            'ID de tarea no detectado (se buscará por título)'
          )}
          {` · ${owner}/${repo}`}
        </span>
      </div>

      {view === 'runs' ? (
        <>
          {flash ? (
            <div className={styles[flash.type]}>
              {flash.text}
              {flash.link ? (
                <>
                  {' '}
                  <a href={flash.link} target="_blank" rel="noreferrer">
                    Ver en GitHub Actions
                  </a>
                </>
              ) : null}
            </div>
          ) : null}
          {runsError ? (
            <div className={styles.error}>
              No se pudieron cargar los builds: {runsError}
            </div>
          ) : null}
          <p className={styles.muted}>
            Últimos builds en las ramas de la PR y los lanzados desde aquí para
            esta tarea.
          </p>
          <h3 className={styles.sectionTitle}>En curso ({active.length})</h3>
          {active.length ? (
            active.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                ui={getRunUi(run.id)}
                onCancel={handleCancel}
                onCopy={copyText}
              />
            ))
          ) : (
            <p className={styles.muted}>Ningún build en curso.</p>
          )}
          <h3 className={styles.sectionTitle}>
            Anteriores ({previous.length})
          </h3>
          {previous.length ? (
            previous.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                ui={getRunUi(run.id)}
                onCancel={handleCancel}
                onCopy={copyText}
              />
            ))
          ) : (
            <p className={styles.muted}>Sin builds anteriores.</p>
          )}
          <div className={styles.footer}>
            {historyFromForm ? (
              <>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.footerBack}`}
                  onClick={() => {
                    setView('form');
                    setFlash(null);
                    setHistoryFromForm(false);
                  }}
                >
                  ← Volver
                </button>
                <button type="button" className={styles.btn} onClick={onClose}>
                  Cerrar
                </button>
              </>
            ) : (
              <>
                <button type="button" className={styles.btn} onClick={onClose}>
                  Cerrar
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.primary}`}
                  onClick={() => {
                    setView('form');
                    setFlash(null);
                    setHistoryFromForm(false);
                  }}
                >
                  Nuevo build
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          {error ? <div className={styles.error}>{error}</div> : null}
          {prError ? (
            <div className={styles.error}>
              No se pudieron buscar PRs: {prError}
            </div>
          ) : null}

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Rama / PR</legend>
            {prs.length ? (
              prs.map((pr) => (
                <label
                  key={pr.number}
                  className={`${styles.option}${selection === pr.branch ? ` ${styles.optionSelected}` : ''}`}
                >
                  <input
                    type="radio"
                    name="okt-ci-ref"
                    value={pr.branch}
                    checked={selection === pr.branch}
                    disabled={pr.fromFork}
                    onChange={() => setSelection(pr.branch)}
                  />
                  <span>
                    <a href={pr.url} target="_blank" rel="noreferrer">
                      #{pr.number}
                    </a>{' '}
                    {pr.title}
                    {pr.draft ? (
                      <span className={styles.muted}> (draft)</span>
                    ) : null}
                    <br />
                    <span className={styles.branch}>{pr.branch}</span>
                    {pr.source === 'title' ? (
                      <span className={styles.muted}>
                        {' '}
                        · encontrada por título
                      </span>
                    ) : null}
                    {pr.fromFork ? (
                      <span className={styles.muted}>
                        {' '}
                        · PR desde fork, no soportada
                      </span>
                    ) : null}
                  </span>
                </label>
              ))
            ) : (
              <p className={styles.muted}>
                No hay PRs abiertas vinculadas a esta tarea.
              </p>
            )}
            <label
              className={`${styles.option}${selection === OTHER ? ` ${styles.optionSelected}` : ''}`}
            >
              <input
                type="radio"
                name="okt-ci-ref"
                value={OTHER}
                checked={selection === OTHER}
                onChange={() => setSelection(OTHER)}
              />
              <span style={{ flex: 1 }}>
                Otra rama
                <input
                  type="text"
                  className={styles.control}
                  list="okt-ci-branches"
                  placeholder="feat/app-…"
                  value={otherBranch}
                  style={{ marginTop: 6 }}
                  onFocus={() => setSelection(OTHER)}
                  onChange={(e) => setOtherBranch(e.target.value)}
                />
                <datalist id="okt-ci-branches">
                  {branches.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </span>
            </label>
          </fieldset>

          <div className={styles.row}>
            {inputs.map((input) => (
              <div key={input.name}>
                <label
                  className={styles.fieldLabel}
                  htmlFor={`okt-ci-${input.name}`}
                >
                  {input.description || input.name}
                  {input.required ? ' *' : ''}
                </label>
                {input.options.length ? (
                  <select
                    id={`okt-ci-${input.name}`}
                    className={styles.control}
                    value={values[input.name] ?? ''}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [input.name]: e.target.value,
                      }))
                    }
                  >
                    {input.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`okt-ci-${input.name}`}
                    type="text"
                    className={styles.control}
                    value={values[input.name] ?? ''}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [input.name]: e.target.value,
                      }))
                    }
                  />
                )}
              </div>
            ))}
          </div>

          {inputsSource === 'fallback' ? (
            <p className={styles.muted}>
              No se pudo leer el YAML del workflow; usando opciones por defecto.
            </p>
          ) : null}

          {dup ? (
            <div className={styles.warn}>
              ⚠️ Ya hay un build igual {STATUS_LABEL[dup.status] || dup.status}:{' '}
              <a href={dup.url} target="_blank" rel="noreferrer">
                Run #{dup.id}
              </a>
              .{' '}
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  setView('runs');
                  setHistoryFromForm(true);
                }}
              >
                Ver estado
              </button>
            </div>
          ) : null}

          {!dup && foreign.length ? (
            <div className={styles.warn}>
              Hay {foreign.length} build(s) en curso en esta rama lanzados desde
              GitHub (no se conocen sus inputs).{' '}
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  setView('runs');
                  setHistoryFromForm(true);
                }}
              >
                Ver
              </button>
            </div>
          ) : null}

          {isProduction ? (
            <div className={styles.warn}>
              ⚠️ Vas a generar un build contra el entorno <b>production</b>.
            </div>
          ) : null}

          <div className={styles.footer}>
            {runs.length ? (
              <button
                type="button"
                className={`${styles.btn} ${styles.footerBack}`}
                onClick={() => {
                  setView('runs');
                  setHistoryFromForm(true);
                }}
              >
                Historial ({runs.length})
              </button>
            ) : null}
            <button type="button" className={styles.btn} onClick={onClose}>
              Cerrar
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.primary}`}
              disabled={!selectedBranch || running}
              onClick={() => void handleRun()}
            >
              {running ? (
                <>
                  <span className={styles.spinner} />
                  Lanzando…
                </>
              ) : dup ? (
                'Lanzar igualmente'
              ) : (
                'Run workflow'
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RunCard({
  run,
  ui,
  onCancel,
  onCopy,
}: {
  run: WorkflowRun;
  ui: RunUi;
  onCancel: (id: number) => void;
  onCopy: (label: string, button: HTMLButtonElement) => void;
}) {
  const when = new Date(run.createdAt).toLocaleString('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const duration = formatDuration(run.durationMs);
  const inputsText = run.inputs
    ? Object.entries(run.inputs)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ')
    : null;

  return (
    <div
      className={`${styles.runCard}${isActive(run) ? ` ${styles.runCardActive}` : ''}`}
    >
      <div className={styles.runHead}>
        <a href={run.url} target="_blank" rel="noreferrer" title={`Run ${run.id}`}>
          Run #{run.runNumber ?? run.id}
        </a>
        <Badge run={run} />
        <span className={`${styles.muted} ${styles.runWhen}`}>
          {when}
          {duration ? ` · ${duration}` : ''}
        </span>
      </div>
      <div>
        <span className={styles.branch}>{run.branch}</span>
        {run.actor ? (
          <span className={styles.muted}> · {run.actor}</span>
        ) : null}
      </div>
      <div>
        {inputsText ? (
          <>
            {Object.entries(run.inputs!).map(([k, v], i) => (
              <span key={k}>
                {i > 0 ? ' · ' : ''}
                {k}: <b>{v}</b>
              </span>
            ))}
            {run.inputsInferred ? (
              <span className={styles.muted} title="Deducido del job ejecutado">
                {' '}
                (deducido)
              </span>
            ) : null}
          </>
        ) : (
          <span className={styles.muted}>
            inputs aún desconocidos (run en cola)
          </span>
        )}
      </div>
      {run.conclusion === 'success' ? (
        <div className={styles.build}>
          📦 Build{' '}
          <b>
            {run.version
              ? `${run.version} (${run.buildNumber})`
              : `${run.buildNumber}`}
          </b>
          <button
            type="button"
            className={`${styles.btn} ${styles.small} ${styles.buildBtn}`}
            title="Copiar número de build"
            onClick={(e) => {
              const label = run.version
                ? `${run.version} (${run.buildNumber})`
                : `${run.buildNumber}`;
              onCopy(label, e.currentTarget);
            }}
          >
            Copiar
          </button>
        </div>
      ) : isActive(run) ? (
        <div className={styles.muted}>Build previsto: {run.buildNumber}</div>
      ) : null}
      {ui.cancelError ? (
        <div className={styles.error}>
          No se pudo cancelar: {ui.cancelError}
        </div>
      ) : null}
      {isActive(run) ? (
        <div className={styles.runActions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.danger} ${styles.small}`}
            disabled={ui.cancelling || ui.cancelRequested}
            onClick={() => onCancel(run.id)}
          >
            {ui.cancelling ? (
              <>
                <span className={styles.spinner} />
                Cancelando…
              </>
            ) : ui.cancelRequested ? (
              'Cancelación solicitada'
            ) : (
              'Cancelar run'
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
