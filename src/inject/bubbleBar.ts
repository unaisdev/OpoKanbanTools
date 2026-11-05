import type { PublicSettings, ToolDefinition } from '@/src/core/types';
import { getAllTools } from '@/src/core/registry';
import { scrapeTaskContext } from './taskParser';
import { openToolModal } from './modalHost';

const RAIL_ID = 'okt-bubble-rail';
const BUBBLE_ATTR = 'data-okt-tool';
const OKT_MARK = 'data-okt';

const PANEL_SELECTORS = [
  '#taskDialog',
  '.ui-dialog.ui-widget',
  '.ui-dialog',
  '[class*="taskDialog"]',
  '[class*="task-details"]',
  '[class*="TaskDetails"]',
  '.board-task-details',
  '[role="dialog"]',
];

const ACTION_LABELS = {
  add: ['add', 'añadir', 'agregar'],
  delete: ['delete', 'eliminar', 'borrar'],
} as const;

function isOktNode(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  return (
    node.id === RAIL_ID ||
    node.hasAttribute(OKT_MARK) ||
    node.hasAttribute(BUBBLE_ATTR) ||
    Boolean(node.closest?.(`#${RAIL_ID}, #okt-modal-host, [${OKT_MARK}]`))
  );
}

function norm(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function ownText(el: Element): string {
  let out = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? '';
  }
  return norm(out);
}

function matchesLabel(el: Element, labels: readonly string[]): boolean {
  const candidates = [
    ownText(el),
    norm(el.getAttribute('title')),
    norm(el.getAttribute('aria-label')),
    norm(el.getAttribute('data-original-title')),
  ];
  // Prefer short exact labels; avoid matching huge containers
  const full = norm(el.textContent);
  if (full.length <= 18) candidates.push(full);
  return candidates.some((c) => labels.includes(c));
}

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

/**
 * KanbanFlow side rail is identified by its visible action labels
 * (Add / Move / Timer / … / Delete), which is more reliable than CSS classes.
 */
function findNativeBubbleContainer(): HTMLElement | null {
  const nodes = Array.from(
    document.querySelectorAll('a, button, div, span, li, td, p'),
  ).filter((el) => !isOktNode(el) && isVisible(el));

  const deleteEls = nodes.filter((el) => matchesLabel(el, ACTION_LABELS.delete));
  const addEls = nodes.filter((el) => matchesLabel(el, ACTION_LABELS.add));

  for (const deleteEl of deleteEls) {
    for (const addEl of addEls) {
      if (deleteEl === addEl) continue;
      const parent = commonActionParent(addEl, deleteEl);
      if (parent) return parent;
    }
  }
  return null;
}

function commonActionParent(a: Element, b: Element): HTMLElement | null {
  let parent: HTMLElement | null = a.parentElement;
  while (parent && parent !== document.body) {
    if (
      parent.contains(b) &&
      parent.children.length >= 4 &&
      parent.children.length <= 24
    ) {
      const rect = parent.getBoundingClientRect();
      // Side rail is a narrow vertical strip
      if (rect.width > 0 && rect.width < 280 && rect.height > 120) {
        return parent;
      }
      // Wider wrapper that still looks like a compact action column
      if (rect.width > 0 && rect.width < 420 && rect.height > 160) {
        return parent;
      }
    }
    parent = parent.parentElement;
  }
  return a.parentElement instanceof HTMLElement ? a.parentElement : null;
}

