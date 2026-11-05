import styles from './StatusChip.module.css';

type Props = {
  label: string;
  on: boolean;
  onLabel?: string;
  offLabel?: string;
};

export function StatusChip({
  label,
  on,
  onLabel = 'Connected',
  offLabel = 'Not set',
}: Props) {
  return (
    <span className={styles.chip} data-on={on || undefined}>
      <span className={styles.name}>{label}</span>
      <span className={styles.state}>{on ? onLabel : offLabel}</span>
    </span>
  );
}
