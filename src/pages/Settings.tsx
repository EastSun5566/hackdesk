import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { toast } from 'sonner';
import {
  AlertCircle,
  Settings as SettingsIcon,
  Monitor,
  Keyboard,
  Zap,
  Shield,
  Eye,
  EyeOff,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { useValidateHackmdToken } from '@/lib/hackmd';
import { useCheckForUpdates } from '@/lib/updater';
import { useSettings, useUpdateSettings } from '@/lib/query';
import {
  defaultSettings,
  settingsSchema,
  type AppSettings,
} from '@/lib/settings';
import {
  getActionShortcutKeys,
  getElectronActionLabel,
} from '@/lib/electron-actions';
import type { ElectronActionId } from '@/lib/electron-api';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { ThemeAppearanceControls } from '@/components/ThemeAppearanceControls';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { version } from '../../package.json';

type SettingsTab = 'general' | 'appearance' | 'hackmd' | 'shortcuts' | 'advanced';

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <SettingsIcon className="h-4 w-4" /> },
  { id: 'appearance', label: 'Appearance', icon: <Monitor className="h-4 w-4" /> },
  { id: 'hackmd', label: 'HackMD API', icon: <Shield className="h-4 w-4" /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard className="h-4 w-4" /> },
  { id: 'advanced', label: 'Advanced', icon: <Zap className="h-4 w-4" /> },
];

type ShortcutDefinition =
  | { type: 'action'; actionId: ElectronActionId }
  | { type: 'custom'; id: string; action: string; keys: string[] };

const shortcutDefinitions: ShortcutDefinition[] = [
  { type: 'action', actionId: 'open-command-palette' },
  { type: 'action', actionId: 'open-settings' },
  { type: 'action', actionId: 'new-tab' },
  { type: 'action', actionId: 'new-note' },
  { type: 'action', actionId: 'new-folder' },
  { type: 'action', actionId: 'find-in-note' },
  { type: 'action', actionId: 'search-notes' },
  { type: 'action', actionId: 'split-pane-right' },
  { type: 'custom', id: 'tab-number', action: 'Go to Tab 1-8', keys: ['⌘', '1-8'] },
  { type: 'custom', id: 'last-tab', action: 'Go to Last Tab', keys: ['⌘', '9'] },
  { type: 'action', actionId: 'focus-previous-tab' },
  { type: 'action', actionId: 'focus-next-tab' },
  { type: 'action', actionId: 'navigate-back' },
  { type: 'action', actionId: 'navigate-forward' },
  { type: 'action', actionId: 'toggle-workspace-rail' },
  { type: 'action', actionId: 'toggle-navigator' },
  { type: 'action', actionId: 'toggle-inspector' },
  { type: 'action', actionId: 'refresh' },
  { type: 'action', actionId: 'close-tab' },
  { type: 'action', actionId: 'reopen-last-closed-tab' },
  { type: 'action', actionId: 'export-debug-logs' },
  { type: 'custom', id: 'close-settings', action: 'Close Settings', keys: ['Esc'] },
];

const shortcuts = shortcutDefinitions.map((shortcut) => (
  shortcut.type === 'action'
    ? {
        id: shortcut.actionId,
        action: getElectronActionLabel(shortcut.actionId),
        keys: getActionShortcutKeys(shortcut.actionId),
      }
    : shortcut
));

