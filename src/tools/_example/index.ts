import { createElement } from 'react';
import { registerTool } from '@/src/core/registry';
import { ExampleModal } from './ExampleModal';

const sparkIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="okt-bubble__icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m5.6 5.6 2.1 2.1"/><path d="m16.3 16.3 2.1 2.1"/><path d="m5.6 18.4 2.1-2.1"/><path d="m16.3 7.7 2.1-2.1"/><circle cx="12" cy="12" r="3.2"/></svg>`;

registerTool({
  id: 'example',
  name: 'Example Tool',
  description:
    'Scaffold stub. Enable it in Options to see a bubble next to KanbanFlow tasks — and expand Configuration to preview tool settings UI.',
  icon: sparkIcon,
  defaultEnabled: false,
  usesGlobalSecrets: ['github'],
  settingsFields: [
    {
      key: 'showTaskTitle',
      label: 'Show task title in modal',
      type: 'boolean',
      defaultValue: true,
    },
    {
      key: 'defaultTab',
      label: 'Default tab',
      description: 'Which panel opens first when the bubble modal appears.',
      type: 'select',
      defaultValue: 'overview',
      options: [
        { value: 'overview', label: 'Overview' },
        { value: 'details', label: 'Details' },
        { value: 'raw', label: 'Raw JSON' },
      ],
    },
    {
      key: 'notePrefix',
      label: 'Note prefix',
      description: 'Optional label prepended in the modal header.',
      type: 'text',
      placeholder: 'e.g. WIP',
      defaultValue: '',
    },
    {
      key: 'highlightPr',
      label: 'Highlight detected PR link',
      type: 'boolean',
      defaultValue: true,
    },
  ],
  renderModal: (props) => createElement(ExampleModal, props),
});
