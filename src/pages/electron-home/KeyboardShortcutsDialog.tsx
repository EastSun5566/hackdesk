import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ELECTRON_ACTIONS, getResolvedActionShortcut, resolveWorkbenchShortcut } from '@/lib/electron-actions';
import type { ShortcutOverrides } from '@/lib/keyboard-shortcuts';
import { displayShortcutConfig } from '@/lib/keyboard-shortcuts';
import type { ElectronFocusZone } from './useElectronFocusZones';
import { FOCUS_RING_CLASS, SECONDARY_BUTTON_CLASS } from './ui';

const REGION_NAMES: Record<ElectronFocusZone, string> = { workspace: 'Workspace', navigator: 'Navigator', tabs: 'Tabs', editor: 'Editor', inspector: 'Note Details' };
const WIDGET_KEYS = [
  { region: 'tabs', label: 'Move tab focus', keys: '← / → / Home / End', description: 'Move focus without selecting a tab.' },
  { region: 'tabs', label: 'Select focused tab', keys: 'Enter / Space', description: 'Activate the focused tab.' },
  { region: 'navigator', label: 'Move tree focus', keys: '↑ / ↓ / Home / End', description: 'Move focus without opening a note.' },
  { region: 'navigator', label: 'Expand / collapse folder', keys: '→ / ←', description: 'Expand a folder or move to its parent.' },
  { region: 'navigator', label: 'Open focused tree item', keys: 'Enter / Space', description: 'Select a folder or open a note.' },
  { region: 'navigator', label: 'Find by name', keys: 'Type a name', description: 'Focus the next matching tree item.' },
];

export function KeyboardShortcutsDialog({ open, region, returnFocus, shortcuts, platform, characterShortcutsEnabled, onOpenChange, onCustomize }: {
  open: boolean;
  region: ElectronFocusZone;
  returnFocus: HTMLElement | null;
  shortcuts?: ShortcutOverrides;
  platform: string;
  characterShortcutsEnabled: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomize: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const customizing = useRef(false);
  const [query, setQuery] = useState('');
  const [currentOnly, setCurrentOnly] = useState(true);
  const scope = region === 'tabs' ? 'editor' : region;
  const matches = (value: string) => value.toLowerCase().includes(query.trim().toLowerCase());
  const actions = ELECTRON_ACTIONS.filter(action => (!currentOnly || !action.scope || action.scope === 'global' || action.scope === scope)
    && matches([action.label, action.description, ...action.keywords, getResolvedActionShortcut(action.id, shortcuts, platform, characterShortcutsEnabled) ?? ''].join(' ')));
  const widgets = WIDGET_KEYS.filter(item => (!currentOnly || item.region === region) && matches(`${item.label} ${item.description} ${item.keys}`));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={searchRef} finalFocus={() => !customizing.current && returnFocus?.isConnected ? returnFocus : false} className="flex max-h-[min(760px,calc(100dvh-4rem))] w-[min(720px,calc(100dvw-3rem))] max-w-[720px] flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border-default p-5 pr-12">
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>Discover actions and their current keys. Text editors keep their own navigation bindings.</DialogDescription>
        </DialogHeader>
        <div className="shrink-0 space-y-3 px-5 pt-4">
          <label className="block">
            <span className="sr-only">Search keyboard shortcuts</span>
            <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search keyboard shortcuts" className={`h-9 w-full rounded-md border border-border-default bg-background-muted px-3 text-sm ${FOCUS_RING_CLASS}`} />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Shortcut scope">
            <button type="button" className={`${SECONDARY_BUTTON_CLASS} ${currentOnly ? 'bg-background-selected' : ''}`} aria-pressed={currentOnly} onClick={() => setCurrentOnly(true)}>Current Region: {REGION_NAMES[region]}</button>
            <button type="button" className={`${SECONDARY_BUTTON_CLASS} ${!currentOnly ? 'bg-background-selected' : ''}`} aria-pressed={!currentOnly} onClick={() => setCurrentOnly(false)}>All Actions</button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4">
          {!actions.length && !widgets.length ? <p className="text-sm text-text-subtle">No matching shortcuts.</p> : null}
          <ul className="divide-y divide-border-default">
            {actions.map(action => {
              const config = resolveWorkbenchShortcut(action.id, shortcuts, characterShortcutsEnabled);
              const shortcut = getResolvedActionShortcut(action.id, shortcuts, platform, characterShortcutsEnabled);
              const contextLabel = action.keyboardContext === 'scroll' ? 'Non-editing UI' : action.keyboardContext === 'region' ? 'Workbench' : action.keyboardContext === 'character' && (config === '/' || config === '?') ? 'Non-editing Workbench' : 'App';
              return <li key={action.id} className="flex items-center gap-4 py-3">
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">{action.label}</p><p className="text-xs text-text-subtle">{action.description}</p><p className="mt-1 text-xs text-text-subtle">{contextLabel} · {action.scope === 'inspector' ? 'Note Details' : action.scope ?? 'global'}</p></div>
                <kbd className="shrink-0 rounded-md border border-border-default bg-background-muted px-2 py-1 text-xs">{shortcut || (config === 'none' ? 'Disabled' : 'Unassigned')}</kbd>
              </li>;
            })}
            {widgets.map(item => <li key={item.label} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-text-subtle">{item.description}</p><p className="mt-1 text-xs text-text-subtle">{item.region} · Built-in widget keys</p></div>
              <kbd className="shrink-0 rounded-md border border-border-default bg-background-muted px-2 py-1 text-xs">{item.keys}</kbd>
            </li>)}
            {matches('hold keyboard navigation hints Cmd Ctrl') ? <li className="py-3"><p className="text-sm font-medium">Hold {platform === 'darwin' ? 'Cmd' : 'Ctrl'} for Navigation Hints</p><p className="text-xs text-text-subtle">Keep the modifier held and type a visible code. Escape cancels; release to start again. Buttons receive focus, then Enter runs the action.</p></li> : null}
            {(!currentOnly || region === 'workspace') && matches('Switch workspace My Workspace pinned teams') ? <li className="flex items-center gap-4 py-3"><div className="flex-1"><p className="text-sm font-medium">Switch Workspace</p><p className="text-xs text-text-subtle">1: My Workspace; 2–9: pinned teams. Fixed workspace keys.</p></div><kbd className="text-xs">{displayShortcutConfig('mod+1', platform)}…9</kbd></li> : null}
            {!currentOnly && matches('Quick Hack global') ? <li className="flex items-center gap-4 py-3"><div className="flex-1"><p className="text-sm font-medium">Quick Hack</p><p className="text-xs text-text-subtle">Global · Open from any app.</p></div><kbd className="text-xs">{displayShortcutConfig('ctrl+alt+h', platform)}</kbd></li> : null}
          </ul>
        </div>
        <div className="flex shrink-0 justify-end border-t border-border-default p-4"><button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => { customizing.current = true; onCustomize(); }}>Customize in Settings</button></div>
      </DialogContent>
    </Dialog>
  );
}
