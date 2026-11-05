import { getSecret } from '@/src/core/storage';
import type { SentryIssueDetails, SentryPublishResult } from './types';

export class SentryError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SentryError';
    this.status = status;
  }
}

type SentryUser = {
  id: string | number;
  name?: string | null;
  email?: string | null;
};

type RawIssue = {
  id?: string;
  shortId?: string;
  title?: string;
  culprit?: string;
  status?: string;
  permalink?: string;
  count?: string;
  userCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  project?: { slug?: string; name?: string };
  assignedTo?: {
    id?: string | number;
    name?: string | null;
    email?: string | null;
    type?: string;
  } | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new SentryError(0, `Falta el parámetro "${key}".`);
  }
  return value.trim();
}

function normalizeApiBase(raw: string): string {
  try {
    const url = new URL(raw);
    if (!/(?:^|\.)sentry\.io$/i.test(url.hostname)) {
      throw new Error('host inválido');
    }
    return url.origin;
  } catch {
    throw new SentryError(0, 'apiBase de Sentry inválido.');
  }
}

function formatSentryErrorBody(body: unknown, fallback: string): string {
  if (!body) return fallback;
  if (typeof body === 'string') return body || fallback;
  const rec = asRecord(body);
  if (!rec) return fallback;

  if (typeof rec.detail === 'string' && rec.detail) return rec.detail;
  if (typeof rec.message === 'string' && rec.message) return rec.message;

  // Field validation errors: { status: ["…"], assignedTo: ["…"] }
  const parts: string[] = [];
  for (const [key, val] of Object.entries(rec)) {
    if (key === 'detail' || key === 'message') continue;
    if (typeof val === 'string') parts.push(`${key}: ${val}`);
    else if (Array.isArray(val)) {
      parts.push(`${key}: ${val.map(String).join(', ')}`);
    } else if (val && typeof val === 'object') {
      parts.push(`${key}: ${JSON.stringify(val)}`);
    }
  }
  if (parts.length) return parts.join('; ');

  try {
    return JSON.stringify(rec);
  } catch {
    return fallback;
  }
}

async function getToken(): Promise<string> {
  const token = (await getSecret('sentry')) ?? '';
  if (!token) {
    throw new SentryError(
      0,
      'Falta el token de Sentry. Configúralo en las opciones de la extensión.',
    );
  }
  return token;
}

