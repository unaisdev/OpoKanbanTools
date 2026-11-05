import '@/src/tools';
import {
  isOktRequest,
  isSettingsRequest,
  type OktEvent,
  type OktResponse,
} from '@/src/core/messaging';
import { checkForUpdate } from '@/src/core/release';
import type { PublicSettings } from '@/src/core/types';
import {
  clearSecret,
  getPublicSettings,
  getSecret,
  migrateOnInstall,
  setSecrets,
  setToolConfig,
  setToolEnabled,
} from '@/src/core/storage';
import {
  GitHubError,
  handleCiBuildAction,
} from '@/src/tools/ci-build/githubApi';
import {
  SentryError,
  handleSentryAction,
} from '@/src/tools/sentry-resolve/sentryApi';

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

/** Strip Origin/Referer on Sentry API calls so CSRF does not reject chrome-extension://. */
const SENTRY_STRIP_ORIGIN_RULE_ID = 1001;

async function ensureSentryOriginRules(): Promise<void> {
  try {
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [SENTRY_STRIP_ORIGIN_RULE_ID],
      addRules: [
        {
          id: SENTRY_STRIP_ORIGIN_RULE_ID,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Origin', operation: 'remove' },
              { header: 'Referer', operation: 'remove' },
            ],
          },
          condition: {
            regexFilter: '^https://([^/]+\\.)?sentry\\.io/api/',
            resourceTypes: ['xmlhttprequest', 'other'],
          },
        },
      ],
    });
  } catch (err) {
    console.warn('[OpoKanbanTools] Failed to install Sentry origin rules', err);
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void migrateOnInstall();
    void ensureSentryOriginRules();
  });

  void ensureSentryOriginRules();

  browser.action.onClicked.addListener(() => {
    void browser.runtime.openOptionsPage();
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isOktRequest(message)) return false;

    void (async () => {
      try {
        if (message.type === 'CHECK_UPDATE') {
          const token = await getSecret('github');
          const data = await checkForUpdate(token);
          const response: OktResponse = { ok: true, data };
          sendResponse(response);
          return;
        }

        if (!isSettingsRequest(message)) {
          const data =
            message.type === 'SENTRY'
              ? await handleSentryAction(
                  message.action,
                  message.payload ?? {},
                )
              : await handleCiBuildAction(
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
          status:
            err instanceof GitHubError || err instanceof SentryError
              ? err.status
              : undefined,
        };
        sendResponse(response);
      }
    })();

    return true;
  });
});
