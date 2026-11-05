# OpoKanbanTools

Chrome extension (Manifest V3) that adds custom **action bubbles** next to an open KanbanFlow task, backed by a plugin architecture and an options page for credentials and tool toggles.

This scaffold ships **architecture + admin panel** only. No GitHub Actions / Sentry integrations yet — an **Example Tool** stub validates the bubble → modal → settings loop.

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
5. Enable **Example Tool**
6. Open a task on [kanbanflow.com](https://kanbanflow.com) — a bubble should appear on the side rail

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

## Adding CI Build / Sentry later

Checklist for a real tool:

1. Create `src/tools/ci-build/` (or `sentry/`) with `index.ts` + modal component
2. Import the module from `src/tools/index.ts`
3. Add host permissions in `wxt.config.ts` (`api.github.com`, Sentry, …)
4. Add message types in `src/core/messaging.ts` and handlers in `background.ts` that use `getSecret()`
5. Parse PR/branch/issue from `task.links` (already stubbed in `taskParser.ts`)
6. Document required token scopes in `GLOBAL_SECRET_META` / tool description

**GitHub Actions reminder:** listing workflows needs `actions:read`; *dispatching* workflows needs `actions:write` on a fine-grained PAT.

## License

Private — OpositaTest / internal use.
