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
  Sun,
  Moon,
  Laptop,
  Shield,
  Eye,
  EyeOff,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { useValidateHackmdToken } from '@/lib/hackmd';
import { useSettings, useUpdateSettings } from '@/lib/query';
import {
  defaultSettings,
  settingsSchema,
  type AppSettings,
} from '@/lib/settings';
import { useTheme } from '@/components/theme-provider';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { version } from '../../package.json';

type SettingsTab = 'general' | 'appearance' | 'hackmd' | 'shortcuts' | 'advanced';

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <SettingsIcon className="h-4 w-4" /> },
  { id: 'appearance', label: 'Appearance', icon: <Monitor className="h-4 w-4" /> },
  { id: 'hackmd', label: 'HackMD', icon: <Shield className="h-4 w-4" /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard className="h-4 w-4" /> },
  { id: 'advanced', label: 'Advanced', icon: <Zap className="h-4 w-4" /> },
];

const shortcuts = [
  { action: 'Open Command Palette', keys: ['⌘', 'K'] },
  { action: 'Open Settings', keys: ['⌘', ','] },
  { action: 'New Note', keys: ['⌘', 'N'] },
  { action: 'Reload', keys: ['⌘', 'R'] },
  { action: 'Close Window', keys: ['⌘', 'W'] },
  { action: 'Close Settings', keys: ['Esc'] },
];

const themeOptions = [
  {
    id: 'light',
    label: 'Light',
    icon: <Sun className="h-5 w-5" />,
    description: 'Light mode',
  },
  {
    id: 'dark',
    label: 'Dark',
    icon: <Moon className="h-5 w-5" />,
    description: 'Dark mode',
  },
  {
    id: 'system',
    label: 'System',
    icon: <Laptop className="h-5 w-5" />,
    description: 'Follow system settings',
  },
] as const;

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [showApiToken, setShowApiToken] = useState(false);
  const { data: settingsData } = useSettings();
  const { mutate: updateSettings, isPending } = useUpdateSettings();
  const {
    mutate: validateHackmdToken,
    data: validatedUser,
    error: validationError,
    isPending: isValidatingToken,
    isSuccess: isTokenValid,
    reset: resetTokenValidation,
  } = useValidateHackmdToken();
  const { theme, setTheme } = useTheme();

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
    setTheme('system');
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

  const closeWindow = useCallback(() => {
    getCurrentWebviewWindow().close();
  }, []);

  useEscapeKey(closeWindow);

  return (
    <div className="flex h-screen bg-background/80 pt-8" data-tauri-drag-region>
      <aside className="w-56 border-r bg-muted/40 p-4">
        <nav className="space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-background font-medium shadow-sm'
                  : 'text-muted-foreground hover:bg-background/50'
              }`}
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
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Window Title
                    </label>
                    <input
                      id="title"
                      {...form.register('title')}
                      placeholder="HackDesk"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    {form.formState.errors.title && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.title.message}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      The title displayed in the window titlebar
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Appearance</h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Theme</label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Select your preferred color scheme
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {themeOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setTheme(option.id)}
                          className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                            theme === option.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50 hover:bg-muted/50'
                          }`}
                        >
                          <div className={`rounded-full p-2 ${
                            theme === option.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                          }`}>
                            {option.icon}
                          </div>
                          <span className="text-sm font-medium">{option.label}</span>
                          <span className="text-xs text-muted-foreground">{option.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'hackmd' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">HackMD Integration</h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="hackmdApiToken"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      API Token
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="hackmdApiToken"
                        type={showApiToken ? 'text' : 'password'}
                        {...form.register('hackmdApiToken')}
                        placeholder="Paste your HackMD API token"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiToken((current) => !current)}
                        className="inline-flex h-10 items-center justify-center rounded-md border border-input px-3 text-sm hover:bg-accent hover:text-accent-foreground"
                        aria-label={showApiToken ? 'Hide API token' : 'Show API token'}
                      >
                        {showApiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {form.formState.errors.hackmdApiToken && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.hackmdApiToken.message}
                      </p>
                    )}
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>Generate a personal access token from your HackMD account settings.</p>
                      <p>This MVP stores the token locally in <code>~/.hackdesk/settings.json</code>.</p>
                      <p>Phase 1 supports personal HackMD Cloud notes only.</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isValidatingToken || !currentHackmdApiToken.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                    >
                      {isValidatingToken ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {isValidatingToken ? 'Testing...' : 'Test Connection'}
                    </button>

                    {isTokenValid && validatedUser ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-sm text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        Connected as {validatedUser.name} (@{validatedUser.userPath})
                      </span>
                    ) : null}

                    {validationError ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1 text-sm text-destructive">
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
                  {shortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3"
                    >
                      <span className="text-sm">{shortcut.action}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <kbd
                            key={keyIndex}
                            className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-background px-1.5 text-xs font-medium text-muted-foreground"
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
                    <label className="text-sm font-medium">Version</label>
                    <p className="text-sm text-muted-foreground">
                      HackDesk v{version}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleResetToDefaults}
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-9 px-4 py-2 border border-destructive text-destructive hover:bg-destructive/10"
                    >
                      Reset All Settings
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 pt-4">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                {isPending ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isPending}
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                Reset
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

