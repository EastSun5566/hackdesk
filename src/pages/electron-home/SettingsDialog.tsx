import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useTheme } from '@/components/theme-provider';
import { useThemeAppearanceDraft } from '@/components/useThemeAppearanceDraft';
import type { AppIconId } from '@/lib/app-icons';
import type { ElectronSafeSettings, UserSummary } from '@/lib/electron-api';
import type { LocalVaultSnapshot } from '@/lib/local-vault';
import { defaultSettings, type EditorMode } from '@/lib/settings';

import { AdvancedSettingsPanel } from './AdvancedSettingsPanel';
import { AiSettingsPanel } from './AiSettingsPanel';
import { DictationSettingsPanel } from './DictationSettingsPanel';
import { OfflineSettingsSection } from './OfflineSettingsSection';
import { AppearanceSettingsPanel } from './AppearanceSettingsPanel';
import { EditorSettingsPanel } from './EditorSettingsPanel';
import { GeneralSettingsPanel } from './GeneralSettingsPanel';
import { HackmdSettingsPanel, type TokenTestState } from './HackmdSettingsPanel';
import {
  SETTINGS_PANEL_CLASS,
  SETTINGS_TABS,
  type SettingsTab,
} from './SettingsDialogConfig';
import { SettingsPage } from './SettingsPrimitives';
import { SettingsTabs } from './SettingsTabs';
import type { SettingsSearchResult } from './settings-search';
import { ShortcutsSettingsPanel } from './ShortcutsSettingsPanel';
import type { SettingsFormInput } from './types';
import { VaultSettingsPanel, type LocalWorkspaceSettingsActions } from './VaultSettingsPanel';
import { holdHintsPreference, leaderSpacePreference } from './keyboard-feature-preferences';
import { setNewTabOpens } from './new-tab-preference';
import { setSplitStatusLine } from './split-status-line-preference';
import { setStatusLineVisible } from './status-line-preference';
import { setTreeGuides } from './tree-guides-preference';

/** What the header Reset button puts back to defaults, per page. */
const TAB_RESET_COPY: Record<SettingsTab, { title: string; description: string; confirm: string }> = {
  general: {
    title: 'Reset General settings?',
    description: 'Puts the window title back to its default.',
    confirm: 'Reset General',
  },
  editor: {
    title: 'Reset Editor settings?',
    description: 'Puts the editor mode and new-tab behavior back to defaults.',
    confirm: 'Reset Editor',
  },
  shortcuts: {
    title: 'Reset Shortcuts settings?',
    description: 'Clears custom shortcuts and puts keyboard options back to defaults.',
    confirm: 'Reset Shortcuts',
  },
  appearance: {
    title: 'Reset Appearance settings?',
    description: 'Puts the theme, sidebar guides, and status line back to defaults.',
    confirm: 'Reset Appearance',
  },
  vault: {
    title: 'Forget the local vault?',
    description: 'Removes the vault path from Settings. Your files stay where they are.',
    confirm: 'Forget Vault',
  },
  hackmd: {
    title: 'Reset HackMD settings?',
    description: 'Signs out of HackMD and clears the token input.',
    confirm: 'Sign Out',
  },
  ai: {
    title: 'Reset AI settings?',
    description: 'Turns providers off, clears the default, restores editor options, and deletes custom commands.',
    confirm: 'Reset AI',
  },
  dictation: {
    title: 'Reset Dictation settings?',
    description: 'Turns dictation off and follows the system language.',
    confirm: 'Reset Dictation',
  },
  advanced: {
    title: 'Reset Advanced settings?',
    description: 'Puts the experimental status line option back to its default.',
    confirm: 'Reset Advanced',
  },
};

