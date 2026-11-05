import { useEffect, useState } from 'react';
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

function PencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

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
  const [editing, setEditing] = useState(!configured);

  useEffect(() => {
    if (!configured) setEditing(true);
  }, [configured]);

  const save = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await onSave(value.trim());
      setValue('');
      setEditing(false);
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
      setEditing(true);
      setMessage('Cleared');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to clear');
    } finally {
      setBusy(false);
    }
  };

  const showInput = !configured || editing;

  return (
    <div className={styles.root}>
      <div className={styles.top}>
        <div>
          <div className={styles.label}>{label}</div>
          {hint ? <p className={styles.hint}>{hint}</p> : null}
        </div>
        <span className={styles.badge} data-on={configured || undefined}>
          {configured ? 'Configured' : 'Not set'}
        </span>
      </div>

      {showInput ? (
        <div className={styles.row}>
          <input
            className={styles.input}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            value={value}
            disabled={disabled || busy}
            autoFocus={configured && editing}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape' && configured) {
                setValue('');
                setEditing(false);
                setMessage(null);
              }
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
          {configured ? (
            <button
              type="button"
              className={styles.ghost}
              disabled={disabled || busy}
              onClick={() => {
                setValue('');
                setEditing(false);
                setMessage(null);
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconBtn}
            disabled={disabled || busy}
            aria-label={`Edit ${label}`}
            title="Edit"
            onClick={() => {
              setEditing(true);
              setMessage(null);
            }}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            data-danger
            disabled={disabled || busy}
            aria-label={`Clear ${label}`}
            title="Clear"
            onClick={() => void clear()}
          >
            <TrashIcon />
          </button>
        </div>
      )}

      {message ? <p className={styles.message}>{message}</p> : null}
    </div>
  );
}
