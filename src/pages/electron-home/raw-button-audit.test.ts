import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const allowedRawButtonFiles: Record<string, string> = {
  'src/components/ErrorBoundary.tsx': 'fallback UI outside the Electron home primitive layer',
  'src/components/ui/alert-dialog.tsx': 'Base UI AlertDialog action/cancel render bridge',
  'src/pages/electron-home/DocumentDetail.tsx': 'editor-adjacent special empty-state/actions',
  'src/pages/electron-home/DocumentTabs.tsx': 'tab strip close/activation behavior',
  'src/pages/electron-home/FolderNavigator.tsx': 'navigator tree/empty-state special interactions',
  'src/pages/electron-home/FolderNavigatorFinder.tsx': 'filter chips, clear controls, and show-more disclosure buttons',
  'src/pages/electron-home/FolderNavigatorRows.tsx': 'folder/note row tree controls and inline action buttons',
  'src/pages/electron-home/NoteInspectorSections.tsx': 'tag chip remove control inside composite tag editor',
  'src/pages/electron-home/PanelResizeSash.tsx': 'resize handle semantics',
  'src/pages/electron-home/SettingsPrimitives.tsx': 'tooltip help trigger with expanded hit target',
  'src/pages/electron-home/ShortcutsSettingsPanel.tsx': 'keyboard shortcut capture controls',
  'src/pages/electron-home/interaction-primitives.tsx': 'shared row, disclosure, and toolbar-adjacent primitives',
};

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      return listSourceFiles(fullPath);
    }

    return /\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry) ? [fullPath] : [];
  });
}

describe('raw button audit', () => {
  it('keeps remaining raw buttons limited to documented special interaction surfaces', () => {
    const roots = ['src/components', 'src/pages/electron-home'];
    const filesWithRawButtons = roots
      .flatMap((root) => listSourceFiles(join(process.cwd(), root)))
      .filter((file) => readFileSync(file, 'utf8').includes('<button'))
      .map((file) => relative(process.cwd(), file))
      .sort();

    expect(filesWithRawButtons).toEqual(Object.keys(allowedRawButtonFiles).sort());
  });

  it('documents why each remaining raw button file is intentionally preserved', () => {
    expect(Object.values(allowedRawButtonFiles).every((reason) => reason.length > 0)).toBe(true);
  });
});
