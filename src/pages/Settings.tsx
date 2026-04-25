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
  Sparkles,
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
import {
  useSettings,
  useUpdateSettings,
  useValidateAgentProviderConfig,
} from '@/lib/query';
import {
  defaultAgentProviderSettings,
  defaultSettings,
  settingsSchema,
  type AppSettings,
} from '@/lib/settings';
import {
  consumePendingSettingsLaunchTab,
  type SettingsLaunchTab,
} from '@/lib/settings-window';
import { useTheme } from '@/components/theme-provider';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { version } from '../../package.json';

const tabs: { id: SettingsLaunchTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <SettingsIcon className="h-4 w-4" /> },
  { id: 'appearance', label: 'Appearance', icon: <Monitor className="h-4 w-4" /> },
  { id: 'hackmd', label: 'HackMD', icon: <Shield className="h-4 w-4" /> },
  { id: 'agent', label: 'Agent', icon: <Sparkles className="h-4 w-4" /> },
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

const inputClassName = 'flex h-10 w-full rounded-md border border-border-default bg-background-default px-3 py-2 text-sm text-text-default ring-offset-background-default file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButtonClassName = 'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary-default px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default disabled:pointer-events-none disabled:opacity-50';
const secondaryButtonClassName = 'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border-default bg-background-default px-4 py-2 text-sm font-medium text-text-default transition-colors hover:bg-background-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default disabled:pointer-events-none disabled:opacity-50';
const compactSecondaryButtonClassName = 'inline-flex h-10 items-center justify-center rounded-md border border-border-default bg-background-default px-3 text-sm text-text-default transition-colors hover:bg-background-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default disabled:pointer-events-none disabled:opacity-50';
const dangerButtonClassName = 'inline-flex h-9 items-center justify-center rounded-md border border-destructive-default px-4 py-2 text-sm font-medium text-destructive-default transition-colors hover:bg-destructive-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-default focus-visible:ring-offset-2 focus-visible:ring-offset-background-default';

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsLaunchTab>(() => consumePendingSettingsLaunchTab() ?? 'general');
  const [showApiToken, setShowApiToken] = useState(false);
  const [showAgentApiKey, setShowAgentApiKey] = useState(false);
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
  const {
    mutate: validateAgentProviderConfig,
    data: validatedAgentProvider,
    error: agentValidationError,
    isPending: isValidatingAgentProvider,
    isSuccess: isAgentProviderValid,
    reset: resetAgentValidation,
  } = useValidateAgentProviderConfig();
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
  const currentAgentApiKey = form.watch('agent.apiKey') ?? '';
  const currentAgentBaseUrl = form.watch('agent.baseUrl') ?? defaultAgentProviderSettings.baseUrl;
  const currentAgentModel = form.watch('agent.model') ?? defaultAgentProviderSettings.model;

  useEffect(() => {
    resetTokenValidation();
  }, [currentHackmdApiToken, resetTokenValidation]);

  useEffect(() => {
    resetAgentValidation();
  }, [currentAgentApiKey, currentAgentBaseUrl, currentAgentModel, resetAgentValidation]);

  useEffect(() => {
    const syncPendingTab = () => {
      const pendingTab = consumePendingSettingsLaunchTab();

      if (pendingTab) {
        setActiveTab(pendingTab);
      }
    };

    window.addEventListener('focus', syncPendingTab);

    return () => window.removeEventListener('focus', syncPendingTab);
  }, []);

  const onSubmit = (data: AppSettings) => {
    updateSettings(data, {
      onSuccess: () => toast.success('Settings saved successfully'),
      onError: (error) => toast.error(`Failed to save: ${error.message}`),
    });
  };

  const handleReset = () => {
    form.reset(currentSettings);
    resetTokenValidation();
    resetAgentValidation();
    toast.info('Settings reset to current values');
  };

  const handleResetToDefaults = () => {
    form.reset(defaultSettings);
    setTheme('system');
    resetTokenValidation();
    resetAgentValidation();
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

  const handleTestAgentConnection = () => {
    const agentConfig = {
      provider: form.getValues('agent.provider') ?? defaultAgentProviderSettings.provider,
      apiKey: currentAgentApiKey.trim(),
      baseUrl: currentAgentBaseUrl.trim(),
      model: currentAgentModel.trim(),
    };

    if (!agentConfig.apiKey) {
      toast.error('Enter an agent API key first');
      return;
    }

    validateAgentProviderConfig(agentConfig, {
      onSuccess: (result) => {
        toast.success(`Connected to ${result.baseUrl} using ${result.model}`);
      },
      onError: (error) => {
        toast.error(`Agent connection failed: ${error.message}`);
      },
    });
  };

  const closeWindow = useCallback(() => {
    getCurrentWebviewWindow().close();
  }, []);

  useEscapeKey(closeWindow);

  return (
    <div className="flex h-screen bg-background-muted pt-8 text-text-default" data-tauri-drag-region>
      <aside className="w-56 border-r border-border-default bg-background-default p-4">
        <nav className="space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-background-selected font-medium text-text-default shadow-sm'
                  : 'text-text-subtle hover:bg-background-selected hover:text-text-default'
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

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Theme</label>
                    <p className="mb-3 text-sm text-text-subtle">
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
                              ? 'border-primary-default bg-primary-soft'
                              : 'border-border-default bg-background-default hover:border-primary-default hover:bg-background-selected'
                          }`}
                        >
                          <div className={`rounded-full p-2 ${
                            theme === option.id ? 'bg-primary-soft text-primary-default' : 'bg-background-selected text-text-subtle'
                          }`}>
                            {option.icon}
                          </div>
                          <span className="text-sm font-medium">{option.label}</span>
                          <span className="text-xs text-text-subtle">{option.description}</span>
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

            {activeTab === 'agent' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Agent Provider</h3>

                <div className="space-y-4">
                  <input type="hidden" {...form.register('agent.provider')} />

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Provider Type</label>
                    <input
                      value="OpenAI-compatible"
                      readOnly
                      className={inputClassName}
                    />
                    <p className="text-sm text-text-subtle">
                      This phase supports any OpenAI-compatible chat completion endpoint.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="agentApiKey"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      API Key
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="agentApiKey"
                        type={showAgentApiKey ? 'text' : 'password'}
                        {...form.register('agent.apiKey')}
                        placeholder="Paste your provider API key"
                        className={inputClassName}
                      />
                      <button
                        type="button"
                        onClick={() => setShowAgentApiKey((current) => !current)}
                        className={compactSecondaryButtonClassName}
                        aria-label={showAgentApiKey ? 'Hide agent API key' : 'Show agent API key'}
                      >
                        {showAgentApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {form.formState.errors.agent?.apiKey && (
                      <p className="text-sm text-destructive-default">
                        {form.formState.errors.agent.apiKey.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="agentBaseUrl"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Base URL
                    </label>
                    <input
                      id="agentBaseUrl"
                      {...form.register('agent.baseUrl')}
                      placeholder={defaultAgentProviderSettings.baseUrl}
                      className={inputClassName}
                    />
                    {form.formState.errors.agent?.baseUrl && (
                      <p className="text-sm text-destructive-default">
                        {form.formState.errors.agent.baseUrl.message}
                      </p>
                    )}
                    <p className="text-sm text-text-subtle">
                      Example: <code>{defaultAgentProviderSettings.baseUrl}</code>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="agentModel"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Model
                    </label>
                    <input
                      id="agentModel"
                      {...form.register('agent.model')}
                      placeholder={defaultAgentProviderSettings.model}
                      className={inputClassName}
                    />
                    {form.formState.errors.agent?.model && (
                      <p className="text-sm text-destructive-default">
                        {form.formState.errors.agent.model.message}
                      </p>
                    )}
                    <div className="space-y-1 text-sm text-text-subtle">
                      <p>This MVP stores the provider key locally in <code>~/.hackdesk/settings.json</code>.</p>
                      <p>Saved settings are preferred over <code>.env</code>, while env vars remain a fallback.</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleTestAgentConnection}
                      disabled={isValidatingAgentProvider || !currentAgentApiKey.trim()}
                      className={secondaryButtonClassName}
                    >
                      {isValidatingAgentProvider ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {isValidatingAgentProvider ? 'Testing...' : 'Test Connection'}
                    </button>

                    {isAgentProviderValid && validatedAgentProvider ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-sm text-success-default">
                        <CheckCircle2 className="h-4 w-4" />
                        Connected to {validatedAgentProvider.baseUrl} with {validatedAgentProvider.model}
                      </span>
                    ) : null}

                    {agentValidationError ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-destructive-soft px-3 py-1 text-sm text-destructive-default">
                        <AlertCircle className="h-4 w-4" />
                        {agentValidationError.message}
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
                      className="flex items-center justify-between rounded-md border border-border-default bg-background-default px-4 py-3"
                    >
                      <span className="text-sm">{shortcut.action}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <kbd
                            key={keyIndex}
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
                    <label className="text-sm font-medium">Version</label>
                    <p className="text-sm text-text-subtle">
                      HackDesk v{version}
                    </p>
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
          </form>
        </div>
      </main>
    </div>
  );
}

