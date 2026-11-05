import {
  STORAGE_VERSION,
  type GlobalSecretKey,
  type PublicSettings,
  type Secrets,
  type StorageSchema,
  type ToolRuntimeState,
} from './types';
import { getAllTools, getDefaultToolConfig } from './registry';

const LOCAL_KEY = 'okt.storage';

function emptySchema(): StorageSchema {
  return {
    version: STORAGE_VERSION,
    tools: {},
    secrets: {},
  };
}

function ensureToolDefaults(data: StorageSchema): StorageSchema {
  const tools = { ...data.tools };
  for (const tool of getAllTools()) {
    const existing = tools[tool.id];
    if (!existing) {
      tools[tool.id] = {
        enabled: tool.defaultEnabled,
        config: getDefaultToolConfig(tool),
      };
    } else {
      tools[tool.id] = {
        enabled: existing.enabled,
        config: {
          ...getDefaultToolConfig(tool),
          ...existing.config,
        },
      };
    }
  }
  return { ...data, tools, version: STORAGE_VERSION };
}

export async function readStorage(): Promise<StorageSchema> {
  const result = await browser.storage.local.get(LOCAL_KEY);
  const raw = result[LOCAL_KEY] as StorageSchema | undefined;
  return ensureToolDefaults(raw ?? emptySchema());
}

export async function writeStorage(data: StorageSchema): Promise<void> {
  await browser.storage.local.set({
    [LOCAL_KEY]: { ...data, version: STORAGE_VERSION },
  });
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const data = await readStorage();
  const secretStatus = {
    github: Boolean(data.secrets.github),
    sentry: Boolean(data.secrets.sentry),
  } satisfies Record<GlobalSecretKey, boolean>;

  return {
    version: data.version,
    tools: data.tools,
    secretStatus,
  };
}

export async function setToolEnabled(
  toolId: string,
  enabled: boolean,
): Promise<PublicSettings> {
  const data = await readStorage();
  const current: ToolRuntimeState = data.tools[toolId] ?? {
    enabled: false,
    config: {},
  };
  data.tools[toolId] = { ...current, enabled };
  await writeStorage(data);
  return getPublicSettings();
}

export async function setToolConfig(
  toolId: string,
  config: Record<string, unknown>,
): Promise<PublicSettings> {
  const data = await readStorage();
  const current: ToolRuntimeState = data.tools[toolId] ?? {
    enabled: false,
    config: {},
  };
  data.tools[toolId] = {
    ...current,
    config: { ...current.config, ...config },
  };
  await writeStorage(data);
  return getPublicSettings();
}

export async function setSecrets(
  patch: Partial<Secrets>,
): Promise<PublicSettings> {
  const data = await readStorage();
  const next: Secrets = { ...data.secrets };
  for (const [key, value] of Object.entries(patch) as Array<
    [GlobalSecretKey, string | undefined]
  >) {
    if (value === undefined || value === '') {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  data.secrets = next;
  await writeStorage(data);
  return getPublicSettings();
}

export async function clearSecret(key: GlobalSecretKey): Promise<PublicSettings> {
  const data = await readStorage();
  const next = { ...data.secrets };
  delete next[key];
  data.secrets = next;
  await writeStorage(data);
  return getPublicSettings();
}

/** Only for the service worker when proxying API calls. Never send to content scripts. */
export async function getSecret(key: GlobalSecretKey): Promise<string | undefined> {
  const data = await readStorage();
  return data.secrets[key];
}

export async function migrateOnInstall(): Promise<void> {
  const data = await readStorage();
  await writeStorage(ensureToolDefaults(data));
}
