import { readBooleanStorage, writeBooleanStorage } from './ui-preferences';

/** Per-workspace: when true, the notes tree under the root row is hidden. Default is expanded. */
export const ROOT_SECTION_COLLAPSED_PREFIX = 'hackdesk_root_section_collapsed:';

export function readRootSectionExpanded(scopeKey: string) {
  return !readBooleanStorage(`${ROOT_SECTION_COLLAPSED_PREFIX}${scopeKey}`, false);
}

export function writeRootSectionExpanded(scopeKey: string, expanded: boolean) {
  writeBooleanStorage(`${ROOT_SECTION_COLLAPSED_PREFIX}${scopeKey}`, !expanded);
}
