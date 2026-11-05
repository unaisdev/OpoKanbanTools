import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import type {
  GlobalSecretKey,
  TaskContext,
  ToolDefinition,
} from '@/src/core/types';

type OpenModalArgs = {
  tool: ToolDefinition;
  task: TaskContext;
  config: Record<string, unknown>;
  secretStatus?: Record<GlobalSecretKey, boolean>;
};

let hostEl: HTMLDivElement | null = null;
let root: Root | null = null;

function ensureHost(): HTMLDivElement {
  if (hostEl && document.body.contains(hostEl)) return hostEl;
  hostEl = document.createElement('div');
  hostEl.id = 'okt-modal-host';
  hostEl.className = 'okt-modal-root';
  hostEl.setAttribute('data-okt', 'modal-host');
  document.body.appendChild(hostEl);
  root = createRoot(hostEl);
  return hostEl;
}

function ModalShell({
  title,
  iconHtml,
  onClose,
  children,
}: {
  title: string;
  iconHtml?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="okt-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="okt-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="okt-modal__header">
          <h2 className="okt-modal__title">
            {iconHtml ? (
              <span
                className="okt-modal__title-icon"
                aria-hidden
                dangerouslySetInnerHTML={{ __html: iconHtml }}
              />
            ) : null}
            {title}
          </h2>
          <button
            type="button"
            className="okt-modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="okt-modal__body">{children}</div>
      </div>
    </div>
  );
}

export function closeToolModal(): void {
  if (root) {
    root.render(null);
  }
}

export function openToolModal({
  tool,
  task,
  config,
  secretStatus,
}: OpenModalArgs): void {
  ensureHost();
  const onClose = () => closeToolModal();
  root!.render(
    <ModalShell
      title={tool.name}
      iconHtml={typeof tool.icon === 'string' ? tool.icon : undefined}
      onClose={onClose}
    >
      {tool.renderModal({ task, config, onClose, secretStatus })}
    </ModalShell>,
  );
}
