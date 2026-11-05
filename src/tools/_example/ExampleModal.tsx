import type { ToolModalProps } from '@/src/core/types';

export function ExampleModal({ task, config, onClose }: ToolModalProps) {
  const showTitle = config.showTaskTitle !== false;
  const highlightPr = config.highlightPr !== false;
  const notePrefix = String(config.notePrefix ?? '').trim();
  const defaultTab = String(config.defaultTab ?? 'overview');

  return (
    <div>
      <p className="okt-modal__meta">
        Stub tool to validate bubbles, modals and admin toggles. No network
        calls.
      </p>
      {notePrefix ? (
        <p>
          <strong>Prefix:</strong> {notePrefix}
        </p>
      ) : null}
      <p className="okt-modal__meta">
        Default tab: <code>{defaultTab}</code>
      </p>
      {showTitle ? (
        <p>
          <strong>Task:</strong> {task.title || '(untitled)'}
        </p>
      ) : null}
      {task.links.githubPr ? (
        <p style={highlightPr ? { color: '#0f6b5c', fontWeight: 600 } : undefined}>
          <strong>PR:</strong> {task.links.githubPr.url}
        </p>
      ) : (
        <p className="okt-modal__meta">No GitHub PR link detected in description.</p>
      )}
      <code className="okt-modal__code">
        {JSON.stringify(
          {
            taskId: task.taskId,
            labels: task.labels,
            links: task.links,
            config,
          },
          null,
          2,
        )}
      </code>
      <p style={{ marginTop: 16 }}>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </p>
    </div>
  );
}
