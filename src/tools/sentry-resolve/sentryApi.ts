import { getSecret } from '@/src/core/storage';
import type {
  SentryActionResult,
  SentryExistingComment,
  SentryFindCommentResult,
  SentryIssueDetails,
  SentryMe,
} from './types';

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
  statusDetails?: { inNextRelease?: boolean; [key: string]: unknown };
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

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
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
  const assignedType = raw.assignedTo?.type;
  const assigneeUserId =
    raw.assignedTo && (!assignedType || assignedType === 'user')
      ? raw.assignedTo.id != null
        ? String(raw.assignedTo.id)
        : null
      : null;

  let status = String(raw.status ?? 'unknown');
  if (
    status.toLowerCase() === 'resolved' &&
    raw.statusDetails?.inNextRelease === true
  ) {
    status = 'resolvedInNextRelease';
  }

  return {
    id: String(raw.id ?? ''),
    shortId: String(raw.shortId ?? raw.id ?? ''),
    title: String(raw.title ?? '(sin título)'),
    culprit: String(raw.culprit ?? ''),
    status,
    projectSlug: String(raw.project?.slug ?? ''),
    projectName: String(raw.project?.name ?? raw.project?.slug ?? ''),
    permalink: String(raw.permalink ?? ''),
    assigneeName: raw.assignedTo?.name ?? null,
    assigneeEmail: raw.assignedTo?.email ?? null,
    assigneeUserId,
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

async function getIssue(
  payload: Record<string, unknown>,
): Promise<SentryIssueDetails> {
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

async function getMe(payload: Record<string, unknown>): Promise<SentryMe> {
  const apiBase = requireString(payload, 'apiBase');
  const user = await whoami(apiBase);
  return {
    id: String(user.id),
    name: user.name ?? null,
    email: user.email ?? null,
  };
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

function isResolvedInNextRelease(raw: RawIssue): boolean {
  if (raw.statusDetails?.inNextRelease === true) return true;
  return String(raw.status ?? '').toLowerCase() === 'resolvedinnextrelease';
}

function assigneeTarget(user: SentryUser): string {
  return user.email ? user.email : `user:${user.id}`;
}

function sameAssignee(raw: RawIssue, user: SentryUser): boolean {
  const assigned = raw.assignedTo;
  if (!assigned) return false;
  if (assigned.type && assigned.type !== 'user') return false;
  if (assigned.id != null && String(assigned.id) === String(user.id)) {
    return true;
  }
  if (
    assigned.email &&
    user.email &&
    assigned.email.toLowerCase() === user.email.toLowerCase()
  ) {
    return true;
  }
  return false;
}

async function putIssue(
  apiBase: string,
  org: string,
  numericId: string,
  projectSlug: string | undefined,
  body: Record<string, unknown>,
): Promise<RawIssue> {
  const orgPath = `/organizations/${encodeURIComponent(org)}/issues/${encodeURIComponent(numericId)}/`;

  try {
    return (await sentryFetch(apiBase, orgPath, {
      method: 'PUT',
      body,
    })) as RawIssue;
  } catch (first) {
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
        // fall through
      }
    }
    throw first;
  }
}

async function loadWritableIssue(
  payload: Record<string, unknown>,
): Promise<{
  apiBase: string;
  org: string;
  numericId: string;
  projectSlug: string | undefined;
  raw: RawIssue;
}> {
  const apiBase = requireString(payload, 'apiBase');
  const org = requireString(payload, 'org');
  const issueId = requireString(payload, 'issueId');
  const raw = await fetchRawIssue(apiBase, org, issueId);
  return {
    apiBase,
    org,
    numericId: numericIssueId(raw, issueId),
    projectSlug: raw.project?.slug,
    raw,
  };
}

async function resolveIssue(
  payload: Record<string, unknown>,
): Promise<SentryActionResult> {
  try {
    const { apiBase, org, numericId, projectSlug, raw } =
      await loadWritableIssue(payload);

    if (isResolvedInNextRelease(raw)) {
      return {
        ok: true,
        already: true,
        status: String(raw.status ?? 'resolved'),
        permalink: String(raw.permalink ?? ''),
      };
    }

    const bodyPrimary: Record<string, unknown> = {
      status: 'resolved',
      statusDetails: { inNextRelease: true },
    };

    try {
      const updated = await putIssue(
        apiBase,
        org,
        numericId,
        projectSlug,
        bodyPrimary,
      );
      return {
        ok: true,
        status: String(updated.status ?? 'resolved'),
        permalink: String(updated.permalink ?? raw.permalink ?? ''),
      };
    } catch (first) {
      // Public-docs form as fallback.
      try {
        const updated = await putIssue(apiBase, org, numericId, projectSlug, {
          status: 'resolvedInNextRelease',
        });
        return {
          ok: true,
          status: String(updated.status ?? 'resolvedInNextRelease'),
          permalink: String(updated.permalink ?? raw.permalink ?? ''),
        };
      } catch {
        return {
          ok: false,
          error: errorMessage(first, 'No se pudo marcar como resolved in next release'),
          permalink: String(raw.permalink ?? ''),
        };
      }
    }
  } catch (e) {
    return {
      ok: false,
      error: errorMessage(e, 'No se pudo marcar como resolved in next release'),
    };
  }
}

async function assignIssue(
  payload: Record<string, unknown>,
): Promise<SentryActionResult> {
  try {
    const { apiBase, org, numericId, projectSlug, raw } =
      await loadWritableIssue(payload);

    let user: SentryUser;
    try {
      user = await whoami(apiBase);
    } catch (e) {
      return {
        ok: false,
        error: errorMessage(e, 'No se pudo identificar al usuario del token'),
      };
    }

    const displayName = user.name || user.email || String(user.id);

    if (sameAssignee(raw, user)) {
      return {
        ok: true,
        already: true,
        assigneeName: raw.assignedTo?.name ?? displayName,
        assigneeEmail: raw.assignedTo?.email ?? user.email ?? null,
        assigneeUserId: String(user.id),
        permalink: String(raw.permalink ?? ''),
      };
    }

    try {
      const updated = await putIssue(apiBase, org, numericId, projectSlug, {
        assignedTo: assigneeTarget(user),
      });
      return {
        ok: true,
        assigneeName: updated.assignedTo?.name ?? displayName,
        assigneeEmail: updated.assignedTo?.email ?? user.email ?? null,
        assigneeUserId: String(user.id),
        permalink: String(updated.permalink ?? raw.permalink ?? ''),
      };
    } catch (e) {
      return {
        ok: false,
        error: errorMessage(e, 'No se pudo asignar el issue'),
        permalink: String(raw.permalink ?? ''),
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: errorMessage(e, 'No se pudo asignar el issue'),
    };
  }
}

function commentTextOf(raw: unknown): string | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  if (typeof rec.text === 'string' && rec.text.trim()) return rec.text;
  // Activity-shaped note: data.text / note
  const data = asRecord(rec.data);
  if (data) {
    if (typeof data.text === 'string' && data.text.trim()) return data.text;
    if (typeof data.note === 'string' && data.note.trim()) return data.note;
  }
  if (typeof rec.note === 'string' && rec.note.trim()) return rec.note;
  return null;
}

function mapExistingComment(raw: unknown): SentryExistingComment | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const text = commentTextOf(raw);
  if (!text) return null;
  const id =
    rec.id != null
      ? String(rec.id)
      : typeof rec.event_id === 'string'
        ? rec.event_id
        : text.slice(0, 32);
  const dateCreated =
    typeof rec.dateCreated === 'string'
      ? rec.dateCreated
      : typeof rec.dateAdded === 'string'
        ? rec.dateAdded
        : null;
  return { id, text, dateCreated };
}

