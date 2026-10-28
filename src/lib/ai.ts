/** Agent CLIs HackDesk drives with the account the user already signed in on this computer. */
export const AI_PROVIDER_IDS = ['codex', 'claude'] as const;
export type AiProviderId = typeof AI_PROVIDER_IDS[number];

export const AI_ACTIONS = ['fix', 'improve', 'shorter', 'longer', 'translate', 'summarize', 'continue', 'cleanup', 'custom'] as const;
export type AiAction = typeof AI_ACTIONS[number];

/** Rewrites replace the text they were given; Summarize and Continue add a new paragraph after it. */
export type AiDelivery = 'replace' | 'insert-below';

export type AiActionDetails = {
  label: string;
  progressLabel: string;
  delivery: AiDelivery;
  keywords: string[];
};

export const AI_ACTION_DETAILS: Record<AiAction, AiActionDetails> = {
  fix: { label: 'Fix spelling & grammar', progressLabel: 'Fixing…', delivery: 'replace', keywords: ['fix', 'typo', 'grammar', 'spelling', 'proofread'] },
  improve: { label: 'Improve writing', progressLabel: 'Improving…', delivery: 'replace', keywords: ['improve', 'rewrite', 'clarity', 'polish'] },
  shorter: { label: 'Make shorter', progressLabel: 'Shortening…', delivery: 'replace', keywords: ['shorter', 'concise', 'shorten', 'trim'] },
  longer: { label: 'Make longer', progressLabel: 'Expanding…', delivery: 'replace', keywords: ['longer', 'expand', 'elaborate', 'detail'] },
  translate: { label: 'Translate', progressLabel: 'Translating…', delivery: 'replace', keywords: ['translate', 'language'] },
  summarize: { label: 'Summarize', progressLabel: 'Summarizing…', delivery: 'insert-below', keywords: ['summarize', 'summary', 'tldr'] },
  continue: { label: 'Continue writing', progressLabel: 'Writing…', delivery: 'insert-below', keywords: ['continue', 'write', 'next'] },
  cleanup: { label: 'Clean up dictation', progressLabel: 'Cleaning up…', delivery: 'replace', keywords: ['dictation', 'transcript', 'voice', 'speech', 'filler', 'clean', 'tidy'] },
  custom: { label: 'Ask AI', progressLabel: 'Working…', delivery: 'replace', keywords: [] },
};

export const MAX_AI_INSTRUCTION_CHARACTERS = 500;
/** A saved command's prompt may be longer than a request typed into the menu. */
export const MAX_AI_COMMAND_PROMPT_CHARACTERS = 2_000;
export const MAX_AI_COMMAND_NAME_CHARACTERS = 60;
export const MAX_AI_CUSTOM_COMMANDS = 50;
/** Text around the selection sent along so the result matches its tone; never rewritten. */
export const MAX_AI_CONTEXT_CHARACTERS = 1_500;

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
  /** Claude only: an exported ANTHROPIC_API_KEY would bill instead of the claude.ai sign-in. */
  apiKeyInEnvironment: boolean;
};

export type AiTurnInput = {
  requestId: string;
  providerId: AiProviderId;
  action: AiAction;
  text: string;
  noteTitle?: string;
  targetLanguage?: string;
  /** The user's own request; only for the `custom` action. */
  instruction?: string;
  /** Where a `custom` answer goes; other actions have their own. */
  delivery?: AiDelivery;
  context?: { before: string; after: string };
};

export const MAX_ASK_NOTES_SOURCES = 8;
export const MAX_ASK_NOTES_SOURCE_CHARACTERS = 2_000;
export const MAX_ASK_NOTES_HISTORY = 2;

/** A question about the user's notes, answered from the passages found for it. */
export type AskNotesInput = {
  requestId: string;
  providerId: AiProviderId;
  question: string;
  /** Numbered from 1 in this order; the answer cites them as `[1]`. */
  sources: { title: string; text: string }[];
  /** Earlier questions and answers in the same conversation, oldest first. */
  history: { question: string; answer: string }[];
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

const AI_SETTINGS_CHANGED_EVENT = 'hackdesk:ai-settings-changed';

/** Settings › AI saves through IPC on its own; open notes listen for this to pick up the change. */
export function notifyAiSettingsChanged() {
  window.dispatchEvent(new Event(AI_SETTINGS_CHANGED_EVENT));
}

export function onAiSettingsChanged(listener: () => void) {
  window.addEventListener(AI_SETTINGS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(AI_SETTINGS_CHANGED_EVENT, listener);
}
