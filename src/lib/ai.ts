/** Agent CLIs HackDesk drives with the account the user already signed in on this computer. */
export const AI_PROVIDER_IDS = ['codex', 'claude'] as const;
export type AiProviderId = typeof AI_PROVIDER_IDS[number];

export const AI_ACTIONS = ['summarize', 'rewrite', 'continue', 'translate'] as const;
export type AiAction = typeof AI_ACTIONS[number];

export const AI_ACTION_LABELS: Record<AiAction, string> = {
  summarize: 'Summarize',
  rewrite: 'Rewrite',
  continue: 'Continue writing',
  translate: 'Translate',
};

export const AI_PROVIDER_TITLES: Record<AiProviderId, string> = {
  codex: 'Codex',
  claude: 'Claude',
};

export const AI_PROVIDER_COMMANDS: Record<AiProviderId, string> = {
  codex: 'codex',
  claude: 'claude',
};

export const AI_SIGN_IN_COMMANDS: Record<AiProviderId, string> = {
  codex: 'codex login',
  claude: 'claude auth login',
};

/** Large enough for a long note, small enough that one request cannot flood a CLI's stdin. */
export const MAX_AI_INPUT_CHARACTERS = 200_000;

export type AiProviderPhase = 'idle' | 'checking' | 'not-installed' | 'sign-in-required' | 'ready' | 'failed';

export type AiModel = {
  id: string;
  label: string;
  isDefault: boolean;
};

export type AiUsageWindow = {
  usedPercent: number;
  windowMinutes: number | null;
  /** Unix seconds. */
  resetsAt: number | null;
};

export type AiProviderStatus = {
  id: AiProviderId;
  enabled: boolean;
  phase: AiProviderPhase;
  message: string | null;
  version: string | null;
  command: string | null;
  /** Plan name only, such as "ChatGPT Plus"; never the account email. */
  plan: string | null;
  models: AiModel[];
  usage: { primary: AiUsageWindow | null; secondary: AiUsageWindow | null } | null;
};

export type AiTurnInput = {
  requestId: string;
  providerId: AiProviderId;
  action: AiAction;
  text: string;
  noteTitle?: string;
  targetLanguage?: string;
};

/** Streamed while a turn runs; the turn's promise carries the final text or the error. */
export type AiTurnDelta = {
  requestId: string;
  text: string;
};

export function getAiErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/, '');
}
