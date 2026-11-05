import { useState } from 'react';
import styles from './TokenField.module.css';

type Props = {
  label: string;
  hint?: string;
  placeholder?: string;
  configured: boolean;
  disabled?: boolean;
  onSave: (value: string) => Promise<void> | void;
  onClear: () => Promise<void> | void;
};

export function TokenField({
  label,
  hint,
  placeholder,
  configured,
  disabled,
  onSave,
  onClear,
}: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await onSave(value.trim());
      setValue('');
      setMessage('Saved');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await onClear();
      setValue('');
      setMessage('Cleared');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to clear');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.top}>
        <div>
          <div className={styles.label}>{label}</div>
          {hint ? <p className={styles.hint}>{hint}</p> : null}
        </div>
        <span
          className={styles.badge}
          data-on={configured || undefined}
        >
          {configured ? 'Configured' : 'Not set'}
        </span>
      </div>
      <div className={styles.row}>
        <input
          className={styles.input}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          disabled={disabled || busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
        />
        <button
          type="button"
          className={styles.primary}
          disabled={disabled || busy || !value.trim()}
          onClick={() => void save()}
        >
          Save
        </button>
        <button
          type="button"
          className={styles.ghost}
          disabled={disabled || busy || !configured}
          onClick={() => void clear()}
        >
          Clear
        </button>
      </div>
      {message ? <p className={styles.message}>{message}</p> : null}
    </div>
  );
}
