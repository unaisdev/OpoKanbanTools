import type { ReactNode } from 'react';

export type GlobalSecretKey = 'github' | 'sentry';

export type SettingsFieldType = 'text' | 'password' | 'boolean' | 'select';

export type SettingsField = {
  key: string;
  label: string;
  description?: string;
  type: SettingsFieldType;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  defaultValue?: string | boolean;
};

export type ParsedLinks = {
  githubPr?: {
    url: string;
    owner: string;
    repo: string;
    number: number;
  };
  sentryIssue?: {
    url: string;
    /** Origin used for Sentry REST calls (handles US/EU hosts). */
    apiBase: string;
    org: string;
    issueId: string;
    project?: string;
  };
  branchHints: string[];
};

export type TaskContext = {
  taskId: string | null;
  title: string;
  descriptionText: string;
  descriptionHtml: string;
  labels: string[];
  links: ParsedLinks;
};

export type ToolModalProps = {
  task: TaskContext;
  config: Record<string, unknown>;
  onClose: () => void;
  /** Which global secrets are configured (never the values). */
  secretStatus?: Record<GlobalSecretKey, boolean>;
};

export type ToolDefinition = {
  id: string;
  name: string;
  description: string;
  /** Inline SVG markup or React node rendered inside the bubble. */
  icon: ReactNode | string;
  defaultEnabled: boolean;
  settingsFields: SettingsField[];
  usesGlobalSecrets?: GlobalSecretKey[];
  canShow?: (ctx: TaskContext, config: Record<string, unknown>) => boolean;
  renderModal: (props: ToolModalProps) => ReactNode;
};

export type ToolRuntimeState = {
  enabled: boolean;
  config: Record<string, unknown>;
};

export type Secrets = Partial<Record<GlobalSecretKey, string>>;

export type StorageSchema = {
  version: number;
  tools: Record<string, ToolRuntimeState>;
  secrets: Secrets;
};

export type PublicSettings = {
  version: number;
  tools: Record<string, ToolRuntimeState>;
  /** Which secret keys are configured (never the values). */
  secretStatus: Record<GlobalSecretKey, boolean>;
};

export const STORAGE_VERSION = 1;

export type SecretHowTo = {
  title: string;
  steps: string[];
  scopes: string[];
  note?: string;
};

export const GLOBAL_SECRET_META: Record<
  GlobalSecretKey,
  {
    label: string;
    hint: string;
    placeholder: string;
    howTo: SecretHowTo;
    /** Opens the page where the user creates / copies the token. */
    createUrl: string;
    createLabel: string;
  }
> = {
  github: {
    label: 'GitHub token',
    hint: 'Fine-grained PAT para CI Build (actions:read + actions:write).',
    placeholder: 'github_pat_…',
    howTo: {
      title: 'Cómo crear el token de GitHub',
      steps: [
        'Abre GitHub → Settings → Developer settings → Fine-grained personal access tokens.',
        'Pulsa Generate new token y dale un nombre (p. ej. OpoKanbanTools).',
        'En Repository access, elige el repo que usa CI Build.',
        'En Permissions → Repository → Actions: Read and write.',
        'Generate token, cópialo y pégalo aquí.',
      ],
      scopes: ['actions:read', 'actions:write'],
      note: 'Usa un Fine-grained PAT (no el classic, si puedes evitarlo). El token solo se guarda en este navegador.',
    },
    createUrl: 'https://github.com/settings/personal-access-tokens',
    createLabel: 'Abrir GitHub (crear PAT)',
  },
  sentry: {
    label: 'Sentry auth token',
    hint: 'User auth token para resolve / assign / comment (event:read + event:write).',
    placeholder: 'sntrys_…',
    howTo: {
      title: 'Cómo crear el token de Sentry',
      steps: [
        'Abre Sentry → User Settings → Auth Tokens.',
        'Pulsa Create New Token.',
        'Marca event:read y event:write (o permisos de admin de issues).',
        'Crea el token, cópialo y pégalo aquí.',
      ],
      scopes: ['event:read', 'event:write'],
      note: 'No hay OAuth automático: Sentry no rellena el token en la extensión. Hay que crearlo y pegarlo a mano.',
    },
    createUrl: 'https://sentry.io/settings/account/api/auth-tokens/',
    createLabel: 'Abrir Sentry (crear auth token)',
  },
};
