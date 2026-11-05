import { useEffect, useId, useState } from 'react';
import type { SecretHowTo } from '@/src/core/types';
import styles from './TokenField.module.css';

type Props = {
  label: string;
  hint?: string;
  howTo?: SecretHowTo;
  createUrl?: string;
  createLabel?: string;
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

function InfoIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function HowToModal({
  howTo,
  createUrl,
  createLabel,
  onClose,
}: {
  howTo: SecretHowTo;
  createUrl?: string;
  createLabel?: string;
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={styles.modalBackdrop}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHead}>
          <h2 id={titleId} className={styles.modalTitle}>
            {howTo.title}
          </h2>
          <button
            type="button"
            className={styles.modalClose}
            aria-label="Cerrar"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <ol className={styles.steps}>
          {howTo.steps.map((step, i) => (
            <li key={step} className={styles.step}>
              <span className={styles.stepNum} aria-hidden>
                {i + 1}
              </span>
              <span className={styles.stepText}>{step}</span>
            </li>
          ))}
        </ol>

        {howTo.scopes.length ? (
          <div className={styles.scopesBlock}>
            <div className={styles.scopesLabel}>Permisos necesarios</div>
            <div className={styles.scopes}>
              {howTo.scopes.map((scope) => (
                <code key={scope} className={styles.scopeChip}>
                  {scope}
                </code>
              ))}
            </div>
          </div>
        ) : null}

        {howTo.note ? (
          <div className={styles.note}>
            <strong>Nota</strong>
            <p>{howTo.note}</p>
          </div>
        ) : null}

        <div className={styles.modalFooter}>
          {createUrl ? (
            <a
              className={styles.modalPrimaryLink}
              href={createUrl}
              target="_blank"
              rel="noreferrer"
            >
              {createLabel || 'Abrir página para crear el token'}
            </a>
          ) : null}
          <button type="button" className={styles.ghost} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export function TokenField({
  label,
  hint,
  howTo,
  createUrl,
  createLabel,
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
  const [infoOpen, setInfoOpen] = useState(false);

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
          <div className={styles.labelRow}>
            <div className={styles.label}>{label}</div>
            {howTo ? (
              <button
                type="button"
                className={styles.infoBtn}
                aria-label={`Cómo obtener ${label}`}
                title="Cómo obtenerlo"
                onClick={() => setInfoOpen(true)}
              >
                <InfoIcon />
              </button>
            ) : null}
          </div>
          {hint ? <p className={styles.hint}>{hint}</p> : null}
          {createUrl ? (
            <p className={styles.createLink}>
              <a href={createUrl} target="_blank" rel="noreferrer">
                {createLabel || 'Abrir página para crear el token'}
              </a>
            </p>
          ) : null}
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

      {infoOpen && howTo ? (
        <HowToModal
          howTo={howTo}
          createUrl={createUrl}
          createLabel={createLabel}
          onClose={() => setInfoOpen(false)}
        />
      ) : null}
    </div>
  );
}
