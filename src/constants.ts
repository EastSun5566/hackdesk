export const ROOT = '.hackdesk';
export const SETTINGS_NAME = 'settings.json';
export const DEFAULT_AGENT_PROVIDER = 'openai-compatible' as const;
export const DEFAULT_AGENT_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_AGENT_MODEL = 'gpt-5-nano';

export enum Cmd {
  EXECUTE_ACTION = 'execute_action',
  OPEN_AGENT_WINDOW = 'open_agent_window',
  OPEN_SETTINGS_WINDOW = 'open_settings_window',
  GET_CURRENT_NOTE_CONTEXT = 'get_current_note_context',
  GET_AGENT_RUNTIME_STATUS = 'get_agent_runtime_status',
  SEND_AGENT_MESSAGE = 'send_agent_message',
  VALIDATE_AGENT_PROVIDER_CONFIG = 'validate_agent_provider_config',
}

export const DEFAULT_TITLE = 'HackDesk';