function commentMatchesNeedle(text: string, needle: string): boolean {
  const hay = text.toLowerCase();
  const n = needle.trim().toLowerCase();
  if (!n) return false;
  if (hay.includes(n)) return true;
  // Tolerate http↔https and trailing slash differences for Kanban URLs.
  const compact = (s: string) =>
    s.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return compact(hay).includes(compact(n));
}

async function listIssueComments(
  apiBase: string,
  org: string,
  numericId: string,
): Promise<SentryExistingComment[]> {
  const paths = [
    `/organizations/${encodeURIComponent(org)}/issues/${encodeURIComponent(numericId)}/comments/`,
    `/issues/${encodeURIComponent(numericId)}/notes/`,
    `/organizations/${encodeURIComponent(org)}/issues/${encodeURIComponent(numericId)}/notes/`,
  ];

  let lastError: unknown;
  for (const path of paths) {
    try {
      const raw = await sentryFetch(apiBase, path);
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray(asRecord(raw)?.data)
          ? (asRecord(raw)!.data as unknown[])
          : null;
      if (!list) continue;
      return list
        .map(mapExistingComment)
        .filter((c): c is SentryExistingComment => c != null);
    } catch (e) {
      lastError = e;
    }
  }

  if (lastError) {
    throw lastError instanceof Error
      ? lastError
      : new SentryError(0, 'No se pudieron leer los comentarios del issue');
  }
  return [];
}

