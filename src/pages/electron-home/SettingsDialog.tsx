import { forwardRef, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, FolderOpen, Keyboard, Loader2, Monitor, RefreshCw, Save, Settings as SettingsIcon, Shield, Trash2, Zap } from 'lucide-react';
import { toast } from '@/components/ui/toast';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ThemeAppearanceControls,
  type ThemeAppearanceControlsHandle,
  type ThemeAppearanceControlsState,
} from '@/components/ThemeAppearanceControls';
import { useTheme } from '@/components/theme-provider';
import type { ElectronSafeSettings, UserSummary } from '@/lib/electron-api';
import type { LocalVaultSnapshot } from '@/lib/local-vault';
import { getHackDeskAPI } from '@/lib/electron-api';
import { defaultSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { version } from '../../../package.json';

import { SettingsInput, SettingsRow, SettingsSecretInput, SettingsSection } from './SettingsPrimitives';
import { EditorSettingsPanel } from './EditorSettingsPanel';
import type { SettingsFormInput } from './types';
import { FOCUS_RING_CLASS } from './ui';

const SETTINGS_TITLE_ID = 'settings-title';
const SETTINGS_TOKEN_ID = 'settings-hackmd-token';
const SETTINGS_TOKEN_STATUS_ID = 'settings-hackmd-token-status';
const SETTINGS_PANEL_CLASS = 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-default';
const LOCAL_VAULT_SCANNED_AT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

type SettingsTab = 'general' | 'editor' | 'appearance' | 'vault' | 'hackmd' | 'advanced';

const SETTINGS_TABS: {
  id: SettingsTab;
  label: string;
  description: string;
  icon: ReactNode;
}[] = [
  { id: 'general', label: 'General', description: 'Window title and local app defaults.', icon: <SettingsIcon className="h-4 w-4" /> },
  { id: 'editor', label: 'Editor', description: 'Choose standard, Vim, or Helix editing.', icon: <Keyboard className="h-4 w-4" /> },
  { id: 'appearance', label: 'Appearance', description: 'Theme mode, presets, fonts, and color seeds.', icon: <Monitor className="h-4 w-4" /> },
  { id: 'vault', label: 'Vault', description: 'Manage the local Markdown folder.', icon: <FolderOpen className="h-4 w-4" /> },
  { id: 'hackmd', label: 'HackMD', description: 'API token and connection test.', icon: <Shield className="h-4 w-4" /> },
  { id: 'advanced', label: 'Advanced', description: 'Version, updates, and reset actions.', icon: <Zap className="h-4 w-4" /> },
];

type SettingsDialogProps = {
  open: boolean;
  settings?: ElectronSafeSettings;
  localVaultError?: string | null;
  localVaultSnapshot?: LocalVaultSnapshot | null;
  isSaving: boolean;
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
  settings,
  localVaultError,
  localVaultSnapshot,
  isSaving,
  onChooseLocalVault,
  onForgetLocalVault,
  onOpenLocalVault,
  onRefreshLocalVault,
  onOpenChange,
  onSave,
  onValidateToken,
}: SettingsDialogProps) {
  const { setAppearance } = useTheme();
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
  }));
  const appearanceControlsRef = useRef<ThemeAppearanceControlsHandle>(null);
  const [appearanceState, setAppearanceState] = useState<ThemeAppearanceControlsState>({
    canApply: true,
    hasDraftChanges: false,
    hasErrors: false,
  });
  const { editorMode, title, token, tokenTest, tokenVisible } = formState;

  const normalizedToken = token.trim();
  const activeTabDefinition = getSettingsTab(activeTab);

  const handleSaveSettings = () => {
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

    onSave({
      title: title.trim(),
      ...(activeTab === 'hackmd' && normalizedToken ? { hackmdApiToken: normalizedToken } : {}),
    });
  };

  const handleResetAllSettings = () => {
    setFormState({
      title: defaultSettings.title,
      editorMode: defaultSettings.editor.mode,
      token: '',
      tokenVisible: false,
      tokenTest: { status: 'idle', message: '' },
    });
    setAppearance(defaultSettings.appearance);
    onSave({
      title: defaultSettings.title,
      hackmdApiToken: '',
      appearance: defaultSettings.appearance,
      editor: defaultSettings.editor,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(760px,calc(100dvh-4rem))] w-[min(760px,calc(100dvw-2rem))] max-w-3xl flex-col overflow-hidden p-0">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as SettingsTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader className="border-b border-border-default px-5 pb-4 pt-5">
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Configure the local Electron app and HackMD API access.
            </DialogDescription>
            <SettingsTabs />
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (activeTab === 'general' || activeTab === 'editor' || activeTab === 'hackmd') {
                handleSaveSettings();
              }
            }}
          >
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
              <AppearanceSettingsPanel
                ref={appearanceControlsRef}
                onStateChange={setAppearanceState}
                onApplied={() => {
                  toast.success('Theme applied');
                  onOpenChange(false);
                }}
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
                token={token}
                tokenVisible={tokenVisible}
                tokenTest={tokenTest}
                onTokenChange={(nextToken) => setFormState((current) => ({ ...current, token: nextToken }))}
                onTokenVisibleChange={(nextVisible) => setFormState((current) => ({ ...current, tokenVisible: nextVisible }))}
                onTokenTestChange={(nextTokenTest) => setFormState((current) => ({ ...current, tokenTest: nextTokenTest }))}
                onValidateToken={onValidateToken}
              />
            </TabsContent>

            <TabsContent value="advanced" keepMounted className={SETTINGS_PANEL_CLASS}>
              <AdvancedSettingsPanel onResetAllSettings={handleResetAllSettings} />
            </TabsContent>

            <SettingsDialogFooter
              activeTab={activeTab}
              activeTabDescription={activeTabDefinition.description}
              appearanceState={appearanceState}
              canSaveTitle={Boolean(title.trim())}
              isSaving={isSaving}
              onApplyTheme={() => appearanceControlsRef.current?.apply()}
              onCancelPreview={() => appearanceControlsRef.current?.cancel()}
              onClose={() => onOpenChange(false)}
            />
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

