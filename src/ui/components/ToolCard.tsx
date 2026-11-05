import { useId, useState } from 'react';
import type { SettingsField, ToolDefinition, ToolRuntimeState } from '@/src/core/types';
import { Toggle } from './Toggle';
import styles from './ToolCard.module.css';

type Props = {
  tool: ToolDefinition;
  state: ToolRuntimeState;
  onToggle: (enabled: boolean) => void;
  onConfigChange: (config: Record<string, unknown>) => void;
  busy?: boolean;
};

function FieldControl({
  field,
  value,
  disabled,
  onChange,
}: {
  field: SettingsField;
  value: unknown;
  disabled?: boolean;
  onChange: (next: string | boolean) => void;
}) {
  if (field.type === 'boolean') {
    return (
      <Toggle
        label={field.label}
        checked={Boolean(value ?? field.defaultValue ?? false)}
        disabled={disabled}
        onChange={(next) => onChange(next)}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{field.label}</span>
        {field.description ? (
          <span className={styles.fieldHint}>{field.description}</span>
        ) : null}
        <select
          className={styles.control}
          disabled={disabled}
          value={String(value ?? field.defaultValue ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{field.label}</span>
      {field.description ? (
        <span className={styles.fieldHint}>{field.description}</span>
      ) : null}
      <input
        className={styles.control}
        type={field.type === 'password' ? 'password' : 'text'}
        placeholder={field.placeholder}
        disabled={disabled}
        value={String(value ?? field.defaultValue ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function configSummary(
  fields: SettingsField[],
  config: Record<string, unknown>,
): string {
  if (fields.length === 0) return 'No options';

  const bits = fields.slice(0, 3).map((field) => {
    const raw = config[field.key] ?? field.defaultValue;
    if (field.type === 'boolean') {
      return `${field.label}: ${raw ? 'on' : 'off'}`;
    }
    if (field.type === 'select') {
      const opt = field.options?.find((o) => o.value === String(raw ?? ''));
      return `${field.label}: ${opt?.label ?? String(raw ?? '—')}`;
    }
    const text = String(raw ?? '').trim();
    return `${field.label}: ${text || '—'}`;
  });

  const extra = fields.length > 3 ? ` · +${fields.length - 3} more` : '';
  return bits.join(' · ') + extra;
}

export function ToolCard({
  tool,
  state,
  onToggle,
  onConfigChange,
  busy,
}: Props) {
  const [configOpen, setConfigOpen] = useState(false);
  const panelId = useId();
  const hasFields = tool.settingsFields.length > 0;

  return (
    <article className={styles.root} data-enabled={state.enabled || undefined}>
      <div className={styles.head}>
        <div className={styles.identity}>
          <div
            className={styles.icon}
            dangerouslySetInnerHTML={{
              __html:
                typeof tool.icon === 'string'
                  ? tool.icon
                  : '<span>•</span>',
            }}
          />
          <div>
            <h3 className={styles.name}>{tool.name}</h3>
            <p className={styles.description}>{tool.description}</p>
            {tool.usesGlobalSecrets?.length ? (
              <p className={styles.secrets}>
                Uses: {tool.usesGlobalSecrets.join(', ')}
              </p>
            ) : null}
          </div>
        </div>
        <Toggle
          label={state.enabled ? 'Visible' : 'Hidden'}
          checked={state.enabled}
          disabled={busy}
          onChange={onToggle}
        />
      </div>

      {hasFields ? (
        <div className={styles.config}>
          <button
            type="button"
            className={styles.configToggle}
            aria-expanded={configOpen}
            aria-controls={panelId}
            onClick={() => setConfigOpen((v) => !v)}
          >
            <span className={styles.configToggleLeft}>
              <span className={styles.chevron} aria-hidden>
                {configOpen ? '▾' : '▸'}
              </span>
              <span className={styles.configLabel}>Configuration</span>
            </span>
            {!configOpen ? (
              <span className={styles.configSummary}>
                {configSummary(tool.settingsFields, state.config)}
              </span>
            ) : (
              <span className={styles.configHint}>Hide options</span>
            )}
          </button>

          {configOpen ? (
            <div className={styles.fields} id={panelId}>
              {tool.settingsFields.map((field) => (
                <FieldControl
                  key={field.key}
                  field={field}
                  value={state.config[field.key]}
                  disabled={busy || !state.enabled}
                  onChange={(next) =>
                    onConfigChange({ ...state.config, [field.key]: next })
                  }
                />
              ))}
              {!state.enabled ? (
                <p className={styles.configDisabledNote}>
                  Enable the tool to edit these options.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
