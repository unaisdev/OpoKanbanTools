import type { SettingsField, ToolDefinition } from './types';

const tools = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  if (tools.has(tool.id)) {
    console.warn(`[OpoKanbanTools] Tool "${tool.id}" is already registered; overwriting.`);
  }
  tools.set(tool.id, tool);
}

export function getTool(id: string): ToolDefinition | undefined {
  return tools.get(id);
}

export function getAllTools(): ToolDefinition[] {
  return Array.from(tools.values());
}

export function getDefaultToolConfig(tool: ToolDefinition): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const field of tool.settingsFields) {
    if (field.defaultValue !== undefined) {
      config[field.key] = field.defaultValue;
    }
  }
  return config;
}

export function getSettingsFields(toolId: string): SettingsField[] {
  return getTool(toolId)?.settingsFields ?? [];
}
