import type { ParsedLinks, TaskContext } from '@/src/core/types';

const GITHUB_PR_RE =
  /https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/gi;
const SENTRY_ISSUE_RE =
  /https?:\/\/(?:[\w-]+\.)?sentry\.io\/(?:organizations\/)?([^/\s]+)\/(?:issues|projects)\/([^/\s?#]+)?/gi;
const BRANCH_HINT_RE =
  /(?:branch|rama)\s*[:=]\s*[`"]?([A-Za-z0-9._/-]+)/gi;

export function parseLinks(text: string): ParsedLinks {
  const links: ParsedLinks = { branchHints: [] };

  const prMatch = GITHUB_PR_RE.exec(text);
  if (prMatch?.[1] && prMatch[2] && prMatch[3]) {
    links.githubPr = {
      url: prMatch[0],
      owner: prMatch[1],
      repo: prMatch[2],
      number: Number(prMatch[3]),
    };
  }
  GITHUB_PR_RE.lastIndex = 0;

  const sentryMatch = SENTRY_ISSUE_RE.exec(text);
  if (sentryMatch?.[1]) {
    links.sentryIssue = {
      url: sentryMatch[0],
      org: sentryMatch[1],
      project: sentryMatch[2],
      issueId: sentryMatch[2],
    };
  }
  SENTRY_ISSUE_RE.lastIndex = 0;

  let branchMatch: RegExpExecArray | null;
  while ((branchMatch = BRANCH_HINT_RE.exec(text)) !== null) {
    if (branchMatch[1]) links.branchHints.push(branchMatch[1]);
  }

  return links;
}

function textOf(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

/**
 * Best-effort scrape of the open KanbanFlow task panel.
 * Selectors are intentionally loose; refine when wiring real tools.
 */
export function scrapeTaskContext(root: Document | Element = document): TaskContext {
  const titleEl =
    root.querySelector(
      '.taskDialog-header-title, #taskDialog [name="name"], textarea[name="name"], input[name="name"], [class*="task-details"] [class*="title"], .board-task-details-name',
    ) ?? root.querySelector('h1, h2');

  const descriptionEl =
    root.querySelector(
      '.taskDialog-description, #taskDialog [contenteditable="true"], [class*="description"], .board-task-details-description, [contenteditable="true"]',
    ) ?? null;

  const labelEls = root.querySelectorAll(
    '.taskDialog-labels span, [class*="label"], .board-task-details-labels span, .label',
  );

  const descriptionText = textOf(descriptionEl);
  const descriptionHtml = descriptionEl?.innerHTML ?? '';
  const title = textOf(titleEl);

  const taskId =
    (root instanceof Element
      ? root.getAttribute('data-task-id')
      : null) ??
    document
      .querySelector('[data-task-id]')
      ?.getAttribute('data-task-id') ??
    null;

  const labels = Array.from(labelEls)
    .map((el) => textOf(el))
    .filter(Boolean)
    .slice(0, 20);

  return {
    taskId,
    title,
    descriptionText,
    descriptionHtml,
    labels,
    links: parseLinks(`${title}\n${descriptionText}`),
  };
}
