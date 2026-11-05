import { getDefaultToolConfig, getTool } from '@/src/core/registry';
import { getSecret, readStorage, setToolConfig } from '@/src/core/storage';
import {
  DEFAULT_BUILD_NUMBER_OFFSET,
  DEFAULT_OWNER,
  DEFAULT_REPO,
  DEFAULT_WORKFLOW,
  DEFAULT_WORKFLOW_REF,
  FALLBACK_INPUTS,
  TOOL_ID,
  VERSION_SOURCES,
  inferInputsFromJob,
} from './constants';
import type {
  CiBuildConfig,
  PullRequestRef,
  WorkflowInput,
  WorkflowRun,
} from './types';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

async function getCiBuildConfig(): Promise<CiBuildConfig> {
  const data = await readStorage();
  const tool = getTool(TOOL_ID);
  const defaults = tool ? getDefaultToolConfig(tool) : {};
  const config = { ...defaults, ...(data.tools[TOOL_ID]?.config ?? {}) };
  const token = (await getSecret('github')) ?? '';

  return {
    token,
    owner: String(config.owner ?? DEFAULT_OWNER),
    repo: String(config.repo ?? DEFAULT_REPO),
    workflow: String(config.workflow ?? DEFAULT_WORKFLOW),
    workflowRef: String(config.workflowRef ?? DEFAULT_WORKFLOW_REF),
    buildNumberOffset: Number(config.buildNumberOffset ?? DEFAULT_BUILD_NUMBER_OFFSET) || 0,
    lastEnvironment: String(config.lastEnvironment ?? ''),
    lastPlatform: String(config.lastPlatform ?? ''),
  };
}