async function sentryFetch(
  apiBase: string,
  path: string,
  {
    method = 'GET',
    body,
  }: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const token = await getToken();
  const base = normalizeApiBase(apiBase);
  // credentials: 'omit' is required — with host permissions Chrome would
  // otherwise attach the user's sentry.io session cookies. Mutating calls
  // then hit Sentry CSRF ("Invalid origin: chrome-extension://…").
  const res = await fetch(`${base}/api/0${path}`, {
    method,
    credentials: 'omit',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let parsed: unknown = null;
    try {
      const errText = await res.text();
      try {
        parsed = errText ? (JSON.parse(errText) as unknown) : null;
      } catch {
        parsed = errText || null;
      }
    } catch {
      parsed = null;
    }
    const message = formatSentryErrorBody(
      parsed,
      res.statusText || `Sentry HTTP ${res.status}`,
    );
    throw new SentryError(res.status, message);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapIssue(raw: RawIssue): SentryIssueDetails {
  return {
    id: String(raw.id ?? ''),
    shortId: String(raw.shortId ?? raw.id ?? ''),
    title: String(raw.title ?? '(sin título)'),
    culprit: String(raw.culprit ?? ''),
    status: String(raw.status ?? 'unknown'),
    projectSlug: String(raw.project?.slug ?? ''),
    projectName: String(raw.project?.name ?? raw.project?.slug ?? ''),
    permalink: String(raw.permalink ?? ''),
    assigneeName: raw.assignedTo?.name ?? null,
    assigneeEmail: raw.assignedTo?.email ?? null,
    count: raw.count != null ? String(raw.count) : null,
    userCount: typeof raw.userCount === 'number' ? raw.userCount : null,
    firstSeen: raw.firstSeen ?? null,
    lastSeen: raw.lastSeen ?? null,
  };
}

async function fetchRawIssue(
  apiBase: string,
  org: string,
  issueId: string,
): Promise<RawIssue> {
  return (await sentryFetch(
    apiBase,
    `/organizations/${encodeURIComponent(org)}/issues/${encodeURIComponent(issueId)}/`,
  )) as RawIssue;
}

async function getIssue(payload: Record<string, unknown>): Promise<SentryIssueDetails> {
  const apiBase = requireString(payload, 'apiBase');
  const org = requireString(payload, 'org');
  const issueId = requireString(payload, 'issueId');
  return mapIssue(await fetchRawIssue(apiBase, org, issueId));
}

function pickUser(raw: Record<string, unknown> | null): SentryUser | null {
  if (!raw) return null;
  const nested = asRecord(raw.user);
  const source = nested ?? raw;
  const id = source.id;
  if (id == null || (typeof id !== 'string' && typeof id !== 'number')) {
    return null;
  }
  return {
    id,
    name: typeof source.name === 'string' ? source.name : null,
    email: typeof source.email === 'string' ? source.email : null,
  };
}

async function whoami(apiBase: string): Promise<SentryUser> {
  const user = pickUser(asRecord(await sentryFetch(apiBase, '/auth/')));
  if (!user) {
    throw new SentryError(
      0,
      'No se pudo obtener el usuario del token de Sentry.',
    );
  }
  return user;
}

/**
 * Resolve short IDs (PROJECT-ABC) to the numeric group id that write
 * endpoints expect. GET already accepts short IDs; PUT/notes often 400 otherwise.
 */
function numericIssueId(raw: RawIssue, fallback: string): string {
  const id = raw.id != null ? String(raw.id).trim() : '';
  if (id && /^\d+$/.test(id)) return id;
  return fallback;
}

async function updateIssueResolvedAndAssigned(
  apiBase: string,
  org: string,
  numericId: string,
  projectSlug: string | undefined,
  user: SentryUser,
): Promise<RawIssue> {
  // Matches what the Sentry UI sends for "Resolved in next release".
  const body: Record<string, unknown> = {
    status: 'resolved',
    statusDetails: { inNextRelease: true },
    assignedTo: user.email
      ? user.email
      : `user:${user.id}`,
  };

  const orgPath = `/organizations/${encodeURIComponent(org)}/issues/${encodeURIComponent(numericId)}/`;

  try {
    return (await sentryFetch(apiBase, orgPath, {
      method: 'PUT',
      body,
    })) as RawIssue;
  } catch (first) {
    // Fallback: project bulk-style endpoint the UI also uses.
    if (projectSlug) {
      try {
        const list = (await sentryFetch(
          apiBase,
          `/projects/${encodeURIComponent(org)}/${encodeURIComponent(projectSlug)}/issues/?id=${encodeURIComponent(numericId)}`,
          { method: 'PUT', body },
        )) as RawIssue[] | RawIssue;
        if (Array.isArray(list)) return list[0] ?? {};
        return list;
      } catch {
        // fall through to original error
      }
    }

    // Last resort: status string form from the public docs.
    try {
      return (await sentryFetch(apiBase, orgPath, {
        method: 'PUT',
        body: {
          status: 'resolvedInNextRelease',
          assignedTo: `user:${user.id}`,
        },
      })) as RawIssue;
    } catch {
      throw first;
    }
  }
}

async function postComment(
  apiBase: string,
  org: string,
  numericId: string,
  comment: string,
): Promise<void> {
  const body = { text: comment };
  const attempts: Array<() => Promise<unknown>> = [
    // Classic notes endpoint (numeric issue id).
    () =>
      sentryFetch(apiBase, `/issues/${encodeURIComponent(numericId)}/notes/`, {
        method: 'POST',
        body,
      }),
    // Org-scoped comments.
    () =>
      sentryFetch(
        apiBase,
        `/organizations/${encodeURIComponent(org)}/issues/${encodeURIComponent(numericId)}/comments/`,
        { method: 'POST', body },
      ),
    () =>
      sentryFetch(
        apiBase,
        `/organizations/${encodeURIComponent(org)}/issues/${encodeURIComponent(numericId)}/notes/`,
        { method: 'POST', body },
      ),
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new SentryError(0, 'No se pudo publicar el comentario');
}

async function publish(
  payload: Record<string, unknown>,
): Promise<SentryPublishResult> {
  const apiBase = requireString(payload, 'apiBase');
  const org = requireString(payload, 'org');
  const issueId = requireString(payload, 'issueId');
  const comment = requireString(payload, 'comment');

  const result: SentryPublishResult = {
    resolved: false,
    assigned: false,
    commented: false,
    assigneeName: null,
    permalink: '',
    errors: [],
  };

  let user: SentryUser;
  try {
    user = await whoami(apiBase);
  } catch (e) {
    result.errors.push(
      e instanceof Error ? e.message : 'No se pudo identificar al usuario',
    );
    return result;
  }

  result.assigneeName = user.name || user.email || String(user.id);

  let raw: RawIssue;
  try {
    raw = await fetchRawIssue(apiBase, org, issueId);
  } catch (e) {
    result.errors.push(
      e instanceof Error
        ? `Issue: ${e.message}`
        : 'No se pudo cargar el issue antes de publicar',
    );
    return result;
  }

  const numericId = numericIssueId(raw, issueId);
  const projectSlug = raw.project?.slug;
  result.permalink = String(raw.permalink ?? '');

  try {
    const updated = await updateIssueResolvedAndAssigned(
      apiBase,
      org,
      numericId,
      projectSlug,
      user,
    );
    result.resolved = true;
    result.assigned = true;
    result.permalink = String(updated?.permalink ?? result.permalink);
    if (updated?.assignedTo?.name) {
      result.assigneeName = updated.assignedTo.name;
    }
  } catch (e) {
    result.errors.push(
      e instanceof Error
        ? `Resolver/asignar: ${e.message}`
        : 'No se pudo resolver ni asignar el issue',
    );

    // Try resolve and assign separately so one can succeed.
    try {
      await sentryFetch(
        apiBase,
        `/organizations/${encodeURIComponent(org)}/issues/${encodeURIComponent(numericId)}/`,
        {
          method: 'PUT',
          body: {
            status: 'resolved',
            statusDetails: { inNextRelease: true },
          },
        },
      );
      result.resolved = true;
    } catch (e2) {
      result.errors.push(
        e2 instanceof Error
          ? `Resolver: ${e2.message}`
          : 'No se pudo marcar como resolved in next release',
      );
    }

    try {
      await sentryFetch(
        apiBase,
        `/organizations/${encodeURIComponent(org)}/issues/${encodeURIComponent(numericId)}/`,
        {
          method: 'PUT',
          body: {
            assignedTo: user.email ? user.email : `user:${user.id}`,
          },
        },
      );
      result.assigned = true;
    } catch (e3) {
      result.errors.push(
        e3 instanceof Error
          ? `Asignar: ${e3.message}`
          : 'No se pudo asignar el issue',
      );
    }
  }

  try {
    await postComment(apiBase, org, numericId, comment);
    result.commented = true;
  } catch (e) {
    result.errors.push(
      e instanceof Error
        ? `Comentario: ${e.message}`
        : 'No se pudo publicar el comentario',
    );
  }

  if (!result.permalink) {
    try {
      const issue = await getIssue({ apiBase, org, issueId: numericId });
      result.permalink = issue.permalink;
    } catch {
      // ignore
    }
  }

  return result;
}

export async function handleSentryAction(
  action: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  switch (action) {
    case 'getIssue':
      return getIssue(payload);
    case 'publish':
      return publish(payload);
    case 'openOptions':
      await browser.runtime.openOptionsPage();
      return null;
    default:
      throw new SentryError(0, `Acción Sentry desconocida: ${action}`);
  }
}
