import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Settings as SettingsIcon, Monitor, Keyboard, Zap, Sun, Moon, Laptop } from 'lucide-react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { useSettings, useUpdateSettings } from '@/lib/query';
import { useTheme } from '@/components/theme-provider';

// Settings schema
const settingsSchema = z.object({
  title: z.string().min(1, 'Title is required').max(50, 'Title too long'),
});

type SettingsForm = z.infer<typeof settingsSchema>;

type SettingsTab = 'general' | 'appearance' | 'shortcuts' | 'advanced';

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <SettingsIcon className="h-4 w-4" /> },
  { id: 'appearance', label: 'Appearance', icon: <Monitor className="h-4 w-4" /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard className="h-4 w-4" /> },
  { id: 'advanced', label: 'Advanced', icon: <Zap className="h-4 w-4" /> },
];

const DEFAULT_SETTINGS = { title: 'HackDesk' };

// Keyboard shortcuts configuration
const shortcuts = [
  { action: 'Open Command Palette', keys: ['⌘', 'K'] },
  { action: 'Open Settings', keys: ['⌘', ','] },
  { action: 'New Note', keys: ['⌘', 'N'] },
  { action: 'Go Back', keys: ['⌘', '['] },
  { action: 'Go Forward', keys: ['⌘', ']'] },
  { action: 'Reload', keys: ['⌘', 'R'] },
  { action: 'Toggle Theme', keys: ['⌘', 'Shift', 'T'] },
  { action: 'Close Window', keys: ['⌘', 'W'] },
  { action: 'Close Settings', keys: ['Esc'] },
];

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const { data: settingsData } = useSettings();
  const { mutate: updateSettings, isPending } = useUpdateSettings();
  const { theme, setTheme } = useTheme();

  // Parse settings only once when data changes
  const currentSettings = useMemo(() => {
    if (!settingsData) return DEFAULT_SETTINGS;
    try {
      return JSON.parse(settingsData);
    } catch {
      console.error('Failed to parse settings, using defaults');
      return DEFAULT_SETTINGS;
    }
  }, [settingsData]);

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      title: currentSettings.title || 'HackDesk',
    },
  });

  // Reset form when parsed settings change
  useEffect(() => {
    form.reset({ title: currentSettings.title || 'HackDesk' });
  }, [currentSettings, form]);

  const onSubmit = (data: SettingsForm) => {
    const settingsJson = JSON.stringify(data, null, 2);
    updateSettings(settingsJson, {
      onSuccess: () => toast.success('Settings saved successfully'),
      onError: (error) => toast.error(`Failed to save: ${error.message}`),
    });
  };

  const handleReset = () => {
    form.reset(currentSettings);
    toast.info('Settings reset to current values');
  };

  const handleResetToDefaults = () => {
    form.reset(DEFAULT_SETTINGS);
    setTheme('system');
    const settingsJson = JSON.stringify(DEFAULT_SETTINGS, null, 2);
    updateSettings(settingsJson, {
      onSuccess: () => toast.success('All settings reset to defaults'),
      onError: (error) => toast.error(`Failed to reset: ${error.message}`),
    });
  };

  // Handle ESC key to close settings window
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        getCurrentWebviewWindow().close();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const themeOptions = [
    { id: 'light', label: 'Light', icon: <Sun className="h-5 w-5" />, description: 'Light mode' },
    { id: 'dark', label: 'Dark', icon: <Moon className="h-5 w-5" />, description: 'Dark mode' },
    { id: 'system', label: 'System', icon: <Laptop className="h-5 w-5" />, description: 'Follow system settings' },
  ] as const;

  return (
    <div className="flex h-screen bg-background/80 pt-8" data-tauri-drag-region>
      {/* Sidebar */}
      <aside className="w-56 border-r bg-muted/40 p-4">
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="text-sm text-muted-foreground">
            Manage your preferences
          </p>
        </div>

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

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl p-8">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* General Settings */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">General Settings</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure basic application settings
                  </p>
                </div>

                <div className="border-t border-border pt-6" />

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

            {/* Appearance Settings */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">Appearance</h3>
                  <p className="text-sm text-muted-foreground">
                    Customize the look and feel
                  </p>
                </div>

                <div className="border-t border-border pt-6" />

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

            {/* Shortcuts Settings */}
            {activeTab === 'shortcuts' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">Keyboard Shortcuts</h3>
                  <p className="text-sm text-muted-foreground">
                    Quick reference for keyboard shortcuts
                  </p>
                </div>

                <div className="border-t border-border pt-6" />

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

            {/* Advanced Settings */}
            {activeTab === 'advanced' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">Advanced</h3>
                  <p className="text-sm text-muted-foreground">
                    Advanced configuration options
                  </p>
                </div>

                <div className="border-t border-border pt-6" />

                <div className="space-y-6">
                  {/* Version Info */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Version</label>
                    <p className="text-sm text-muted-foreground">
                      HackDesk v0.0.7
                    </p>
                  </div>

                  {/* Reset All Settings */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Reset Settings</label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Reset all settings to their default values
                    </p>
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

            {/* Action Buttons - Only show for General tab */}
            {activeTab === 'general' && (
              <div className="flex items-center gap-4 pt-4">
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isPending}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                >
                  Reset
                </button>
              </div>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}

