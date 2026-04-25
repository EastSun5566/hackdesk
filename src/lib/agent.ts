import { invoke } from '@tauri-apps/api/core';

import { Cmd } from '@/constants';

const AGENT_SESSION_STORAGE_KEY = 'hackdesk_agent_session';
const AGENT_LAUNCH_INTENT_STORAGE_KEY = 'hackdesk_agent_launch_intent';

export type AgentIntent = 'ask' | 'summary';

export type CurrentNoteContext = {
  url: string;
  path: string;
  title: string;
  noteId: string | null;
  scope: 'personal-or-team' | 'short-id' | 'unknown';
  teamPath: string | null;
  isNote: boolean;
  reason: string | null;
  content: string | null;
  contentReason: string | null;
};

export type AgentRole = 'user' | 'assistant';

export type AgentMessage = {
  id: string;
  role: AgentRole;
  content: string;
  createdAt: string;
};

export type AgentSession = {
  id: string;
  context: CurrentNoteContext | null;
  messages: AgentMessage[];
  updatedAt: string;
};

const VALID_NOTE_SCOPES = ['personal-or-team', 'short-id', 'unknown'] as const;

function isValidNoteScope(value: unknown): value is CurrentNoteContext['scope'] {
  return typeof value === 'string' && VALID_NOTE_SCOPES.includes(value as CurrentNoteContext['scope']);
}

function normalizeCurrentNoteContext(value: unknown): CurrentNoteContext | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const context = value as Record<string, unknown>;

  if (
    typeof context.url !== 'string'
    || typeof context.path !== 'string'
    || typeof context.title !== 'string'
    || !isValidNoteScope(context.scope)
    || typeof context.isNote !== 'boolean'
  ) {
    return null;
  }

  return {
    url: context.url,
    path: context.path,
    title: context.title,
    noteId: typeof context.noteId === 'string' ? context.noteId : null,
    scope: context.scope,
    teamPath: typeof context.teamPath === 'string' ? context.teamPath : null,
    isNote: context.isNote,
    reason: typeof context.reason === 'string' ? context.reason : null,
    content: typeof context.content === 'string' ? context.content : null,
    contentReason: typeof context.contentReason === 'string' ? context.contentReason : null,
  };
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}`;
}

export function createAgentMessage(role: AgentRole, content: string): AgentMessage {
  return {
    id: createId('agent-message'),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function createEmptyAgentSession(): AgentSession {
  return {
    id: createId('agent-session'),
    context: null,
    messages: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadAgentSession(storage: Storage = window.localStorage): AgentSession {
  try {
    const stored = storage.getItem(AGENT_SESSION_STORAGE_KEY);

    if (!stored) {
      return createEmptyAgentSession();
    }

    const parsed = JSON.parse(stored) as Partial<AgentSession>;

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.messages)) {
      return createEmptyAgentSession();
    }

    return {
      id: typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id : createId('agent-session'),
      context: normalizeCurrentNoteContext(parsed.context),
      messages: parsed.messages.filter((message): message is AgentMessage => {
        return Boolean(
          message
          && typeof message === 'object'
          && typeof message.id === 'string'
          && (message.role === 'user' || message.role === 'assistant')
          && typeof message.content === 'string'
          && typeof message.createdAt === 'string',
        );
      }),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return createEmptyAgentSession();
  }
}

export function saveAgentSession(session: AgentSession, storage: Storage = window.localStorage) {
  storage.setItem(AGENT_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearAgentSession(storage: Storage = window.localStorage) {
  storage.removeItem(AGENT_SESSION_STORAGE_KEY);
}

export function getPendingAgentLaunchIntent(storage: Storage = window.localStorage): AgentIntent {
  const intent = storage.getItem(AGENT_LAUNCH_INTENT_STORAGE_KEY) === 'summary' ? 'summary' : 'ask';
  storage.removeItem(AGENT_LAUNCH_INTENT_STORAGE_KEY);
  return intent;
}

export async function openAgentWindow(intent: AgentIntent = 'ask', storage: Storage = window.localStorage) {
  storage.setItem(AGENT_LAUNCH_INTENT_STORAGE_KEY, intent);
  await invoke(Cmd.OPEN_AGENT_WINDOW);
}

export async function getCurrentNoteContext() {
  return invoke<CurrentNoteContext>(Cmd.GET_CURRENT_NOTE_CONTEXT);
}

export async function sendAgentMessage(args: {
  prompt: string;
  context: CurrentNoteContext | null;
  intent?: AgentIntent;
}) {
  return invoke<string>(Cmd.SEND_AGENT_MESSAGE, {
    prompt: args.prompt,
    context: args.context,
    intent: args.intent ?? null,
  });
}
