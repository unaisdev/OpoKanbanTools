import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'OpoKanbanTools',
    description:
      'Connect KanbanFlow tasks with GitHub, Sentry and other tools via action bubbles. (Beta)',
    permissions: ['storage', 'declarativeNetRequestWithHostAccess'],
    host_permissions: [
      'https://kanbanflow.com/*',
      'https://*.kanbanflow.com/*',
      'https://api.github.com/*',
      'https://github.com/*',
      'https://sentry.io/*',
      'https://*.sentry.io/*',
    ],
    // No default_popup → toolbar click opens options via background onClicked.
    action: {
      default_title: 'OpoKanbanTools settings',
    },
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      if (manifest.options_ui) {
        manifest.options_ui.open_in_tab = true;
      }
    },
  },
});
