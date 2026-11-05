import type { GlobalSecretKey, PublicSettings, Secrets } from './types';

export type OktSettingsRequest =
  | { type: 'GET_SETTINGS' }
  | { type: 'SET_TOOL_ENABLED'; toolId: string; enabled: boolean }
  | { type: 'SET_TOOL_CONFIG'; toolId: string; config: Record<string, unknown> }
  | { type: 'SET_SECRETS'; secrets: Partial<Secrets> }
  | { type: 'CLEAR_SECRET'; key: GlobalSecretKey };

export type OktCiBuildRequest = {
  type: 'CI_BUILD';
  action: string;
  payload?: Record<string, unknown>;
};

export type OktSentryRequest = {
  type: 'SENTRY';
  action: string;
  payload?: Record<string, unknown>;
};

export type OktRequest =
  | OktSettingsRequest
  | OktCiBuildRequest
  | OktSentryRequest;

export type OktEvent = {
  type: 'SETTINGS_UPDATED';
  settings: PublicSettings;
};

export type OktResponse =
  | { ok: true; settings: PublicSettings }
  | { ok: true; data: unknown }
  | { ok: false; error: string; status?: number };

export async function sendMessage(
  message: OktSettingsRequest,
): Promise<PublicSettings> {
  const response = (await browser.runtime.sendMessage(message)) as OktResponse;
  if (!response?.ok) {
    throw new Error(
      !response || !('error' in response)
        ? 'Unknown messaging error'
        : response.error,
    );
  }
  if (!('settings' in response)) {
    throw new Error('Unexpected response shape');
  }
  return response.settings;
}

export function isOktRequest(value: unknown): value is OktRequest {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === 'GET_SETTINGS' ||
    type === 'SET_TOOL_ENABLED' ||
    type === 'SET_TOOL_CONFIG' ||
    type === 'SET_SECRETS' ||
    type === 'CLEAR_SECRET' ||
    type === 'CI_BUILD' ||
    type === 'SENTRY'
  );
}

export function isSettingsRequest(
  value: OktRequest,
): value is OktSettingsRequest {
  return value.type !== 'CI_BUILD' && value.type !== 'SENTRY';
}
