import { MAX_AI_CUSTOM_COMMANDS, notifyAiSettingsChanged, type AiDelivery } from '@/lib/ai';
import { getHackDeskAPI } from '@/lib/electron-api';
import { defaultAiSettings, type AiCustomCommand } from '@/lib/settings';

export type AiCommandDraft = {
  name: string;
  prompt: string;
  delivery: AiDelivery;
};

export function createAiCustomCommand(draft: AiCommandDraft): AiCustomCommand {
  return { id: crypto.randomUUID(), name: draft.name.trim(), prompt: draft.prompt.trim(), delivery: draft.delivery };
}

/**
 * Saves a change to the command list on top of the latest stored settings, so the menu and
 * Settings never overwrite each other's edits, then tells open notes to reload their commands.
 */
export async function updateAiCustomCommands(change: (commands: AiCustomCommand[]) => AiCustomCommand[]) {
  const api = getHackDeskAPI();
  if (!api) throw new Error('AI commands are available in the HackDesk desktop app.');
  const ai = (await api.settings.get()).ai ?? defaultAiSettings;
  const customCommands = change(ai.customCommands);
  if (customCommands.length > MAX_AI_CUSTOM_COMMANDS) {
    throw new Error(`You can save up to ${MAX_AI_CUSTOM_COMMANDS} AI commands. Delete one in Settings › AI first.`);
  }
  const saved = await api.settings.update({ ai: { ...ai, customCommands } });
  notifyAiSettingsChanged();
  return saved.ai?.customCommands ?? customCommands;
}
