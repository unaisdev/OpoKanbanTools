import '@/src/tools';
import {
  isOktRequest,
  isSettingsRequest,
  type OktEvent,
  type OktResponse,
} from '@/src/core/messaging';
import type { PublicSettings } from '@/src/core/types';
import {
  clearSecret,
  getPublicSettings,
  migrateOnInstall,
  setSecrets,
  setToolConfig,
  setToolEnabled,
} from '@/src/core/storage';
import {
  GitHubError,
  handleCiBuildAction,
} from '@/src/tools/ci-build/githubApi';

async function broadcastSettings(settings: PublicSettings): Promise<void> {
  const event: OktEvent = { type: 'SETTINGS_UPDATED', settings };
  const tabs = await browser.tabs.query({
    url: ['https://kanbanflow.com/*', 'https://*.kanbanflow.com/*'],
  });
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null) return;
      try {
        await browser.tabs.sendMessage(tab.id, event);
      } catch {
        // Tab may not have the content script yet
      }
    }),
  );
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void migrateOnInstall();
  });

  browser.action.onClicked.addListener(() => {
    void browser.runtime.openOptionsPage();
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isOktRequest(message)) return false;

    void (async () => {
      try {
        if (!isSettingsRequest(message)) {
          const data = await handleCiBuildAction(
            message.action,
            message.payload ?? {},
          );
          const response: OktResponse = { ok: true, data };
          sendResponse(response);
          return;
        }

        let settings;
        switch (message.type) {
          case 'GET_SETTINGS':
            settings = await getPublicSettings();
            break;
          case 'SET_TOOL_ENABLED':
            settings = await setToolEnabled(message.toolId, message.enabled);
            break;
          case 'SET_TOOL_CONFIG':
            settings = await setToolConfig(message.toolId, message.config);
            break;
          case 'SET_SECRETS':
            settings = await setSecrets(message.secrets);
            break;
          case 'CLEAR_SECRET':
            settings = await clearSecret(message.key);
            break;
          default:
            throw new Error('Unhandled message');
        }

        if (message.type !== 'GET_SETTINGS') {
          void broadcastSettings(settings);
        }

        const response: OktResponse = { ok: true, settings };
        sendResponse(response);
      } catch (err) {
        const response: OktResponse = {
          ok: false,
          error: err instanceof Error ? err.message : 'Storage error',
          status: err instanceof GitHubError ? err.status : undefined,
        };
        sendResponse(response);
      }
    })();

    return true;
  });
});
