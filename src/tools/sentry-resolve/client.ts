import type {
  SentryActionResult,
  SentryFindCommentResult,
  SentryIssueDetails,
  SentryMe,
} from './types';

type SentryResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string; status?: number };

async function call<T>(
  action: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const response = (await browser.runtime.sendMessage({
    type: 'SENTRY',
    action,
    payload: payload ?? {},
  })) as SentryResponse;

  if (!response?.ok) {
    throw new Error(response?.error || 'Error desconocido');
  }
  return response.data as T;
}

type IssueRef = {
  apiBase: string;
  org: string;
  issueId: string;
};

export const sentryApi = {
  getIssue: (payload: IssueRef) =>
    call<SentryIssueDetails>('getIssue', payload),

  getMe: (payload: { apiBase: string }) =>
    call<SentryMe>('getMe', payload),

  resolve: (payload: IssueRef) =>
    call<SentryActionResult>('resolve', payload),

  assign: (payload: IssueRef) =>
    call<SentryActionResult>('assign', payload),

  findComment: (payload: IssueRef & { needle: string }) =>
    call<SentryFindCommentResult>('findComment', payload),

  comment: (payload: IssueRef & { comment: string; needle?: string }) =>
    call<SentryActionResult>('comment', payload),

  openOptions: () => call<null>('openOptions'),
};
