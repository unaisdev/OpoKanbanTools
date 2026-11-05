import { registerTool } from '@/src/core/registry';
import { ExampleModal } from './ExampleModal';

const flaskIcon = `<svg class="okt-bubble__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6"/><path d="M10 3v6.5L5.5 18a3 3 0 0 0 2.6 4.5h8a3 3 0 0 0 2.6-4.5L14 9.5V3"/><path d="M8.5 14h7"/></svg>`;

registerTool({
  id: 'example',
  name: 'Example Tool',
  description:
    'Scaffold stub. Enable it in Options to see a bubble next to KanbanFlow tasks — and expand Configuration to preview tool settings UI.',
  icon: flaskIcon,
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
  renderModal: (props) => ExampleModal(props),
});
