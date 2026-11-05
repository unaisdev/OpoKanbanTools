import { createElement } from 'react';
import { registerTool } from '@/src/core/registry';
import { SentryResolveModal } from './SentryResolveModal';
import { TOOL_ID } from './constants';

/** Crosshair / target — Options, sidebar bubble, and modal header. */
const sentryIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="okt-bubble__icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/></svg>`;

registerTool({
  id: TOOL_ID,
  name: 'Sentry Actions',
  description:
    'Acciones sueltas sobre el issue de Sentry: resolver in next release, asignarte y comentar con el link de Kanban.',
  icon: sentryIcon,
  defaultEnabled: false,
  usesGlobalSecrets: ['sentry'],
  settingsFields: [],
  canShow: (task) => Boolean(task.links.sentryIssue?.issueId),
  // Must return a React element (createElement), not call the component as a
  // function — SentryResolveModal uses hooks and would crash otherwise.
  renderModal: (props) => createElement(SentryResolveModal, props),
});