type TokenTestState = {
  status: 'idle' | 'testing' | 'success' | 'error';
  message: string;
};

function getSettingsTab(tabId: SettingsTab) {
  return SETTINGS_TABS.find((tab) => tab.id === tabId) ?? SETTINGS_TABS[0];
}

function SettingsTabs() {
  return (
    <TabsList
      activateOnFocus
      aria-label="Settings sections"
      className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-background-muted p-1 sm:grid-cols-6"
    >
      {SETTINGS_TABS.map((tab) => (
        <TabsTrigger
          key={tab.id}
          value={tab.id}
          className={cn(
            'inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors hover:bg-element-bg-hover',
            FOCUS_RING_CLASS,
            'text-text-subtle data-[selected]:bg-background-default data-[selected]:text-text-default data-[selected]:shadow-sm',
          )}
        >
          <span aria-hidden="true">{tab.icon}</span>
          <span className="truncate">{tab.label}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

function GeneralSettingsPanel({
  title,
  onTitleChange,
}: {
  title: string;
  onTitleChange: (title: string) => void;
}) {
  return (
    <SettingsSection title="General" description="Local app identity and window preferences.">
      <SettingsRow label="Window Title" htmlFor={SETTINGS_TITLE_ID}>
        <SettingsInput
          id={SETTINGS_TITLE_ID}
          name="window-title"
          autoFocus
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          autoComplete="off"
          spellCheck
        />
      </SettingsRow>
    </SettingsSection>
  );
}

const AppearanceSettingsPanel = forwardRef<ThemeAppearanceControlsHandle, {
  onApplied: () => void;
  onStateChange: (state: ThemeAppearanceControlsState) => void;
}>(function AppearanceSettingsPanel({ onApplied, onStateChange }, ref) {
  return (
    <SettingsSection title="Appearance" description="Preview and apply a local HackDesk theme.">
      <ThemeAppearanceControls
        ref={ref}
        density="compact"
        actions="none"
        customSeedsDefaultOpen={false}
        showTypography
        onStateChange={onStateChange}
        onApplied={onApplied}
      />
    </SettingsSection>
  );
});

function formatScannedAt(snapshot?: LocalVaultSnapshot | null) {
  if (!snapshot?.scannedAtMillis) {
    return 'Not scanned yet';
  }

  return LOCAL_VAULT_SCANNED_AT_FORMATTER.format(new Date(snapshot.scannedAtMillis));
}

function VaultSettingsPanel({
  error,
  settings,
  snapshot,
  onChooseLocalVault,
  onForgetLocalVault,
  onOpenLocalVault,
  onRefreshLocalVault,
}: {
  error?: string | null;
  settings?: ElectronSafeSettings;
  snapshot?: LocalVaultSnapshot | null;
  onChooseLocalVault: () => Promise<void>;
  onForgetLocalVault: () => Promise<void>;
  onOpenLocalVault: () => Promise<void>;
  onRefreshLocalVault: () => Promise<void>;
}) {
  const [busyAction, setBusyAction] = useState<'choose' | 'forget' | 'open' | 'refresh' | null>(null);
  const vaultPath = settings?.localVault.path ?? snapshot?.rootPath ?? null;
  const isConfigured = Boolean(vaultPath);

  const runVaultAction = (action: NonNullable<typeof busyAction>, callback: () => Promise<void>) => {
    setBusyAction(action);
    callback()
      .catch((actionError) => {
        toast.error(actionError instanceof Error ? actionError.message : 'Local vault action failed.');
      })
      .finally(() => setBusyAction(null));
  };

  return (
    <div className="space-y-4">
      <SettingsSection
        title="Local Vault"
        description="HackDesk stores local notes as Markdown files in this folder."
      >
        <div className="rounded-md border border-border-default bg-background-default p-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-text-subtle">Folder</p>
            <p className="break-all font-mono text-sm text-text-default">
              {vaultPath ?? 'No local vault configured'}
            </p>
          </div>
          {error ? (
            <div className="mt-3 flex gap-2 rounded-md border border-destructive-default/30 bg-destructive-soft px-3 py-2 text-sm text-destructive-default">
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <VaultStat label="Notes" value={snapshot ? String(snapshot.notes.length) : '—'} />
          <VaultStat label="Folders" value={snapshot ? String(snapshot.folders.length) : '—'} />
          <VaultStat label="Last scanned" value={formatScannedAt(snapshot)} />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Actions"
        description="These actions change HackDesk settings only. They do not delete Markdown files."
      >
        <div className="flex flex-wrap gap-2">
          <SettingsActionButton
            busy={busyAction === 'open'}
            disabled={!isConfigured}
            icon={<FolderOpen className="h-4 w-4" />}
            onClick={() => runVaultAction('open', onOpenLocalVault)}
          >
            Open in Finder
          </SettingsActionButton>
          <SettingsActionButton
            busy={busyAction === 'refresh'}
            disabled={!isConfigured}
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => runVaultAction('refresh', onRefreshLocalVault)}
          >
            Refresh Vault
          </SettingsActionButton>
          <SettingsActionButton
            busy={busyAction === 'choose'}
            icon={<FolderOpen className="h-4 w-4" />}
            onClick={() => runVaultAction('choose', onChooseLocalVault)}
          >
            Change Vault
          </SettingsActionButton>
          <SettingsActionButton
            busy={busyAction === 'forget'}
            destructive
            disabled={!isConfigured}
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => runVaultAction('forget', onForgetLocalVault)}
          >
            Forget Vault
          </SettingsActionButton>
        </div>
      </SettingsSection>
    </div>
  );
}

function VaultStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border-default bg-background-default px-3 py-2">
      <p className="text-xs text-text-subtle">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-default">{value}</p>
    </div>
  );
}

function SettingsActionButton({
  busy,
  children,
  destructive = false,
  disabled,
  icon,
  onClick,
}: {
  busy: boolean;
  children: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50',
        destructive
          ? 'border-destructive-default text-destructive-default hover:bg-destructive-soft'
          : 'border-border-default text-text-default hover:bg-element-bg-hover',
        FOCUS_RING_CLASS,
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

function HackmdSettingsPanel({
  hasHackmdApiToken,
  token,
  tokenVisible,
  tokenTest,
  onTokenChange,
  onTokenVisibleChange,
  onTokenTestChange,
  onValidateToken,
}: {
  hasHackmdApiToken: boolean;
  token: string;
  tokenVisible: boolean;
  tokenTest: TokenTestState;
  onTokenChange: (token: string) => void;
  onTokenVisibleChange: (visible: boolean) => void;
  onTokenTestChange: (state: TokenTestState) => void;
  onValidateToken: (token: string) => Promise<UserSummary>;
}) {
  const normalizedToken = token.trim();

  const handleTestToken = () => {
    onTokenTestChange({ status: 'testing', message: 'Testing token…' });
    onValidateToken(normalizedToken)
      .then((user) => {
        onTokenTestChange({
          status: 'success',
          message: `Token works for ${user.name} @${user.username}.`,
        });
      })
      .catch((error) => {
        onTokenTestChange({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to validate token.',
        });
      });
  };

  return (
    <SettingsSection
      title="HackMD"
      description={hasHackmdApiToken ? 'A token is configured. Paste a new token only when rotating it.' : 'Paste a HackMD API token to sync notes and folders.'}
    >
      <SettingsRow label="API Token" htmlFor={SETTINGS_TOKEN_ID}>
        <SettingsSecretInput
          id={SETTINGS_TOKEN_ID}
          name="hackmd-api-token"
          visible={tokenVisible}
          onVisibleChange={onTokenVisibleChange}
          value={token}
          onChange={(event) => {
            onTokenChange(event.target.value);
            onTokenTestChange({ status: 'idle', message: '' });
          }}
          placeholder={hasHackmdApiToken ? 'Token configured' : 'Paste token'}
          autoComplete="off"
          aria-describedby={SETTINGS_TOKEN_STATUS_ID}
          aria-invalid={tokenTest.status === 'error'}
        />
      </SettingsRow>
      <div className="flex items-center justify-between gap-3">
        <p
          id={SETTINGS_TOKEN_STATUS_ID}
          aria-live="polite"
          className={cn(
            'min-h-5 text-xs',
            tokenTest.status === 'error' ? 'text-destructive-default' : 'text-text-subtle',
          )}
        >
          {tokenTest.message}
        </p>
        <button
          type="button"
          disabled={!normalizedToken || tokenTest.status === 'testing'}
          onClick={handleTestToken}
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border-default px-3 text-sm text-text-default transition-colors hover:bg-element-bg-hover disabled:pointer-events-none disabled:opacity-50',
            FOCUS_RING_CLASS,
          )}
        >
          {tokenTest.status === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Test Token
        </button>
      </div>
    </SettingsSection>
  );
}

function AdvancedSettingsPanel({
  onResetAllSettings,
}: {
  onResetAllSettings: () => void;
}) {
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  const handleCheckForUpdates = () => {
    const api = getHackDeskAPI();
    if (!api?.app.checkForUpdates) {
      toast.error('Update checks are available only in the packaged Electron app.');
      return;
    }

    setIsCheckingUpdates(true);
    api.app.checkForUpdates()
      .then((result) => {
        switch (result.status) {
        case 'upToDate':
          toast.info('You’re already on the latest version of HackDesk.');
          break;
        case 'declined':
          toast.info(`Skipped installing HackDesk v${result.version}.`);
          break;
        case 'installed':
          toast.success(
            result.restart_required
              ? `HackDesk v${result.version} is ready. Quit and reopen the app to finish applying the update.`
              : `HackDesk v${result.version} installed successfully.`,
          );
          break;
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to check for updates.');
      })
      .finally(() => setIsCheckingUpdates(false));
  };

  return (
    <div className="space-y-4">
      <SettingsSection title="Version" description="Check for Electron app updates.">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-default bg-background-default px-3 py-2">
          <span className="text-sm text-text-subtle">HackDesk v{version}</span>
          <button
            type="button"
            onClick={handleCheckForUpdates}
            disabled={isCheckingUpdates}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-md border border-border-default px-3 text-sm text-text-default transition-colors hover:bg-element-bg-hover disabled:pointer-events-none disabled:opacity-50',
              FOCUS_RING_CLASS,
            )}
          >
            {isCheckingUpdates ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isCheckingUpdates ? 'Checking…' : 'Check for Updates'}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection title="Reset" description="Restore local app preferences and clear the configured token.">
        <button
          type="button"
          onClick={onResetAllSettings}
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-md border border-destructive-default px-3 text-sm font-medium text-destructive-default transition-colors hover:bg-destructive-soft',
            FOCUS_RING_CLASS,
          )}
        >
          <AlertCircle className="h-4 w-4" />
          Reset All Settings
        </button>
      </SettingsSection>
    </div>
  );
}

function SettingsDialogFooter({
  activeTab,
  activeTabDescription,
  appearanceState,
  canSaveTitle,
  isSaving,
  onApplyTheme,
  onCancelPreview,
  onClose,
}: {
  activeTab: SettingsTab;
  activeTabDescription: string;
  appearanceState: ThemeAppearanceControlsState;
  canSaveTitle: boolean;
  isSaving: boolean;
  onApplyTheme: () => void;
  onCancelPreview: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border-default px-5 py-4">
      <p className="min-w-0 truncate text-xs text-text-subtle">{activeTabDescription}</p>
      <div className="flex shrink-0 items-center gap-2">
        {activeTab === 'appearance' && appearanceState.hasDraftChanges ? (
          <button
            type="button"
            onClick={onCancelPreview}
            className={cn(
              'inline-flex h-9 items-center rounded-md border border-border-default bg-background-default px-3 text-sm text-text-default transition-colors hover:bg-element-bg-hover',
              FOCUS_RING_CLASS,
            )}
          >
            Cancel Preview
          </button>
        ) : null}
        {activeTab === 'appearance' ? (
          <button
            type="button"
            onClick={onApplyTheme}
            disabled={!appearanceState.canApply}
            className={cn(
              'inline-flex h-9 items-center justify-center rounded-md bg-primary-default px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50',
              FOCUS_RING_CLASS,
            )}
          >
            Apply Theme
          </button>
        ) : null}
        {(activeTab === 'general' || activeTab === 'editor' || activeTab === 'hackmd') ? (
          <button
            type="submit"
            disabled={isSaving || !canSaveTitle}
            className={cn(
              'inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary-default px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50',
              FOCUS_RING_CLASS,
            )}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        ) : null}
        {(activeTab === 'advanced' || activeTab === 'vault') ? (
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'inline-flex h-9 items-center rounded-md border border-border-default bg-background-default px-3 text-sm text-text-default transition-colors hover:bg-element-bg-hover',
              FOCUS_RING_CLASS,
            )}
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}
