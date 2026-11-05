# OpoKanbanTools

Chrome extension (Manifest V3) that adds custom **action bubbles** next to an open KanbanFlow task, backed by a plugin architecture and an options page for credentials and tool toggles.

Ships the plugin architecture, admin panel, **CI Build** (GitHub Actions from a KanbanFlow task), and **Sentry Actions** (resolve / assign / comment from the task rail).

## Stack

- [WXT](https://wxt.dev) + React 19 + TypeScript
- `chrome.storage.local` for settings and secrets
- Background service worker as the only place that will call external APIs (future tools)

## Install (beta from GitHub Releases)

Shipped as an unpacked Chrome MV3 zip (not Chrome Web Store).

1. Open the latest [Release](https://github.com/unaisdev/OpoKanbanTools/releases)
2. Download `opo-kanban-tools-<version>-chrome.zip`
3. Unzip to a stable folder (keep it; Chrome loads from that path)
4. `chrome://extensions` → **Developer mode** → **Load unpacked** → select the unzipped folder
5. Open **Options**, paste credentials, enable tools

GitHub also attaches **Source code (zip/tar.gz)** on every release if you need the repo snapshot.

### Publish a release

1. Bump `version` in `package.json` (must match the tag without `v`)
2. Commit, then tag and push:

```bash
git tag v0.0.2
git push origin v0.0.2
```

3. `.github/workflows/release.yml` builds the zip, typechecks, and creates a GitHub Release  
   (`0.x` tags are marked as **prerelease / beta** automatically)

Local zip without publishing:

```bash
pnpm zip   # → .output/opo-kanban-tools-<version>-chrome.zip
```

### Updates from Releases

| Approach | Status for this project |
| --- | --- |
| **In-app check** (Options banner) | ✅ Implemented — polls GitHub Releases API; if the repo is private, uses the stored GitHub token |
| **Silent CRX auto-update** (`update_url` + signed `.crx`) | ⚠️ Possible but limited — Chrome on Windows/macOS blocks installing/updating non–Web Store CRXs for normal users; works mainly with **enterprise policy** or some Linux setups |
| **Chrome Web Store** | Best real auto-update path later; not used for this private beta |

Practical beta flow: Options shows **Update available** → open the release → download zip → replace folder / reload extension on `chrome://extensions`.

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
6. Enable **CI Build** and/or **Sentry Actions**
7. Open a task with the `pr:app` label on [kanbanflow.com](https://kanbanflow.com) — the CI Build bubble should appear on the side rail

```bash
pnpm build    # production build
pnpm compile  # typecheck
pnpm zip      # production zip for manual install / Releases
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

## Sentry Actions tool

Per-action controls on the linked Sentry issue: **resolve in next release**, **assign** the token user, and **comment** with the KanbanFlow task URL (`https://kanbanflow.com/t/{id}`). Each action reports idle / running / success / already-done / error on its own.

1. Paste a Sentry auth token under **Global credentials** (`event:read` + `event:write`, or admin)
2. Enable **Sentry Actions** in Options
3. Open a KanbanFlow task whose title/description contains a Sentry issue URL — the bubble appears in the side rail
4. Run the actions you need from the modal (already-done states are detected on load)

## Adding another tool later

1. Create `src/tools/<id>/` with `index.ts` + modal component
2. Import the module from `src/tools/index.ts`
3. Add host permissions in `wxt.config.ts`
4. Add message types in `src/core/messaging.ts` and handlers in `background.ts` that use `getSecret()`
5. Parse links from `task.links` / extend `taskParser.ts` as needed

**GitHub Actions reminder:** listing workflows needs `actions:read`; *dispatching* workflows needs `actions:write` on a fine-grained PAT.

## License

Private — OpositaTest / internal use.