type SettingsDialogProps = {
  open: boolean;
  initialTab?: SettingsTab;
  appVersion?: string;
  settings?: ElectronSafeSettings;
  platform?: string;
  localVaultError?: string | null;
  localVaultSnapshot?: LocalVaultSnapshot | null;
  isSaving: boolean;
  onDisconnectHackmd: () => void;
  onOpenChange: (open: boolean) => void;
  onChooseLocalVault: () => Promise<void | boolean>;
  onForgetLocalVault: (vaultId?: string) => Promise<void>;
  onSwitchLocalVault: (vaultId: string) => Promise<void>;
  localWorkspaceActions?: LocalWorkspaceSettingsActions;
  onOpenLocalVault: () => Promise<void>;
  onRefreshLocalVault: () => Promise<void>;
  onSave: (input: SettingsFormInput) => void;
  onValidateToken: (token: string) => Promise<UserSummary>;
};

export function SettingsDialog(props: SettingsDialogProps) {
  // The form starts from the saved settings, so a change made elsewhere remounts it. While Settings
  // is open, its own saves change those settings too, and remounting then would drop focus, the
  // search and the page in use, so that part of the key only follows changes made while it is
  // closed. Opening it on a given page always does.
  const saved = `${props.settings?.title ?? 'HackDesk'}:${props.settings?.editor?.mode ?? 'standard'}`;
  const [formSource, setFormSource] = useState(saved);
  if (!props.open && formSource !== saved) setFormSource(saved);
  return <SettingsDialogContent key={`${props.initialTab ?? 'general'}:${formSource}`} {...props} />;
}