const inputClassName = 'flex h-10 w-full rounded-md border border-border-default bg-background-default px-3 py-2 text-sm text-text-default ring-offset-background-default file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 disabled:opacity-50';
const primaryButtonClassName = 'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary-default px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default disabled:pointer-events-none disabled:opacity-50';
const secondaryButtonClassName = 'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border-default bg-background-default px-4 py-2 text-sm font-medium text-text-default transition-colors hover:bg-element-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default disabled:pointer-events-none disabled:opacity-50';
const compactSecondaryButtonClassName = 'inline-flex h-10 items-center justify-center rounded-md border border-border-default bg-background-default px-3 text-sm text-text-default transition-colors hover:bg-element-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default disabled:pointer-events-none disabled:opacity-50';
const dangerButtonClassName = 'inline-flex h-9 items-center justify-center rounded-md border border-destructive-default px-4 py-2 text-sm font-medium text-destructive-default transition-colors hover:bg-destructive-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default';

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [showApiToken, setShowApiToken] = useState(false);
  const { data: settingsData } = useSettings();
  const { mutate: updateSettings, isPending } = useUpdateSettings();
  const {
    mutate: checkForUpdates,
    isPending: isCheckingForUpdates,
  } = useCheckForUpdates();
  const {
    mutate: validateHackmdToken,
    data: validatedUser,
    error: validationError,
    isPending: isValidatingToken,
    isSuccess: isTokenValid,
    reset: resetTokenValidation,
  } = useValidateHackmdToken();
  const { setAppearance } = useTheme();

  const currentSettings = settingsData ?? defaultSettings;

  const form = useForm<z.input<typeof settingsSchema>, unknown, AppSettings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: currentSettings,
  });

  useEffect(() => {
    form.reset(currentSettings);
  }, [currentSettings, form]);

  const hackmdApiToken = form.watch('hackmdApiToken');
  const currentHackmdApiToken = hackmdApiToken ?? '';

  useEffect(() => {
    resetTokenValidation();
  }, [currentHackmdApiToken, resetTokenValidation]);

  const onSubmit = (data: AppSettings) => {
    updateSettings(data, {
      onSuccess: () => toast.success('Settings saved successfully'),
      onError: (error) => toast.error(`Failed to save: ${error.message}`),
    });
  };

  const handleReset = () => {
    form.reset(currentSettings);
    resetTokenValidation();
    toast.info('Settings reset to current values');
  };

  const handleResetToDefaults = () => {
    form.reset(defaultSettings);
    setAppearance(defaultSettings.appearance);
    resetTokenValidation();
    updateSettings(defaultSettings, {
      onSuccess: () => toast.success('All settings reset to defaults'),
      onError: (error) => toast.error(`Failed to reset: ${error.message}`),
    });
  };

  const handleTestConnection = () => {
    const token = currentHackmdApiToken.trim();

    if (!token) {
      toast.error('Enter a HackMD API token first');
      return;
    }

    validateHackmdToken(token, {
      onSuccess: (user) => {
        toast.success(`Connected to HackMD as ${user.name}`);
      },
      onError: (error) => {
        toast.error(`HackMD connection failed: ${error.message}`);
      },
    });
  };

  const handleCheckForUpdates = () => {
    checkForUpdates(undefined, {
      onSuccess: (result) => {
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
      },
      onError: (error) => {
        toast.error(`Failed to check for updates: ${error.message}`);
      },
    });
  };

  const closeWindow = useCallback(() => {
    getCurrentWebviewWindow().close();
  }, []);

  useEscapeKey(closeWindow);

  const showFormActions = activeTab === 'general' || activeTab === 'hackmd';

  return (
    <div className="flex h-dvh bg-background-muted pt-[max(2rem,env(safe-area-inset-top))] text-text-default" data-tauri-drag-region>
      <aside className="w-56 border-r border-border-default bg-background-default p-4">
        <nav className="space-y-1">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                activeTab === tab.id
                  ? 'bg-background-selected font-medium text-text-default shadow-sm'
                  : 'text-text-subtle hover:bg-element-bg-hover hover:text-text-default',
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl p-8">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

            {activeTab === 'general' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">General Settings</h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="title"
                      className="text-sm font-medium leading-none peer-disabled:opacity-70"
                    >
                      Window Title
                    </label>
                    <input
                      id="title"
                      {...form.register('title')}
                      placeholder="HackDesk"
                      className={inputClassName}
                    />
                    {form.formState.errors.title && (
                      <p className="text-sm text-destructive-default">
                        {form.formState.errors.title.message}
                      </p>
                    )}
                    <p className="text-sm text-text-subtle">
                      The title displayed in the window titlebar
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Appearance</h3>
                <ThemeAppearanceControls onApplied={() => toast.success('Theme applied')} />
              </div>
            )}

            {activeTab === 'hackmd' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">HackMD API Integration</h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="hackmdApiToken"
                      className="text-sm font-medium leading-none peer-disabled:opacity-70"
                    >
                      API Token
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="hackmdApiToken"
                        type={showApiToken ? 'text' : 'password'}
                        {...form.register('hackmdApiToken')}
                        placeholder="Paste your HackMD API token"
                        className={inputClassName}
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiToken((current) => !current)}
                        className={compactSecondaryButtonClassName}
                        aria-label={showApiToken ? 'Hide API token' : 'Show API token'}
                      >
                        {showApiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {form.formState.errors.hackmdApiToken && (
                      <p className="text-sm text-destructive-default">
                        {form.formState.errors.hackmdApiToken.message}
                      </p>
                    )}
                    <div className="space-y-1 text-sm text-text-subtle">
                      <p>Generate a personal access token from your <a href="https://hackmd.io/settings#api" target="_blank" rel="noopener noreferrer" className="text-primary-default underline">HackMD account settings</a>.</p>
                      <p>The token is stored locally in <code>~/.hackdesk/settings.json</code>.</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isValidatingToken || !currentHackmdApiToken.trim()}
                      className={secondaryButtonClassName}
                    >
                      {isValidatingToken ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {isValidatingToken ? 'Testing...' : 'Test Connection'}
                    </button>

                    {isTokenValid && validatedUser ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-sm text-success-default">
                        <CheckCircle2 className="h-4 w-4" />
                        Connected as {validatedUser.name} (@{validatedUser.userPath})
                      </span>
                    ) : null}

                    {validationError ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-destructive-soft px-3 py-1 text-sm text-destructive-default">
                        <AlertCircle className="h-4 w-4" />
                        {validationError.message}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Keyboard Shortcuts</h3>

                <div className="space-y-2">
                  {shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.id}
                      className="flex items-center justify-between rounded-md border border-border-default bg-background-default px-4 py-3"
                    >
                      <span className="text-sm">{shortcut.action}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <kbd
                            key={`${shortcut.id}:${key}:${keyIndex}`}
                            className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border-default bg-background-muted px-1.5 text-xs font-medium text-text-subtle"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Advanced</h3>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Version</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm text-text-subtle">
                        HackDesk v{version}
                      </p>
                      <button
                        type="button"
                        onClick={handleCheckForUpdates}
                        disabled={isCheckingForUpdates}
                        className={secondaryButtonClassName}
                      >
                        {isCheckingForUpdates ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {isCheckingForUpdates ? 'Checking...' : 'Check for Updates'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleResetToDefaults}
                      className={dangerButtonClassName}
                    >
                      Reset All Settings
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showFormActions ? (
              <div className="flex items-center gap-4 pt-4">
                <button
                  type="submit"
                  disabled={isPending}
                  className={primaryButtonClassName}
                >
                  {isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isPending}
                  className={secondaryButtonClassName}
                >
                  Reset
                </button>
              </div>
            ) : null}
          </form>
        </div>
      </main>
    </div>
  );
}
