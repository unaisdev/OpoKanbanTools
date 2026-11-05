import styles from './Toggle.module.css';

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
};

export function Toggle({ checked, onChange, label, disabled }: Props) {
  return (
    <label className={styles.root} data-disabled={disabled || undefined}>
      <input
        type="checkbox"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className={styles.track} aria-hidden>
        <span className={styles.thumb} />
      </span>
      <span className={styles.label}>{label}</span>
    </label>
  );
}