function SettingsDialogContent({
  open,
  initialTab = 'general',
  appVersion,
  settings,
  platform = navigator.platform,
  localVaultError,
  localVaultSnapshot,
  isSaving,
  onDisconnectHackmd,
  onChooseLocalVault,
  onForgetLocalVault,
  onSwitchLocalVault,
  localWorkspaceActions,
  onOpenLocalVault,
  onRefreshLocalVault,
  onOpenChange,
  onSave,
  onValidateToken,
}: SettingsDialogProps) {
  const { cancelPreview, setAppearance } = useTheme();
  const tokenValidationRequestRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [focusRequest, setFocusRequest] = useState<{ target: HTMLElement } | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const activeTabConfig = SETTINGS_TABS.find(tab => tab.id === activeTab);
  const activeTabHeading = activeTabConfig?.heading ?? activeTabConfig?.label;
  const [formState, setFormState] = useState(() => ({
    title: settings?.title ?? 'HackDesk',
    editorMode: settings?.editor?.mode ?? defaultSettings.editor.mode,
    appIcon: settings?.appIcon ?? defaultSettings.appIcon,
    token: '',
    tokenVisible: false,
    addingAccount: false,
    tokenTest: {
      status: 'idle',
      message: '',
    } as TokenTestState,
    shortcuts: settings?.shortcuts ?? defaultSettings.shortcuts,
    characterShortcutsEnabled: settings?.keyboardNavigation?.characterShortcutsEnabled ?? true,
    keyHintsVisible: settings?.keyboardNavigation?.keyHintsVisible ?? true,
  }));
  const appearanceController = useThemeAppearanceDraft({ showTypography: true });
  // Appearance applies at once now, so closing only clears invalid, unapplied input.
  const cancelAppearanceDraftRef = useRef(appearanceController.actions.cancel);
  useLayoutEffect(() => {
    cancelAppearanceDraftRef.current = appearanceController.actions.cancel;
  });
  useEffect(() => {
    if (!open) cancelAppearanceDraftRef.current();
  }, [open]);
  // Every close path, the parent's included: a token check still running when Settings closes
  // must not save afterwards, nor leave "Testing token…" behind for the next time it opens.
  useLayoutEffect(() => {
    if (!open) tokenValidationRequestRef.current += 1;
  }, [open]);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open && formState.tokenTest.status === 'testing') {
      setFormState((current) => ({ ...current, tokenTest: { status: 'idle', message: '' } }));
    }
  }
  useEffect(() => cancelPreview, [cancelPreview]);
  const { appIcon, editorMode, shortcuts, characterShortcutsEnabled, keyHintsVisible, title, token, tokenTest, tokenVisible, addingAccount } = formState;

  // Every change saves at once; the footer is gone. Text fields debounce so typing saves once it pauses.
  const titleSaveTimer = useRef<number | undefined>(undefined);
  // The typed title still waiting for its debounce, so leaving the field or closing can save it.
  const pendingTitle = useRef<string | null>(null);
  const onSaveRef = useRef(onSave);
  useLayoutEffect(() => {
    onSaveRef.current = onSave;
  });
  const cancelTitleSave = () => {
    window.clearTimeout(titleSaveTimer.current);
    pendingTitle.current = null;
  };
  const flushTitleSave = () => {
    const pending = pendingTitle.current;
    cancelTitleSave();
    if (pending) onSaveRef.current({ title: pending });
  };
  useEffect(() => () => {
    const pending = pendingTitle.current;
    window.clearTimeout(titleSaveTimer.current);
    if (pending) onSaveRef.current({ title: pending });
  }, []);
  const savedTitle = settings?.title ?? defaultSettings.title;
  const titleForSave = title.trim() || savedTitle;
  const saveTitle = (next: string, immediate: boolean) => {
    cancelTitleSave();
    const trimmed = next.trim();
    if (!trimmed) return;
    if (immediate) {
      onSave({ title: trimmed });
      return;
    }
    pendingTitle.current = trimmed;
    titleSaveTimer.current = window.setTimeout(flushTitleSave, 600);
  };
  const handleTitleChange = (next: string) => {
    setFormState((current) => ({ ...current, title: next }));
    saveTitle(next, false);
  };
  const handleTitleBlur = () => {
    // Leaving the field saves a title still waiting for its debounce.
    flushTitleSave();
    // An empty title never saves; leaving the field puts the saved one back.
    if (!title.trim() && title !== savedTitle) {
      setFormState((current) => ({ ...current, title: savedTitle }));
    }
  };
  const handleEditorModeChange = (mode: EditorMode) => {
    setFormState((current) => ({ ...current, editorMode: mode }));
    onSave({ title: titleForSave, editor: { mode } });
  };
  const handleAppIconChange = (next: AppIconId) => {
    setFormState((current) => ({ ...current, appIcon: next }));
    onSave({ title: titleForSave, appIcon: next });
  };
  const handleShortcutsChange = (next: typeof shortcuts) => {
    setFormState((current) => ({ ...current, shortcuts: next }));
    onSave({
      title: titleForSave,
      shortcuts: next,
      keyboardNavigation: { characterShortcutsEnabled, keyHintsVisible },
    });
  };
  const handleKeyboardNavigationChange = (next: { characterShortcutsEnabled: boolean; keyHintsVisible: boolean }) => {
    setFormState((current) => ({ ...current, ...next }));
    onSave({ title: titleForSave, shortcuts, keyboardNavigation: next });
  };

  // Appearance commits each valid change, so there is no Apply step and no preview to cancel.
  const { status: appearanceStatus, actions: appearanceActions } = appearanceController;
  useEffect(() => {
    if (open && appearanceStatus.hasDraftChanges && appearanceStatus.canApply) {
      appearanceActions.apply();
    }
  }, [open, appearanceStatus, appearanceActions]);

  // A section of a self-saving page resets through the page itself: the bump reaches only its panel.
  const [resetRequest, setResetRequest] = useState<{ tab: SettingsTab; nonce: number } | null>(null);
  const [resetConfirmTab, setResetConfirmTab] = useState<SettingsTab | null>(null);

  const handleConfirmTabReset = () => {
    const tab = resetConfirmTab;
    if (!tab) return;
    setResetConfirmTab(null);
    // A typed title still waiting to save must not land after the reset.
    cancelTitleSave();
    if (tab === 'general') {
      setFormState((current) => ({ ...current, title: defaultSettings.title, appIcon: defaultSettings.appIcon }));
      onSave({ title: defaultSettings.title, appIcon: defaultSettings.appIcon });
      setResetRequest({ tab, nonce: Date.now() });
    } else if (tab === 'editor') {
      setFormState((current) => ({ ...current, editorMode: defaultSettings.editor.mode }));
      onSave({ title: titleForSave, editor: { mode: defaultSettings.editor.mode } });
      setNewTabOpens('empty');
    } else if (tab === 'shortcuts') {
      const navigation = { characterShortcutsEnabled: true, keyHintsVisible: true };
      setFormState((current) => ({ ...current, shortcuts: defaultSettings.shortcuts, ...navigation }));
      onSave({ title: titleForSave, shortcuts: defaultSettings.shortcuts, keyboardNavigation: navigation });
      leaderSpacePreference.set(true);
      holdHintsPreference.set(true);
    } else if (tab === 'appearance') {
      appearanceActions.reset();
      setTreeGuides(true);
      setStatusLineVisible(true);
    } else if (tab === 'vault') {
      void onForgetLocalVault();
    } else if (tab === 'hackmd') {
      invalidateTokenValidation();
      setFormState((current) => ({
        ...current,
        token: '',
        tokenTest: { status: 'idle', message: '' },
        addingAccount: false,
      }));
      onDisconnectHackmd();
    } else if (tab === 'ai' || tab === 'dictation') {
      setResetRequest({ tab, nonce: Date.now() });
    } else if (tab === 'advanced') {
      // Reset All lives in the Advanced page itself; the header only covers its switch.
      setSplitStatusLine(false);
    }
  };

  useEffect(() => {
    const target = focusRequest?.target;
    if (!target || !open) return;
    for (let parent = target.parentElement; parent && parent !== dialogRef.current; parent = parent.parentElement) {
      if (!parent.matches('[hidden], [data-closed]') || !parent.id) continue;
      // Base UI omits aria-controls while closed; the trigger is a direct sibling.
      const trigger = parent.parentElement?.querySelector<HTMLButtonElement>(':scope > button[aria-expanded="false"]');
      trigger?.click();
    }
    const frame = requestAnimationFrame(() => {
      setFocusRequest(null);
      if (!target.isConnected) return;
      target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      target.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, open]);
  const navigateToSetting = (result: SettingsSearchResult) => {
    setActiveTab(result.tab);
    const target = result.target ?? dialogRef.current?.querySelector<HTMLElement>(`[data-settings-tab="${result.tab}"]`);
    if (target) setFocusRequest({ target });
  };

  const normalizedToken = token.trim();
  const isTestingToken = tokenTest.status === 'testing';

  const invalidateTokenValidation = () => {
    tokenValidationRequestRef.current += 1;
  };

  // A pasted token saves only after it validates, so the dialog tests it first.
  const validateAndSaveToken = () => {
    if (isSaving || isTestingToken) {
      return;
    }

    if (!normalizedToken) {
      return;
    }

    const requestId = tokenValidationRequestRef.current + 1;
    tokenValidationRequestRef.current = requestId;
    setFormState((current) => ({
      ...current,
      tokenTest: { status: 'testing', message: 'Testing token…' },
    }));

    void onValidateToken(normalizedToken)
      .then((user) => {
        if (requestId !== tokenValidationRequestRef.current) {
          return;
        }

        setFormState((current) => ({
          ...current,
          tokenTest: {
            status: 'success',
            message: `Token works for ${user.name} @${user.username}.`,
          },
          addingAccount: false,
        }));
        onSave({ title: titleForSave, hackmdApiToken: normalizedToken, hackmdAccountLabel: `@${user.username}`, ...(addingAccount ? { hackmdAddAccount: true } : {}) });
      })
      .catch((error: unknown) => {
        if (requestId !== tokenValidationRequestRef.current) {
          return;
        }

        setFormState((current) => ({
          ...current,
          tokenTest: {
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to validate token.',
          },
        }));
      });
  };

  const handleResetAllSettings = () => {
    invalidateTokenValidation();
    setFormState({
      title: defaultSettings.title,
      editorMode: defaultSettings.editor.mode,
      appIcon: defaultSettings.appIcon,
      token: '',
      tokenVisible: false,
      addingAccount: false,
      tokenTest: { status: 'idle', message: '' },
      shortcuts: defaultSettings.shortcuts,
      characterShortcutsEnabled: true,
      keyHintsVisible: true,
    });
    setAppearance(defaultSettings.appearance);
    onSave({
      title: defaultSettings.title,
      hackmdApiToken: '',
      appearance: defaultSettings.appearance,
      editor: defaultSettings.editor,
      shortcuts: defaultSettings.shortcuts,
      keyboardNavigation: defaultSettings.keyboardNavigation,
      appIcon: defaultSettings.appIcon,
    });
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      invalidateTokenValidation();
      appearanceController.actions.cancel();
      // Closing saves a title still waiting for its debounce instead of dropping it.
      flushTitleSave();
      setResetConfirmTab(null);
      setFormState((current) => ({
        ...current,
        // An empty title never saves; closing puts the saved one back.
        title: current.title.trim() ? current.title : savedTitle,
        shortcuts: settings?.shortcuts ?? defaultSettings.shortcuts,
        characterShortcutsEnabled: settings?.keyboardNavigation?.characterShortcutsEnabled ?? true,
        keyHintsVisible: settings?.keyboardNavigation?.keyHintsVisible ?? true,
      }));
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        ref={dialogRef}
        size="wide"
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0"
        data-keyboard-navigation-scope="settings"
        data-navigation-page={activeTab}
      >
        {/* Named for screen readers only: the page heading beside the close button says where you are. */}
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">HackDesk preferences.</DialogDescription>
        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as SettingsTab)}
          // The header and footer show their lines only while the page scrolls under them.
          className="scroll-edges flex min-h-0 flex-1 flex-col"
        >
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              // Enter commits the text field on this page: the title, or a pasted token.
              event.preventDefault();
              if (isSaving || isTestingToken) {
                return;
              }
              if (activeTab === 'hackmd') {
                validateAndSaveToken();
              } else if (activeTab === 'general' && title.trim()) {
                cancelTitleSave();
                onSave({ title: title.trim() });
              }
            }}
          >
            <div className="flex min-h-0 flex-1">
              <SettingsTabs dialogRef={dialogRef} onNavigate={navigateToSetting} />
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <header className="scroll-edge-top relative flex shrink-0 items-center justify-between gap-3 py-3 pl-8 pr-4">
                  <h2 className="truncate text-lg font-semibold leading-7 text-text-emphasize">{activeTabHeading}</h2>
                  <div className="flex shrink-0 items-center gap-1">
                    {isSaving ? (
                      <span role="status" className="flex items-center gap-1.5 text-xs text-text-subtle">
                        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                        Saving…
                      </span>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setResetConfirmTab(activeTab)}
                      aria-label={`Reset ${activeTabHeading} settings to defaults`}
                    >
                      <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                      Reset
                    </Button>
                    <DialogClose className="shrink-0" />
                  </div>
                </header>
                <TabsContent data-settings-tab="general" value="general" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <SettingsPage>
                    <GeneralSettingsPanel
                      title={title}
                      titleInvalid={!title.trim()}
                      onTitleChange={handleTitleChange}
                      onTitleBlur={handleTitleBlur}
                      appIcon={appIcon}
                      platform={platform}
                      onAppIconChange={handleAppIconChange}
                      onRevertTitle={() => {
                        cancelTitleSave();
                        setFormState((current) => ({ ...current, title: defaultSettings.title }));
                        onSave({ title: defaultSettings.title });
                      }}
                    />
                    <OfflineSettingsSection
                      active={open && activeTab === 'general'}
                      resetSignal={resetRequest?.tab === 'general' ? resetRequest.nonce : 0}
                    />
                  </SettingsPage>
                </TabsContent>

                <TabsContent data-settings-tab="editor" value="editor" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <EditorSettingsPanel
                    editorMode={editorMode}
                    onEditorModeChange={handleEditorModeChange}
                    onRevertMode={() => handleEditorModeChange(defaultSettings.editor.mode)}
                  />
                </TabsContent>

                <TabsContent data-settings-tab="appearance" value="appearance" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <AppearanceSettingsPanel
                    controller={appearanceController}
                    onRevertTheme={appearanceActions.reset}
                    onRevertSidebar={() => setTreeGuides(true)}
                    onRevertWindow={() => setStatusLineVisible(true)}
                  />
                </TabsContent>

                <TabsContent data-settings-tab="shortcuts" value="shortcuts" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <ShortcutsSettingsPanel
                    platform={platform}
                    characterShortcutsEnabled={characterShortcutsEnabled}
                    onCharacterShortcutsChange={(enabled) => handleKeyboardNavigationChange({
                      characterShortcutsEnabled: enabled,
                      keyHintsVisible,
                    })}
                    keyHintsVisible={keyHintsVisible}
                    onKeyHintsVisibleChange={(visible) => handleKeyboardNavigationChange({
                      characterShortcutsEnabled,
                      keyHintsVisible: visible,
                    })}
                    shortcuts={shortcuts}
                    onShortcutsChange={handleShortcutsChange}
                  />
                </TabsContent>

                <TabsContent data-settings-tab="vault" value="vault" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <VaultSettingsPanel
                    error={localVaultError}
                    settings={settings}
                    snapshot={localVaultSnapshot}
                    onAddVault={onChooseLocalVault}
                    onForgetLocalVault={onForgetLocalVault}
                    onSwitchLocalVault={onSwitchLocalVault}
                    workspaceActions={localWorkspaceActions}
                    onOpenLocalVault={onOpenLocalVault}
                    onRefreshLocalVault={onRefreshLocalVault}
                  />
                </TabsContent>

                <TabsContent data-settings-tab="hackmd" value="hackmd" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <HackmdSettingsPanel
                    accounts={settings?.hackmdAccounts?.accounts ?? []}
                    activeAccountId={settings?.hackmdAccounts?.activeAccountId ?? null}
                    hasHackmdApiToken={Boolean(settings?.hasHackmdApiToken)}
                    tokenStorageError={settings?.hackmdTokenStorageError}
                    isBusy={isSaving}
                    token={token}
                    tokenVisible={tokenVisible}
                    addingAccount={addingAccount}
                    onAddingAccountChange={(adding) => setFormState((current) => ({ ...current, addingAccount: adding }))}
                    tokenTest={tokenTest}
                    onSwitchAccount={(id) => onSave({ title: titleForSave, hackmdActiveAccountId: id })}
                    onRemoveAccount={(id) => onSave({ title: titleForSave, hackmdRemoveAccountId: id })}
                    onDisconnect={() => {
                      invalidateTokenValidation();
                      onDisconnectHackmd();
                    }}
                    onTokenChange={(nextToken) => {
                      invalidateTokenValidation();
                      setFormState((current) => ({
                        ...current,
                        token: nextToken,
                        tokenTest: { status: 'idle', message: '' },
                      }));
                    }}
                    onTokenVisibleChange={(nextVisible) => setFormState((current) => ({ ...current, tokenVisible: nextVisible }))}
                  />
                </TabsContent>

                <TabsContent data-settings-tab="ai" value="ai" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <AiSettingsPanel
                    active={open && activeTab === 'ai'}
                    resetSignal={resetRequest?.tab === 'ai' ? resetRequest.nonce : 0}
                  />
                </TabsContent>

                <TabsContent data-settings-tab="dictation" value="dictation" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <DictationSettingsPanel
                    active={open && activeTab === 'dictation'}
                    resetSignal={resetRequest?.tab === 'dictation' ? resetRequest.nonce : 0}
                  />
                </TabsContent>

                <TabsContent data-settings-tab="advanced" value="advanced" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <AdvancedSettingsPanel appVersion={appVersion} onResetAllSettings={handleResetAllSettings} />
                </TabsContent>
                <AlertDialog open={resetConfirmTab !== null} onOpenChange={(nextOpen) => { if (!nextOpen) setResetConfirmTab(null); }}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{resetConfirmTab ? TAB_RESET_COPY[resetConfirmTab].title : ''}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {resetConfirmTab ? TAB_RESET_COPY[resetConfirmTab].description : ''}
                        {' '}Your notes and vault files stay unchanged.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction variant="destructive-solid" onClick={handleConfirmTabReset}>
                        {resetConfirmTab ? TAB_RESET_COPY[resetConfirmTab].confirm : 'Reset'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
