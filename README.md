# OpoKanbanTools

Chrome extension (Manifest V3) that adds custom **action bubbles** next to an open KanbanFlow task, backed by a plugin architecture and an options page for credentials and tool toggles.

Ships the plugin architecture, admin panel, an **Example Tool** stub, and the **CI Build** tool (ported from KF CI Build) that dispatches GitHub Actions workflows from a KanbanFlow task.

## Stack

- [WXT](https://wxt.dev) + React 19 + TypeScript
- `chrome.storage.local` for settings and secrets
- Background service worker as the only place that will call external APIs (future tools)

## Develop

```bash
pnpm install
pnpm dev
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `.output/chrome-mv3` (WXT prints the path on start)
4. Open the extension **Options** (or click the toolbar icon)
5. Paste a GitHub token under **Global credentials** (`actions:read` + `actions:write`)
6. Enable **CI Build** (and optionally **Example Tool**)
7. Open a task with the `pr:app` label on [kanbanflow.com](https://kanbanflow.com) — the CI Build bubble should appear on the side rail

```bash
pnpm build    # production build
pnpm compile  # typecheck
```

## Architecture

```
entrypoints/
  background.ts           # messaging + storage + open options
  kanbanflow.content.ts   # inject bubbles/modals on KanbanFlow
  options/                # admin UI
src/
  core/                   # types, registry, storage, messaging
  inject/                 # DOM observer, bubble bar, modal host, task parser
  tools/                  # one folder per tool (register on import)
  ui/                     # shared options components + design tokens
```

### Plugin contract

Register a tool from `src/tools/<id>/index.ts` and import it in `src/tools/index.ts`:

```ts
import { registerTool } from '@/src/core/registry';

registerTool({
  id: 'ci-build',
  name: 'CI Build',
  description: '…',
  icon: `<svg>…</svg>`,
  defaultEnabled: false,
  settingsFields: [/* admin fields */],
  usesGlobalSecrets: ['github'],
  canShow: (task) => Boolean(task.links.githubPr),
  renderModal: (props) => /* React node */,
});
```

`TaskContext` is scraped from the open task (title, description, labels, parsed GitHub/Sentry links). Refine selectors in `src/inject/taskParser.ts` and `src/inject/bubbleBar.ts` against live KanbanFlow DOM when building real tools.

### Security notes

- Secret **values** never leave the service worker / options page.
- Content scripts receive `PublicSettings` (toggles, config, `secretStatus` booleans only).
- Future API calls (GitHub, Sentry) must be proxied through `background.ts`.

## CI Build tool

Port of the standalone **KanbanFlow → GitHub CI Build** extension into `src/tools/ci-build/`:

- Bubble only when the task has the configured label (default `pr:app`)
- Resolves the branch from a GitHub PR link or `branch`/`rama` hint in the task, then falls back to KanbanFlow task id in the PR body / title search
- Reads `workflow_dispatch` inputs from the workflow YAML (fallback defaults)
- Dispatches App Testing Environments, tracks runs per task, cancel + build number copy

Config lives in the tool’s Options fields (`owner` / `repo` / `workflow` / offset). The GitHub token is the shared **Global credentials** secret.

## Adding Sentry (or another tool) later

1. Create `src/tools/<id>/` with `index.ts` + modal component
2. Import the module from `src/tools/index.ts`
3. Add host permissions in `wxt.config.ts`
4. Add message types in `src/core/messaging.ts` and handlers in `background.ts` that use `getSecret()`
5. Parse links from `task.links` / extend `taskParser.ts` as needed

**GitHub Actions reminder:** listing workflows needs `actions:read`; *dispatching* workflows needs `actions:write` on a fine-grained PAT.

## License

Private — OpositaTest / internal use.
