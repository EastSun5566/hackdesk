import { z } from 'zod';

import {
  DEFAULT_AGENT_BASE_URL,
  DEFAULT_AGENT_MODEL,
  DEFAULT_AGENT_PROVIDER,
  DEFAULT_TITLE,
} from '@/constants';

export const agentProviderSettingsSchema = z.object({
  provider: z.literal(DEFAULT_AGENT_PROVIDER).default(DEFAULT_AGENT_PROVIDER),
  apiKey: z.string().trim().default(''),
  baseUrl: z.string().trim().url('Base URL must be a valid URL').default(DEFAULT_AGENT_BASE_URL),
  model: z.string().trim().min(1, 'Model is required').default(DEFAULT_AGENT_MODEL),
});

export type AgentProviderSettings = z.infer<typeof agentProviderSettingsSchema>;

export const defaultAgentProviderSettings: AgentProviderSettings = {
  provider: DEFAULT_AGENT_PROVIDER,
  apiKey: '',
  baseUrl: DEFAULT_AGENT_BASE_URL,
  model: DEFAULT_AGENT_MODEL,
};

export const settingsSchema = z.object({
  title: z.string().min(1, 'Title is required').max(50, 'Title too long'),
  hackmdApiToken: z.string().trim().default(''),
  agent: agentProviderSettingsSchema.catch(defaultAgentProviderSettings).default(defaultAgentProviderSettings),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export const defaultSettings: AppSettings = {
  title: DEFAULT_TITLE,
  hackmdApiToken: '',
  agent: defaultAgentProviderSettings,
};

function getSettingsError(error: unknown) {
  if (error instanceof z.ZodError) {
    return new Error(error.issues[0]?.message ?? 'Invalid settings');
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Invalid settings');
}

export function validateSettings(settings: unknown): AppSettings {
  const result = settingsSchema.safeParse(settings);

  if (!result.success) {
    throw getSettingsError(result.error);
  }

  return result.data;
}

export function parseSettings(content: string): AppSettings {
  try {
    return validateSettings(JSON.parse(content));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON format');
    }

    throw getSettingsError(error);
  }
}

export function parseSettingsOrDefault(
  content?: string | null,
  fallback: AppSettings = defaultSettings,
  onError?: (error: Error) => void,
): AppSettings {
  if (!content) {
    return fallback;
  }

  try {
    return parseSettings(content);
  } catch (error) {
    onError?.(getSettingsError(error));
    return fallback;
  }
}

export function serializeSettings(settings: AppSettings) {
  return JSON.stringify(validateSettings(settings), null, 2);
}