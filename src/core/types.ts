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
    org?: string;
    project?: string;
    issueId?: string;
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
  canShow?: (ctx: TaskContext) => boolean;
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

export const GLOBAL_SECRET_META: Record<
  GlobalSecretKey,
  { label: string; hint: string; placeholder: string }
> = {
  github: {
    label: 'GitHub token',
    hint: 'Fine-grained PAT. Read workflows with actions:read; launching workflows needs actions:write.',
    placeholder: 'github_pat_…',
  },
  sentry: {
    label: 'Sentry auth token',
    hint: 'User or org token with read access to issues/events as needed by tools.',
    placeholder: 'sntrys_…',
  },
};
