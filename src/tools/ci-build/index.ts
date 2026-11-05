import { createElement } from 'react';
import { registerTool } from '@/src/core/registry';
import { CiBuildModal } from './CiBuildModal';
import {
  DEFAULT_BUILD_NUMBER_OFFSET,
  DEFAULT_OWNER,
  DEFAULT_REPO,
  DEFAULT_REQUIRED_LABEL,
  DEFAULT_WORKFLOW,
  DEFAULT_WORKFLOW_REF,
  TOOL_ID,
} from './constants';

/** Probeta (Erlenmeyer) — Options, sidebar bubble, and modal header. */
const flaskIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="okt-bubble__icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6"/><path d="M10 3v6.5L5.5 18a3 3 0 0 0 2.6 4.5h8a3 3 0 0 0 2.6-4.5L14 9.5V3"/><path d="M8.5 14h7"/></svg>`;

registerTool({
  id: TOOL_ID,
  name: 'CI Build',
  description:
    'Lanza el workflow App Testing Environments de GitHub sobre la rama/PR de una tarea (etiqueta pr:app).',
  icon: flaskIcon,
  defaultEnabled: false,
  usesGlobalSecrets: ['github'],
  settingsFields: [
    {
      key: 'owner',
      label: 'GitHub owner',
      type: 'text',
      defaultValue: DEFAULT_OWNER,
    },
    {
      key: 'repo',
      label: 'Repository',
      type: 'text',
      defaultValue: DEFAULT_REPO,
    },
    {
      key: 'workflow',
      label: 'Workflow file',
      description: 'Filename under .github/workflows/',
      type: 'text',
      defaultValue: DEFAULT_WORKFLOW,
    },
    {
      key: 'workflowRef',
      label: 'Workflow ref',
      description: 'Branch/tag used to read the workflow YAML for inputs.',
      type: 'text',
      defaultValue: DEFAULT_WORKFLOW_REF,
    },
    {
      key: 'buildNumberOffset',
      label: 'Build number offset',
      description:
        'Added to GITHUB_RUN_NUMBER (Fastfile / build.gradle use run + offset).',
      type: 'text',
      defaultValue: String(DEFAULT_BUILD_NUMBER_OFFSET),
    },
    {
      key: 'requiredLabel',
      label: 'Required task label',
      description:
        'Bubble only appears when the open task has this label (case-insensitive). Leave empty to always show.',
      type: 'text',
      defaultValue: DEFAULT_REQUIRED_LABEL,
    },
  ],
  canShow: (task, toolConfig) => {
    const required = String(
      toolConfig.requiredLabel ?? DEFAULT_REQUIRED_LABEL,
    )
      .trim()
      .toLowerCase();
    if (!required) return true;
    return task.labels.some((l) => l.trim().toLowerCase() === required);
  },
  // Must return a React element (createElement), not call the component as a
  // function — CiBuildModal uses hooks and would crash otherwise.
  renderModal: (props) => createElement(CiBuildModal, props),
});
