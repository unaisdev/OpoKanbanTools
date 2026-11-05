/** GitHub repo used for Releases / update checks. */
export const RELEASE_REPO = {
  owner: 'unaisdev',
  repo: 'OpoKanbanTools',
} as const;

export const RELEASES_URL = `https://github.com/${RELEASE_REPO.owner}/${RELEASE_REPO.repo}/releases`;
export const RELEASES_API_URL = `https://api.github.com/repos/${RELEASE_REPO.owner}/${RELEASE_REPO.repo}/releases`;

export type UpdateCheckResult = {
  currentVersion: string;
  latestVersion: string | null;
  isNewer: boolean;
  isPrerelease: boolean;
  htmlUrl: string | null;
  zipAssetName: string | null;
  zipAssetUrl: string | null;
  checkedAt: string;
  error?: string;
};

/** Compare dotted numeric versions (e.g. 0.0.1 vs 0.1.0). Ignores leading `v`. */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .filter(Boolean)
      .map((part) => {
        const n = Number.parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });

  const aa = parse(a);
  const bb = parse(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const diff = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function getInstalledVersion(): string {
  return browser.runtime.getManifest().version;
}

type GhReleaseAsset = {
  name: string;
  browser_download_url: string;
  content_type?: string;
};

type GhRelease = {
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
  assets: GhReleaseAsset[];
};

function pickChromeZip(assets: GhReleaseAsset[]): GhReleaseAsset | null {
  const chromeZip = assets.find(
    (a) =>
      /^opo-kanban-tools-.*-chrome\.zip$/i.test(a.name) ||
      (/chrome/i.test(a.name) && a.name.endsWith('.zip')),
  );
  if (chromeZip) return chromeZip;
  return assets.find((a) => a.name.endsWith('.zip')) ?? null;
}

/**
 * Fetches the newest non-draft GitHub Release (including prereleases / beta).
 * Uses the stored GitHub token when present (needed if the repo is private).
 */
export async function checkForUpdate(
  githubToken?: string | null,
): Promise<UpdateCheckResult> {
  const currentVersion = getInstalledVersion();
  const checkedAt = new Date().toISOString();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  try {
    const res = await fetch(`${RELEASES_API_URL}?per_page=10`, { headers });
    if (!res.ok) {
      const hint =
        res.status === 404
          ? 'Repo not found or private (add a GitHub token in Options).'
          : res.status === 401 || res.status === 403
            ? 'GitHub API unauthorized — check the token scopes (repo / contents:read).'
            : `GitHub API ${res.status}`;
      return {
        currentVersion,
        latestVersion: null,
        isNewer: false,
        isPrerelease: false,
        htmlUrl: RELEASES_URL,
        zipAssetName: null,
        zipAssetUrl: null,
        checkedAt,
        error: hint,
      };
    }

    const releases = (await res.json()) as GhRelease[];
    const latest = releases.find((r) => !r.draft);
    if (!latest) {
      return {
        currentVersion,
        latestVersion: null,
        isNewer: false,
        isPrerelease: false,
        htmlUrl: RELEASES_URL,
        zipAssetName: null,
        zipAssetUrl: null,
        checkedAt,
        error: 'No published releases yet.',
      };
    }

    const latestVersion = latest.tag_name.replace(/^v/i, '');
    const zip = pickChromeZip(latest.assets ?? []);

    return {
      currentVersion,
      latestVersion,
      isNewer: compareSemver(latestVersion, currentVersion) > 0,
      isPrerelease: latest.prerelease,
      htmlUrl: latest.html_url,
      zipAssetName: zip?.name ?? null,
      zipAssetUrl: zip?.browser_download_url ?? null,
      checkedAt,
    };
  } catch (err) {
    return {
      currentVersion,
      latestVersion: null,
      isNewer: false,
      isPrerelease: false,
      htmlUrl: RELEASES_URL,
      zipAssetName: null,
      zipAssetUrl: null,
      checkedAt,
      error: err instanceof Error ? err.message : 'Update check failed',
    };
  }
}