function findTaskPanel(): HTMLElement | null {
  for (const selector of PANEL_SELECTORS) {
    let els: Element[];
    try {
      els = Array.from(document.querySelectorAll(selector));
    } catch {
      continue;
    }
    for (const el of els) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.closest('.ui-datepicker')) continue;
      const rect = el.getBoundingClientRect();
      if (
        rect.width >= 280 &&
        rect.height >= 200 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight
      ) {
        return el;
      }
    }
  }

  // Fallback: largest visible pale/yellow-ish dialog-like box near action labels
  const native = findNativeBubbleContainer();
  if (native) {
    const railRect = native.getBoundingClientRect();
    const blocks = Array.from(document.querySelectorAll('div, section, form')).filter(
      (el) => {
        if (!(el instanceof HTMLElement) || isOktNode(el)) return false;
        const r = el.getBoundingClientRect();
        return (
          r.width >= 320 &&
          r.height >= 240 &&
          r.right <= railRect.left + 40 &&
          Math.abs(r.top - railRect.top) < 200
        );
      },
    ) as HTMLElement[];
    blocks.sort(
      (a, b) =>
        b.getBoundingClientRect().width * b.getBoundingClientRect().height -
        a.getBoundingClientRect().width * a.getBoundingClientRect().height,
    );
    if (blocks[0]) return blocks[0];
  }

  return null;
}

function resolvePanelFrame(panel: HTMLElement): HTMLElement {
  return (panel.closest('.ui-dialog') as HTMLElement | null) ?? panel;
}

function findDeleteAnchor(container: HTMLElement): Element | null {
  const kids = Array.from(container.children);
  for (const child of kids) {
    if (isOktNode(child)) continue;
    if (matchesLabel(child, ACTION_LABELS.delete)) return child;
    // nested label
    if (
      Array.from(child.querySelectorAll('*')).some(
        (el) => !isOktNode(el) && matchesLabel(el, ACTION_LABELS.delete),
      )
    ) {
      return child;
    }
  }
  for (let i = kids.length - 1; i >= 0; i--) {
    const child = kids[i];
    if (child && !isOktNode(child)) return child;
  }
  return null;
}

const NATIVE_ACTION_WORDS = new Set([
  ...ACTION_LABELS.add,
  ...ACTION_LABELS.delete,
  'move',
  'mover',
  'timer',
  'temporizador',
  'reports',
  'informes',
  'reportes',
  'more',
  'más',
  'mas',
]);