async function gh(
  path: string,
  {
    method = 'GET',
    body,
    raw = false,
  }: { method?: string; body?: unknown; raw?: boolean } = {},
): Promise<unknown> {
  const cfg = await getCiBuildConfig();
  if (!cfg.token) {
    throw new GitHubError(
      0,
      'Falta el token de GitHub. Configúralo en las opciones de la extensión.',
    );
  }

  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const json = (await res.json()) as { message?: string };
      message = json.message || message;
    } catch {
      // ignore parse errors
    }
    throw new GitHubError(res.status, `GitHub ${res.status}: ${message}`);
  }
  if (res.status === 204) return null;
  if (raw) return res.text();
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const repoPath = (cfg: CiBuildConfig) =>
  `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;

type GhPull = {
  number: number;
  title: string;
  body?: string | null;
  draft?: boolean;
  html_url: string;
  updated_at: string;
  head: { ref: string; repo?: { full_name?: string } | null };
  base: { repo?: { full_name?: string } | null };
};

function toPr(pr: GhPull, source: 'id' | 'title'): PullRequestRef {
  return {
    number: pr.number,
    title: pr.title,
    branch: pr.head.ref,
    fromFork: pr.head.repo?.full_name !== pr.base.repo?.full_name,
    draft: Boolean(pr.draft),
    url: pr.html_url,
    updatedAt: pr.updated_at,
    source,
  };
}

export async function findPullRequests({
  taskId,
  title,
}: {
  taskId: string | null;
  title: string;
}): Promise<PullRequestRef[]> {
  const cfg = await getCiBuildConfig();
  const base = repoPath(cfg);
  const found = new Map<number, PullRequestRef>();

  if (taskId) {
    const needle = `kanbanflow.com/t/${taskId}`;
    for (let page = 1; page <= 3; page++) {
      const prs = (await gh(
        `${base}/pulls?state=open&per_page=100&sort=updated&direction=desc&page=${page}`,
      )) as GhPull[];
      for (const pr of prs) {
        if (pr.body?.includes(needle)) found.set(pr.number, toPr(pr, 'id'));
      }
      if (prs.length < 100) break;
    }
  }

  const cleanTitle = (title || '')
    .replace(/^\s*(\[[^\]]*\]\s*)+/, '')
    .replace(/"/g, '')
    .trim();
  if (!found.size && cleanTitle.length >= 8) {
    const q = `repo:${cfg.owner}/${cfg.repo} is:pr is:open "${cleanTitle}" in:body`;
    const res = (await gh(
      `/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=5`,
    )) as { items: Array<{ number: number }> };
    const prs = await Promise.all(
      res.items.map(
        (it) => gh(`${base}/pulls/${it.number}`) as Promise<GhPull>,
      ),
    );
    for (const pr of prs) found.set(pr.number, toPr(pr, 'title'));
  }

  return [...found.values()];
}

export async function listBranches(): Promise<string[]> {
  const cfg = await getCiBuildConfig();
  const branches: string[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = (await gh(
      `${repoPath(cfg)}/branches?per_page=100&page=${page}`,
    )) as Array<{ name: string }>;
    branches.push(...res.map((b) => b.name));
    if (res.length < 100) break;
  }
  return branches;
}

export async function checkBranch({
  branch,
}: {
  branch: string;
}): Promise<{ exists: boolean }> {
  const cfg = await getCiBuildConfig();
  try {
    await gh(`${repoPath(cfg)}/branches/${encodeURIComponent(branch)}`);
    return { exists: true };
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return { exists: false };
    throw e;
  }
}

/** Minimal parser for `on.workflow_dispatch.inputs` (choice inputs). */
function parseDispatchInputs(yaml: string): WorkflowInput[] | null {
  const lines = yaml.split('\n');
  const indentOf = (l: string) => l.match(/^ */)![0].length;
  const unquote = (v: string) => v.trim().replace(/^['"]|['"]$/g, '');

  const wdIdx = lines.findIndex((l) => /^\s*workflow_dispatch:\s*$/.test(l));
  if (wdIdx < 0) return null;
  const inputsIdx = lines.findIndex(
    (l, i) => i > wdIdx && /^\s*inputs:\s*$/.test(l),
  );
  if (inputsIdx < 0) return [];

  const inputsIndent = indentOf(lines[inputsIdx]!);
  const inputs: WorkflowInput[] = [];
  let current: WorkflowInput | null = null;
  let inOptions = false;
  let inputIndent: number | null = null;

  for (let i = inputsIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const ind = indentOf(line);
    if (ind <= inputsIndent) break;

    if (inputIndent === null) inputIndent = ind;
    if (ind === inputIndent) {
      const m = line.trim().match(/^([\w-]+):\s*$/);
      if (!m) continue;
      current = {
        name: m[1]!,
        description: '',
        default: '',
        type: 'string',
        required: false,
        options: [],
      };
      inputs.push(current);
      inOptions = false;
      continue;
    }
    if (!current) continue;

    const t = line.trim();
    if (inOptions && t.startsWith('- ')) {
      current.options.push(unquote(t.slice(2)));
      continue;
    }
    const kv = t.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    inOptions = kv[1] === 'options' && kv[2] === '';
    if (kv[1] === 'description') current.description = unquote(kv[2]!);
    if (kv[1] === 'default') current.default = unquote(kv[2]!);
    if (kv[1] === 'type') current.type = unquote(kv[2]!);
    if (kv[1] === 'required') current.required = unquote(kv[2]!) === 'true';
  }
  return inputs;
}

export async function getWorkflowInputs(): Promise<{
  inputs: WorkflowInput[];
  source: 'github' | 'fallback';
}> {
  const cfg = await getCiBuildConfig();
  try {
    const yaml = (await gh(
      `${repoPath(cfg)}/contents/.github/workflows/${encodeURIComponent(cfg.workflow)}?ref=${encodeURIComponent(cfg.workflowRef)}`,
      { raw: true },
    )) as string;
    const parsed = parseDispatchInputs(yaml);
    if (parsed?.length) return { inputs: parsed, source: 'github' };
  } catch (e) {
    if (e instanceof GitHubError && e.status === 401) throw e;
  }
  return {
    inputs: FALLBACK_INPUTS.map((i) => ({
      name: i.name,
      description: i.description,
      default: i.default,
      options: [...i.options],
    })),
    source: 'fallback',
  };
}

type GhRun = {
  id: number;
  html_url: string;
  status: string;
  conclusion: string | null;
  head_branch: string;
  created_at: string;
  updated_at: string;
  run_started_at?: string | null;
  run_number: number;
  head_sha?: string;
  triggering_actor?: { login?: string } | null;
  actor?: { login?: string } | null;
};

async function findDispatchedRun({
  branch,
  since,
}: {
  branch: string;
  since: number;
}): Promise<GhRun | null> {
  const cfg = await getCiBuildConfig();
  const path =
    `${repoPath(cfg)}/actions/workflows/${encodeURIComponent(cfg.workflow)}/runs` +
    `?event=workflow_dispatch&branch=${encodeURIComponent(branch)}&per_page=5`;
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    const { workflow_runs: runs } = (await gh(path)) as {
      workflow_runs: GhRun[];
    };
    const run = runs.find(
      (r) => new Date(r.created_at).getTime() >= since - 10_000,
    );
    if (run) return run;
  }
  return null;
}

function toRun(run: GhRun) {
  return {
    id: run.id,
    url: run.html_url,
    status: run.status,
    conclusion: run.conclusion,
    branch: run.head_branch,
    createdAt: new Date(run.created_at).getTime(),
    actor: run.triggering_actor?.login || run.actor?.login || null,
  };
}

const metaKey = (id: number) => `okt.ci-build.meta:${id}`;

async function getRunMeta(
  id: number,
): Promise<{ inputs?: Record<string, string>; version?: string }> {
  const stored = await browser.storage.local.get(metaKey(id));
  return (stored[metaKey(id)] as { inputs?: Record<string, string>; version?: string }) || {};
}

async function setRunMeta(
  id: number,
  patch: { inputs?: Record<string, string>; version?: string },
): Promise<void> {
  const current = await getRunMeta(id);
  await browser.storage.local.set({
    [metaKey(id)]: { ...current, ...patch },
  });
}

async function inferInputs(
  cfg: CiBuildConfig,
  runId: number,
): Promise<Record<string, string> | null> {
  const { jobs } = (await gh(
    `${repoPath(cfg)}/actions/runs/${runId}/jobs?filter=latest&per_page=20`,
  )) as {
    jobs: Array<{ name: string; conclusion: string | null }>;
  };
  const executed = jobs.filter((j) => j.conclusion !== 'skipped');
  if (executed.length !== 1 || executed.length === jobs.length) return null;
  return inferInputsFromJob(executed[0]!.name);
}

async function readAppVersion(
  cfg: CiBuildConfig,
  sha: string,
  platform?: string,
): Promise<string | null> {
  const source =
    (platform && VERSION_SOURCES[platform as keyof typeof VERSION_SOURCES]) ||
    VERSION_SOURCES.firebase;
  const text = (await gh(
    `${repoPath(cfg)}/contents/${source.path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}?ref=${encodeURIComponent(sha)}`,
    { raw: true },
  )) as string;
  return text.match(source.regex)?.[1]?.trim() || null;
}

async function enrichRun(
  raw: GhRun,
  knownInputs: Record<string, string> | null = null,
): Promise<WorkflowRun> {
  const cfg = await getCiBuildConfig();
  const run = toRun(raw);
  const meta = await getRunMeta(run.id);

  let inputs = knownInputs;
  let inputsInferred = false;
  if (!inputs && meta.inputs) {
    inputs = meta.inputs;
    inputsInferred = true;
  }
  if (!inputs) {
    try {
      const inferred = await inferInputs(cfg, run.id);
      if (inferred) {
        inputs = inferred;
        inputsInferred = true;
        await setRunMeta(run.id, { inputs: inferred });
      }
    } catch (e) {
      if (e instanceof GitHubError && e.status === 401) throw e;
    }
  }

  let version = meta.version ?? null;
  if (run.conclusion === 'success' && !version && raw.head_sha) {
    try {
      version = await readAppVersion(cfg, raw.head_sha, inputs?.platform);
      if (version) await setRunMeta(run.id, { version });
    } catch {
      // version lookup is best-effort
    }
  }

  const started = raw.run_started_at
    ? new Date(raw.run_started_at).getTime()
    : null;
  return {
    ...run,
    inputs,
    inputsInferred,
    tracked: Boolean(knownInputs),
    runNumber: raw.run_number,
    buildNumber: raw.run_number + Number(cfg.buildNumberOffset || 0),
    version,
    durationMs:
      run.status === 'completed' && started
        ? new Date(raw.updated_at).getTime() - started
        : null,
  };
}

const TRACK_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TRACKED = 20;
const MAX_LISTED = 15;
const runsKey = (taskKey: string) => `okt.ci-build.runs:${taskKey}`;

type TrackedEntry = {
  id: number;
  branch: string;
  inputs: Record<string, string>;
  createdAt: number;
};

async function readTracked(taskKey: string): Promise<TrackedEntry[]> {
  const key = runsKey(taskKey);
  const stored = await browser.storage.local.get(key);
  const list = (stored[key] as TrackedEntry[] | undefined) || [];
  return list.filter((r) => Date.now() - r.createdAt < TRACK_MS);
}

async function trackRun(taskKey: string, entry: TrackedEntry): Promise<void> {
  const list = (await readTracked(taskKey)).filter((r) => r.id !== entry.id);
  await browser.storage.local.set({
    [runsKey(taskKey)]: [entry, ...list].slice(0, MAX_TRACKED),
  });
}

export async function getTaskRuns({
  taskKey,
  branches = [],
}: {
  taskKey: string | null;
  branches?: string[];
}): Promise<WorkflowRun[]> {
  const cfg = await getCiBuildConfig();
  const base = repoPath(cfg);
  const tracked = taskKey ? await readTracked(taskKey) : [];
  const trackedInputs = new Map(tracked.map((t) => [t.id, t.inputs]));
  const raws = new Map<number, GhRun>();

  for (const branch of [...new Set(branches)].slice(0, 5)) {
    const { workflow_runs: runs } = (await gh(
      `${base}/actions/workflows/${encodeURIComponent(cfg.workflow)}/runs` +
        `?event=workflow_dispatch&branch=${encodeURIComponent(branch)}&per_page=10`,
    )) as { workflow_runs: GhRun[] };
    for (const r of runs) raws.set(r.id, r);
  }

  await Promise.all(
    tracked
      .filter((t) => !raws.has(t.id))
      .map(async (t) => {
        try {
          raws.set(t.id, (await gh(`${base}/actions/runs/${t.id}`)) as GhRun);
        } catch (e) {
          if (e instanceof GitHubError && e.status === 401) throw e;
        }
      }),
  );
  if (taskKey) {
    await browser.storage.local.set({
      [runsKey(taskKey)]: tracked.filter((t) => raws.has(t.id)),
    });
  }

  const latest = [...raws.values()]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, MAX_LISTED);
  return Promise.all(latest.map((r) => enrichRun(r, trackedInputs.get(r.id) ?? null)));
}

export async function dispatch({
  branch,
  inputs,
  taskKey,
}: {
  branch: string;
  inputs: Record<string, string>;
  taskKey: string | null;
}): Promise<{ run: WorkflowRun | null; actionsUrl: string }> {
  const cfg = await getCiBuildConfig();
  const since = Date.now();
  const res = (await gh(
    `${repoPath(cfg)}/actions/workflows/${encodeURIComponent(cfg.workflow)}/dispatches`,
    {
      method: 'POST',
      body: { ref: branch, inputs, return_run_details: true },
    },
  )) as { workflow_run_id?: number } | null;

  await setToolConfig(TOOL_ID, {
    lastEnvironment: inputs.environment ?? '',
    lastPlatform: inputs.platform ?? '',
  });

  const raw = res?.workflow_run_id
    ? ((await gh(`${repoPath(cfg)}/actions/runs/${res.workflow_run_id}`)) as GhRun)
    : await findDispatchedRun({ branch, since });

  if (raw && taskKey) {
    await trackRun(taskKey, {
      id: raw.id,
      branch,
      inputs,
      createdAt: new Date(raw.created_at).getTime(),
    });
  }

  const actionsUrl = `https://github.com/${cfg.owner}/${cfg.repo}/actions/workflows/${cfg.workflow}`;
  return {
    run: raw ? await enrichRun(raw, inputs) : null,
    actionsUrl,
  };
}

