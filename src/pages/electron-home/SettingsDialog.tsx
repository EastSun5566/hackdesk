import { useRef, useState } from 'react';
import { toast } from '@/components/ui/toast';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useTheme } from '@/components/theme-provider';
import { useThemeAppearanceDraft } from '@/components/useThemeAppearanceDraft';
import type { ElectronSafeSettings, UserSummary } from '@/lib/electron-api';
import type { LocalVaultSnapshot } from '@/lib/local-vault';
import { defaultSettings } from '@/lib/settings';

import { AdvancedSettingsPanel } from './AdvancedSettingsPanel';
import { AppearanceSettingsPanel } from './AppearanceSettingsPanel';
import { EditorSettingsPanel } from './EditorSettingsPanel';
import { GeneralSettingsPanel } from './GeneralSettingsPanel';
import { HackmdSettingsPanel, type TokenTestState } from './HackmdSettingsPanel';
import {
  SETTINGS_PANEL_CLASS,
  type SettingsTab,
} from './SettingsDialogConfig';
import { SettingsDialogFooter } from './SettingsDialogFooter';
import { SettingsTabs } from './SettingsTabs';
import { getShortcutsDraftStatus, ShortcutsSettingsPanel } from './ShortcutsSettingsPanel';
import type { SettingsFormInput } from './types';
import { VaultSettingsPanel } from './VaultSettingsPanel';

type SettingsDialogProps = {
  open: boolean;
  appVersion?: string;
  settings?: ElectronSafeSettings;
  platform?: string;
  localVaultError?: string | null;
  localVaultSnapshot?: LocalVaultSnapshot | null;
  isSaving: boolean;
  onDisconnectHackmd: () => void;
  onOpenChange: (open: boolean) => void;
  onChooseLocalVault: () => Promise<void>;
  onForgetLocalVault: () => Promise<void>;
  onOpenLocalVault: () => Promise<void>;
  onRefreshLocalVault: () => Promise<void>;
  onSave: (input: SettingsFormInput) => void;
  onValidateToken: (token: string) => Promise<UserSummary>;
};

export function SettingsDialog(props: SettingsDialogProps) {
  return <SettingsDialogContent key={`${props.settings?.title ?? 'HackDesk'}:${props.settings?.editor?.mode ?? 'standard'}`} {...props} />;
}

