import { useCallback, useEffect, useMemo, useState } from 'react';
import '@/src/tools';
import { sendMessage } from '@/src/core/messaging';
import { getAllTools } from '@/src/core/registry';
import {
  GLOBAL_SECRET_META,
  type GlobalSecretKey,
  type PublicSettings,
} from '@/src/core/types';
import { Section } from '@/src/ui/components/Section';
import { StatusChip } from '@/src/ui/components/StatusChip';
import { TokenField } from '@/src/ui/components/TokenField';
import { ToolCard } from '@/src/ui/components/ToolCard';

const SECRET_KEYS = Object.keys(GLOBAL_SECRET_META) as GlobalSecretKey[];

export default function App() {
  const tools = useMemo(() => getAllTools(), []);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const next = await sendMessage({ type: 'GET_SETTINGS' });
    setSettings(next);
  }, []);

  useEffect(() => {
    void refresh().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    });
  }, [refresh]);

  if (error) {
    return (
      <div className="okt-page">
        <p className="okt-error">{error}</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="okt-page">
        <p className="okt-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="okt-page">
      <header className="okt-hero">
        <p className="okt-kicker">KanbanFlow extension</p>
        <h1 className="okt-brand">OpoKanbanTools</h1>
        <p className="okt-lede">
          Enable tools that appear as action bubbles beside an open task. Store
          shared credentials once; each tool can reuse them without exposing
          secrets to the page.
        </p>
      </header>

      <div className="okt-stack">
        <Section
          title="Global credentials"
          description="Tokens stay in chrome.storage.local on this browser. Expand to edit — content scripts only see whether a secret is configured."
          collapsible
          defaultOpen={false}
          summary={
            <>
              {SECRET_KEYS.map((key) => (
                <StatusChip
                  key={key}
                  label={GLOBAL_SECRET_META[key].label.replace(/ token$/i, '')}
                  on={settings.secretStatus[key]}
                />
              ))}
            </>
          }
        >
          {SECRET_KEYS.map((key) => {
            const meta = GLOBAL_SECRET_META[key];
            return (
              <TokenField
                key={key}
                label={meta.label}
                hint={meta.hint}
                placeholder={meta.placeholder}
                configured={settings.secretStatus[key]}
                disabled={busy}
                onSave={async (value) => {
                  setBusy(true);
                  try {
                    const next = await sendMessage({
                      type: 'SET_SECRETS',
                      secrets: { [key]: value },
                    });
                    setSettings(next);
                  } finally {
                    setBusy(false);
                  }
                }}
                onClear={async () => {
                  setBusy(true);
                  try {
                    const next = await sendMessage({
                      type: 'CLEAR_SECRET',
                      key,
                    });
                    setSettings(next);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            );
          })}
        </Section>

        <Section
          title="Tools"
          description="Toggle visibility on the KanbanFlow task bubble rail. Expand a tool to edit its options."
        >
          <div className="okt-tools">
            {tools.map((tool) => {
              const state = settings.tools[tool.id] ?? {
                enabled: tool.defaultEnabled,
                config: {},
              };
              return (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  state={state}
                  busy={busy}
                  onToggle={(enabled) => {
                    setBusy(true);
                    void sendMessage({
                      type: 'SET_TOOL_ENABLED',
                      toolId: tool.id,
                      enabled,
                    })
                      .then(setSettings)
                      .finally(() => setBusy(false));
                  }}
                  onConfigChange={(config) => {
                    setBusy(true);
                    void sendMessage({
                      type: 'SET_TOOL_CONFIG',
                      toolId: tool.id,
                      config,
                    })
                      .then(setSettings)
                      .finally(() => setBusy(false));
                  }}
                />
              );
            })}
          </div>
        </Section>
      </div>

      <footer className="okt-footer">
        Settings sync to open KanbanFlow tabs automatically. Reload the board if
        a bubble does not appear after enabling a tool.
      </footer>
    </div>
  );
}
