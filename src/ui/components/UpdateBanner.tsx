import { useCallback, useEffect, useState } from 'react';
import { checkForUpdates } from '@/src/core/messaging';
import type { UpdateCheckResult } from '@/src/core/release';
import styles from './UpdateBanner.module.css';

export function UpdateBanner() {
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const next = await checkForUpdates();
      setResult(next);
    } catch (err) {
      setResult({
        currentVersion: browser.runtime.getManifest().version,
        latestVersion: null,
        isNewer: false,
        isPrerelease: false,
        htmlUrl: null,
        zipAssetName: null,
        zipAssetUrl: null,
        checkedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Update check failed',
      });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!result) {
    return (
      <div className={styles.bar} data-state="idle">
        <span className={styles.meta}>v{browser.runtime.getManifest().version} · checking updates…</span>
      </div>
    );
  }

  if (result.isNewer && result.latestVersion) {
    return (
      <div className={styles.bar} data-state="update">
        <div className={styles.copy}>
          <strong>Update available</strong>
          <span>
            v{result.currentVersion} → v{result.latestVersion}
            {result.isPrerelease ? ' (beta)' : ''}
          </span>
        </div>
        <div className={styles.actions}>
          {result.htmlUrl ? (
            <a
              className={styles.primary}
              href={result.htmlUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open release
            </a>
          ) : null}
          <button type="button" className={styles.ghost} onClick={() => void refresh()} disabled={checking}>
            {checking ? 'Checking…' : 'Recheck'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.bar} data-state={result.error ? 'error' : 'ok'}>
      <span className={styles.meta}>
        v{result.currentVersion}
        {result.error
          ? ` · ${result.error}`
          : result.latestVersion
            ? ' · up to date'
            : ' · no releases yet'}
      </span>
      <button type="button" className={styles.ghost} onClick={() => void refresh()} disabled={checking}>
        {checking ? 'Checking…' : 'Check updates'}
      </button>
    </div>
  );
}