function SettingsDialogContent({
  open,
  appVersion,
  settings,
  platform = navigator.platform,
  localVaultError,
  localVaultSnapshot,
  isSaving,
  onDisconnectHackmd,
  onChooseLocalVault,
  onForgetLocalVault,
  onOpenLocalVault,
  onRefreshLocalVault,
  onOpenChange,
  onSave,
  onValidateToken,
}: SettingsDialogProps) {
  const { setAppearance } = useTheme();
  const tokenValidationRequestRef = useRef(0);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [formState, setFormState] = useState(() => ({
    title: settings?.title ?? 'HackDesk',
    editorMode: settings?.editor?.mode ?? defaultSettings.editor.mode,
    token: '',
    tokenVisible: false,
    tokenTest: {
      status: 'idle',
      message: '',
    } as TokenTestState,
    shortcuts: settings?.shortcuts ?? defaultSettings.shortcuts,
  }));
  const appearanceController = useThemeAppearanceDraft({ showTypography: true });
  const { editorMode, shortcuts, title, token, tokenTest, tokenVisible } = formState;

  const normalizedToken = token.trim();
  const isTestingToken = tokenTest.status === 'testing';
  const shortcutStatus = getShortcutsDraftStatus(settings?.shortcuts, shortcuts);
  const canSaveSettings = Boolean(title.trim())
    && (activeTab !== 'hackmd' || Boolean(normalizedToken))
    && (activeTab !== 'shortcuts' || (shortcutStatus.hasDraftChanges && !shortcutStatus.error));

  const invalidateTokenValidation = () => {
    tokenValidationRequestRef.current += 1;
  };

  const handleSaveSettings = () => {
    if (isSaving || isTestingToken) {
      return;
    }

    if (!title.trim()) {
      return;
    }

    if (activeTab === 'editor') {
      onSave({
        title: title.trim(),
        editor: { mode: editorMode },
      });
      return;
    }

    if (activeTab === 'shortcuts') {
      if (!shortcutStatus.hasDraftChanges || shortcutStatus.error) {
        return;
      }

      onSave({
        title: title.trim(),
        shortcuts,
      });
      return;
    }

    if (activeTab === 'hackmd') {
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
          }));
          onSave({ title: title.trim(), hackmdApiToken: normalizedToken });
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
      return;
    }

    onSave({
      title: title.trim(),
    });
  };

  const handleResetAllSettings = () => {
    invalidateTokenValidation();
    setFormState({
      title: defaultSettings.title,
      editorMode: defaultSettings.editor.mode,
      token: '',
      tokenVisible: false,
      tokenTest: { status: 'idle', message: '' },
      shortcuts: defaultSettings.shortcuts,
    });
    setAppearance(defaultSettings.appearance);
    onSave({
      title: defaultSettings.title,
      hackmdApiToken: '',
      appearance: defaultSettings.appearance,
      editor: defaultSettings.editor,
      shortcuts: defaultSettings.shortcuts,
    });
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      invalidateTokenValidation();
      appearanceController.actions.cancel();
      setFormState((current) => ({
        ...current,
        shortcuts: settings?.shortcuts ?? defaultSettings.shortcuts,
      }));
    }
    onOpenChange(nextOpen);
  };

  const handleApplyTheme = () => {
    if (!appearanceController.actions.apply()) {
      return;
    }

    toast.success('Theme applied');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="flex max-h-[min(760px,calc(100dvh-4rem))] w-[min(820px,calc(100dvw-3rem))] max-w-[820px] flex-col overflow-hidden p-0">
        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as SettingsTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader className="border-b border-border-default px-5 py-4">
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription className="sr-only">
              Configure the local Electron app and HackMD API access.
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (activeTab === 'general' || activeTab === 'editor' || activeTab === 'shortcuts' || activeTab === 'hackmd') {
                handleSaveSettings();
              }
            }}
          >
            <div className="flex min-h-0 flex-1">
              <SettingsTabs />
              <div className="flex min-w-0 flex-1 flex-col">
                <TabsContent value="general" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <GeneralSettingsPanel
                    title={title}
                    onTitleChange={(nextTitle) => setFormState((current) => ({ ...current, title: nextTitle }))}
                  />
                </TabsContent>

                <TabsContent value="editor" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <EditorSettingsPanel
                    editorMode={editorMode}
                    onEditorModeChange={(nextEditorMode) => setFormState((current) => ({
                      ...current,
                      editorMode: nextEditorMode,
                    }))}
                  />
                </TabsContent>

                <TabsContent value="appearance" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <AppearanceSettingsPanel controller={appearanceController} />
                </TabsContent>

                <TabsContent value="shortcuts" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <ShortcutsSettingsPanel
                    platform={platform}
                    shortcuts={shortcuts}
                    onShortcutsChange={(nextShortcuts) => setFormState((current) => ({
                      ...current,
                      shortcuts: nextShortcuts,
                    }))}
                  />
                </TabsContent>

                <TabsContent value="vault" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <VaultSettingsPanel
                    error={localVaultError}
                    settings={settings}
                    snapshot={localVaultSnapshot}
                    onChooseLocalVault={onChooseLocalVault}
                    onForgetLocalVault={onForgetLocalVault}
                    onOpenLocalVault={onOpenLocalVault}
                    onRefreshLocalVault={onRefreshLocalVault}
                  />
                </TabsContent>

                <TabsContent value="hackmd" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <HackmdSettingsPanel
                    hasHackmdApiToken={Boolean(settings?.hasHackmdApiToken)}
                    isBusy={isSaving}
                    token={token}
                    tokenVisible={tokenVisible}
                    tokenTest={tokenTest}
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

                <TabsContent value="advanced" keepMounted className={SETTINGS_PANEL_CLASS}>
                  <AdvancedSettingsPanel appVersion={appVersion} onResetAllSettings={handleResetAllSettings} />
                </TabsContent>
              </div>
            </div>

            <SettingsDialogFooter
              activeTab={activeTab}
              appearanceStatus={appearanceController.status}
              canSave={canSaveSettings}
              isSaving={isSaving}
              isTestingToken={isTestingToken}
              onApplyTheme={handleApplyTheme}
              onCancelPreview={appearanceController.actions.cancel}
              onClose={() => handleDialogOpenChange(false)}
            />
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
