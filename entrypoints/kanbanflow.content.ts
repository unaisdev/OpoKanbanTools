import '@/src/tools';
import { sendMessage, type OktEvent } from '@/src/core/messaging';
import type { PublicSettings } from '@/src/core/types';
import { startBubbleObserver, syncBubbles } from '@/src/inject/bubbleBar';
import injectStyles from '@/src/inject/styles.css?inline';

function injectCss(css: string): void {
  if (document.querySelector('style[data-okt="styles"]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-okt', 'styles');
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}

function isSettingsEvent(value: unknown): value is OktEvent {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as OktEvent).type === 'SETTINGS_UPDATED' &&
    typeof (value as OktEvent).settings === 'object'
  );
}

export default defineContentScript({
  matches: ['https://kanbanflow.com/*', 'https://*.kanbanflow.com/*'],
  runAt: 'document_idle',
  async main() {
    injectCss(injectStyles);

    let settings: PublicSettings = await sendMessage({ type: 'GET_SETTINGS' });
    console.info('[OpoKanbanTools] content script ready', {
      enabledTools: Object.entries(settings.tools)
        .filter(([, state]) => state.enabled)
        .map(([id]) => id),
    });

    const stop = startBubbleObserver(() => settings);

    const applySettings = (next: PublicSettings) => {
      settings = next;
      syncBubbles(settings);
    };

    browser.runtime.onMessage.addListener((message) => {
      if (!isSettingsEvent(message)) return;
      applySettings(message.settings);
    });

    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (!changes['okt.storage']) return;
      void sendMessage({ type: 'GET_SETTINGS' }).then(applySettings);
    });

    window.addEventListener('unload', () => stop(), { once: true });
  },
});
