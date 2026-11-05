import type { SentryIssueDetails, SentryPublishResult } from './types';

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

export const sentryApi = {
  getIssue: (payload: {
    apiBase: string;
    org: string;
    issueId: string;
  }) => call<SentryIssueDetails>('getIssue', payload),

  publish: (payload: {
    apiBase: string;
    org: string;
    issueId: string;
    comment: string;
  }) => call<SentryPublishResult>('publish', payload),

  openOptions: () => call<null>('openOptions'),
};
