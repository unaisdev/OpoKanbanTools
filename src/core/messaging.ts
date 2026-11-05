import type { GlobalSecretKey, PublicSettings, Secrets } from './types';

export type OktRequest =
  | { type: 'GET_SETTINGS' }
  | { type: 'SET_TOOL_ENABLED'; toolId: string; enabled: boolean }
  | { type: 'SET_TOOL_CONFIG'; toolId: string; config: Record<string, unknown> }
  | { type: 'SET_SECRETS'; secrets: Partial<Secrets> }
  | { type: 'CLEAR_SECRET'; key: GlobalSecretKey };

export type OktEvent = {
  type: 'SETTINGS_UPDATED';
  settings: PublicSettings;
};

export type OktResponse =
  | { ok: true; settings: PublicSettings }
  | { ok: false; error: string };

export async function sendMessage(message: OktRequest): Promise<PublicSettings> {
  const response = (await browser.runtime.sendMessage(message)) as OktResponse;
  if (!response?.ok) {
    throw new Error(response?.error ?? 'Unknown messaging error');
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
    type === 'CLEAR_SECRET'
  );
}