export async function getRun({
  id,
  inputs = null,
}: {
  id: number;
  inputs?: Record<string, string> | null;
}): Promise<WorkflowRun> {
  const cfg = await getCiBuildConfig();
  return enrichRun(
    (await gh(`${repoPath(cfg)}/actions/runs/${id}`)) as GhRun,
    inputs,
  );
}

export async function cancelRun({
  id,
  inputs = null,
}: {
  id: number;
  inputs?: Record<string, string> | null;
}): Promise<WorkflowRun> {
  const cfg = await getCiBuildConfig();
  await gh(`${repoPath(cfg)}/actions/runs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
  return getRun({ id, inputs });
}

export async function testConnection(): Promise<{ login: string }> {
  const cfg = await getCiBuildConfig();
  const user = (await gh('/user')) as { login: string };
  await gh(repoPath(cfg));
  await gh(
    `${repoPath(cfg)}/actions/workflows/${encodeURIComponent(cfg.workflow)}`,
  );
  return { login: user.login };
}

export async function handleCiBuildAction(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<unknown> {
  switch (action) {
    case 'findPullRequests':
      return findPullRequests({
        taskId: (payload.taskId as string | null) ?? null,
        title: String(payload.title ?? ''),
      });
    case 'listBranches':
      return listBranches();
    case 'checkBranch':
      return checkBranch({ branch: String(payload.branch ?? '') });
    case 'getWorkflowInputs':
      return getWorkflowInputs();
    case 'dispatch':
      return dispatch({
        branch: String(payload.branch ?? ''),
        inputs: (payload.inputs as Record<string, string>) ?? {},
        taskKey: (payload.taskKey as string | null) ?? null,
      });
    case 'getRun':
      return getRun({
        id: Number(payload.id),
        inputs: (payload.inputs as Record<string, string> | null) ?? null,
      });
    case 'getTaskRuns':
      return getTaskRuns({
        taskKey: (payload.taskKey as string | null) ?? null,
        branches: (payload.branches as string[]) ?? [],
      });
    case 'cancelRun':
      return cancelRun({
        id: Number(payload.id),
        inputs: (payload.inputs as Record<string, string> | null) ?? null,
      });
    case 'testConnection':
      return testConnection();
    case 'openOptions':
      await browser.runtime.openOptionsPage();
      return null;
    default:
      throw new Error(`Unknown CI Build action: ${action}`);
  }
}