async function findCommentByNeedle(
  apiBase: string,
  org: string,
  numericId: string,
  needle: string,
): Promise<SentryExistingComment | null> {
  const comments = await listIssueComments(apiBase, org, numericId);
  for (const c of comments) {
    if (commentMatchesNeedle(c.text, needle)) return c;
  }
  return null;
}

async function findComment(
  payload: Record<string, unknown>,
): Promise<SentryFindCommentResult> {
  const needle = requireString(payload, 'needle');
  const { apiBase, org, numericId } = await loadWritableIssue(payload);
  const comment = await findCommentByNeedle(apiBase, org, numericId, needle);
  return { found: Boolean(comment), comment };
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

async function commentIssue(
  payload: Record<string, unknown>,
): Promise<SentryActionResult> {
  try {
    const comment = requireString(payload, 'comment');
    const needle =
      typeof payload.needle === 'string' && payload.needle.trim()
        ? payload.needle.trim()
        : comment;
    const { apiBase, org, numericId, raw } = await loadWritableIssue(payload);
    const permalink = String(raw.permalink ?? '');

    try {
      const existing = await findCommentByNeedle(
        apiBase,
        org,
        numericId,
        needle,
      );
      if (existing) {
        return {
          ok: true,
          already: true,
          permalink,
          existingComment: existing,
        };
      }
    } catch {
      // Listing failed — still try to post; Sentry may also reject duplicates.
    }

    try {
      await postComment(apiBase, org, numericId, comment);
      return {
        ok: true,
        permalink,
      };
    } catch (e) {
      const msg = errorMessage(e, 'No se pudo publicar el comentario');
      // Sentry refuses the same comment twice within an hour.
      if (/same comment|duplicate|already/i.test(msg)) {
        return {
          ok: true,
          already: true,
          permalink,
          error: msg,
        };
      }
      return {
        ok: false,
        error: msg,
        permalink,
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: errorMessage(e, 'No se pudo publicar el comentario'),
    };
  }
}

export async function handleSentryAction(
  action: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  switch (action) {
    case 'getIssue':
      return getIssue(payload);
    case 'getMe':
      return getMe(payload);
    case 'findComment':
      return findComment(payload);
    case 'resolve':
      return resolveIssue(payload);
    case 'assign':
      return assignIssue(payload);
    case 'comment':
      return commentIssue(payload);
    case 'openOptions':
      await browser.runtime.openOptionsPage();
      return null;
    default:
      throw new SentryError(0, `Acción Sentry desconocida: ${action}`);
  }
}