function iconHtml(tool: ToolDefinition): string {
  if (typeof tool.icon === 'string') return tool.icon;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/></svg>`;
}

function findNativeTemplate(container: HTMLElement): HTMLElement | null {
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement) || isOktNode(child)) continue;
    if (matchesLabel(child, ACTION_LABELS.delete)) continue;
    if (!isVisible(child)) continue;
    return child;
  }
  return null;
}

function replaceNativeLabelText(root: HTMLElement, name: string): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);

  let replaced = false;
  for (const textNode of nodes) {
    const value = norm(textNode.textContent);
    if (!NATIVE_ACTION_WORDS.has(value)) continue;
    textNode.textContent = name;
    replaced = true;
  }

  if (replaced) return;

  // Fallback: deepest short text leaf (typical label chip)
  let best: Text | null = null;
  for (const textNode of nodes) {
    const value = norm(textNode.textContent);
    if (value.length < 2 || value.length > 18) continue;
    best = textNode;
  }
  if (best) best.textContent = name;
}

function replaceNativeIcon(root: HTMLElement, tool: ToolDefinition): void {
  const svg = root.querySelector('svg');
  if (svg) {
    const host = document.createElement('span');
    host.innerHTML = iconHtml(tool);
    const next = host.firstElementChild;
    if (next) {
      next.classList.add('okt-bubble__icon');
      svg.replaceWith(next);
    }
    return;
  }

  const img = root.querySelector('img');
  if (img) {
    const host = document.createElement('span');
    host.innerHTML = iconHtml(tool);
    const next = host.firstElementChild;
    if (next) {
      next.classList.add('okt-bubble__icon');
      img.replaceWith(next);
    }
  }
}

function createBubbleButton(
  tool: ToolDefinition,
  nativeContainer?: HTMLElement | null,
): HTMLElement {
  const template = nativeContainer ? findNativeTemplate(nativeContainer) : null;

  if (template) {
    const wrap = template.cloneNode(true) as HTMLElement;
    wrap.setAttribute(BUBBLE_ATTR, tool.id);
    wrap.setAttribute(OKT_MARK, 'bubble');
    wrap.title = tool.name;
    wrap.removeAttribute('id');
    wrap.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    // Avoid inheriting native click handlers tied via id/href quirks
    if (wrap instanceof HTMLAnchorElement) wrap.removeAttribute('href');

    replaceNativeIcon(wrap, tool);
    replaceNativeLabelText(wrap, tool.name);
    return wrap;
  }

  const wrap = document.createElement('div');
  wrap.className = 'okt-bubble';
  wrap.setAttribute(BUBBLE_ATTR, tool.id);
  wrap.setAttribute(OKT_MARK, 'bubble');
  wrap.title = tool.name;

  const btn = document.createElement('div');
  btn.className = 'okt-bubble__btn';
  btn.setAttribute('role', 'button');
  btn.tabIndex = 0;
  btn.innerHTML = iconHtml(tool);

  const label = document.createElement('span');
  label.className = 'okt-bubble__label';
  label.textContent = tool.name;

  wrap.append(btn, label);
  return wrap;
}

function visibleTools(settings: PublicSettings): ToolDefinition[] {
  return getAllTools().filter((tool) => {
    const state = settings.tools[tool.id];
    return state?.enabled ?? tool.defaultEnabled;
  });
}

function ensureFixedRail(): HTMLElement {
  let rail = document.getElementById(RAIL_ID) as HTMLElement | null;
  if (rail) return rail;
  rail = document.createElement('div');
  rail.id = RAIL_ID;
  rail.className = 'okt-bubble-rail';
  rail.setAttribute(OKT_MARK, 'rail');
  document.body.appendChild(rail);
  return rail;
}

function positionRail(rail: HTMLElement, anchor: HTMLElement): void {
  const frame = resolvePanelFrame(anchor).getBoundingClientRect();
  const top = Math.max(16, frame.top + 48);
  const left = Math.min(window.innerWidth - 170, frame.right + 10);
  rail.style.top = `${Math.round(top)}px`;
  rail.style.left = `${Math.round(left)}px`;
  rail.style.display = 'flex';
}

function positionRailBesideNative(rail: HTMLElement, native: HTMLElement): void {
  const frame = native.getBoundingClientRect();
  rail.style.top = `${Math.round(frame.top)}px`;
  rail.style.left = `${Math.round(frame.left)}px`;
  rail.style.display = 'flex';
}

function clearBubbles(root: ParentNode = document): void {
  root.querySelectorAll(`[${BUBBLE_ATTR}]`).forEach((el) => el.remove());
}

function toolsVisibleForTask(
  tools: ToolDefinition[],
  settings: PublicSettings,
  scrapeRoot: HTMLElement | Document,
): ToolDefinition[] {
  const task = scrapeTaskContext(scrapeRoot);
  return tools.filter((tool) => {
    if (!tool.canShow) return true;
    const config = settings.tools[tool.id]?.config ?? {};
    return tool.canShow(task, config);
  });
}

function mountBubbles(
  mountParent: HTMLElement,
  tools: ToolDefinition[],
  settings: PublicSettings,
  scrapeRoot: HTMLElement | Document,
  deleteAnchor: Element | null,
): void {
  for (const tool of tools) {
    // Avoid duplicates if sync races
    if (mountParent.querySelector(`[${BUBBLE_ATTR}="${tool.id}"]`)) continue;

    const bubble = createBubbleButton(
      tool,
      mountParent.id === RAIL_ID ? null : mountParent,
    );
    const open = () => {
      const latestTask = scrapeTaskContext(scrapeRoot);
      const config = settings.tools[tool.id]?.config ?? {};
      openToolModal({
        tool,
        task: latestTask,
        config,
        secretStatus: settings.secretStatus,
      });
    };
    bubble.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      open();
    });
    bubble.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });

    if (deleteAnchor && deleteAnchor.parentElement === mountParent) {
      mountParent.insertBefore(bubble, deleteAnchor);
    } else {
      mountParent.appendChild(bubble);
    }
  }
}

let lastSyncDebug = '';

export function syncBubbles(settings: PublicSettings): void {
  const tools = visibleTools(settings);
  const rail = document.getElementById(RAIL_ID);

  if (tools.length === 0) {
    clearBubbles();
    rail?.remove();
    return;
  }

  const native = findNativeBubbleContainer();
  const panel = findTaskPanel();

  const debug = JSON.stringify({
    tools: tools.map((t) => t.id),
    native: Boolean(native),
    panel: Boolean(panel),
    existing: document.querySelectorAll(`[${BUBBLE_ATTR}]`).length,
  });
  if (debug !== lastSyncDebug) {
    lastSyncDebug = debug;
    console.info('[OpoKanbanTools] syncBubbles', JSON.parse(debug));
  }

  const scrapeRoot = panel ?? document;
  const shown = toolsVisibleForTask(tools, settings, scrapeRoot);

  if (native) {
    rail?.remove();
    const already = Array.from(native.querySelectorAll(`[${BUBBLE_ATTR}]`));
    const ids = shown
      .map((t) => t.id)
      .sort()
      .join(',');
    const existingIds = already
      .map((el) => el.getAttribute(BUBBLE_ATTR) ?? '')
      .sort()
      .join(',');
    // Rebuild when enabled/canShow set changes or bubbles are orphaned
    if (ids === existingIds && already.length === shown.length) {
      const deleteAnchor = findDeleteAnchor(native);
      for (const bubble of already) {
        if (deleteAnchor && bubble.nextSibling !== deleteAnchor) {
          native.insertBefore(bubble, deleteAnchor);
        }
      }
      return;
    }
    clearBubbles();
    const deleteAnchor = findDeleteAnchor(native);
    mountBubbles(native, shown, settings, scrapeRoot, deleteAnchor);
    return;
  }

  if (!panel) {
    clearBubbles();
    rail?.remove();
    return;
  }

  clearBubbles();
  const fixedRail = ensureFixedRail();
  positionRail(fixedRail, panel);
  mountBubbles(fixedRail, shown, settings, panel, null);
}

export function startBubbleObserver(getSettings: () => PublicSettings): () => void {
  let scheduled = false;
  let syncing = false;

  const run = () => {
    scheduled = false;
    syncing = true;
    try {
      syncBubbles(getSettings());
    } finally {
      requestAnimationFrame(() => {
        syncing = false;
      });
    }
  };

  const schedule = () => {
    if (scheduled || syncing) return;
    scheduled = true;
    requestAnimationFrame(run);
  };

  const observer = new MutationObserver((mutations) => {
    if (syncing) return;
    const relevant = mutations.some((m) => {
      if (isOktNode(m.target)) return false;
      if (m.type === 'attributes') return true;
      for (const n of m.addedNodes) if (!isOktNode(n)) return true;
      for (const n of m.removedNodes) if (!isOktNode(n)) return true;
      return false;
    });
    if (relevant) schedule();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden'],
  });

  const onViewport = () => {
    const panel = findTaskPanel();
    const native = findNativeBubbleContainer();
    const rail = document.getElementById(RAIL_ID);
    if (rail && panel) positionRail(rail, panel);
    else if (rail && native) positionRailBesideNative(rail, native);
    else schedule();
  };

  window.addEventListener('scroll', onViewport, true);
  window.addEventListener('resize', onViewport);

  // Dialog may toggle visibility without childList mutations we care about
  const poll = window.setInterval(schedule, 800);

  schedule();

  return () => {
    observer.disconnect();
    window.clearInterval(poll);
    window.removeEventListener('scroll', onViewport, true);
    window.removeEventListener('resize', onViewport);
  };
}
