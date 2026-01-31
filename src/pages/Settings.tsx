import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Settings as SettingsIcon, Monitor, Keyboard, Zap } from 'lucide-react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { useSettings, useUpdateSettings } from '@/lib/query';

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

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const { data: settingsData } = useSettings();
  const { mutate: updateSettings, isPending } = useUpdateSettings();

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

  return (
    <div className="flex h-screen bg-background">
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
                  <p className="text-sm text-muted-foreground">
                    Coming soon: Theme customization, font settings, and more
                  </p>
                </div>
              </div>
            )}

            {/* Shortcuts Settings */}
            {activeTab === 'shortcuts' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">Keyboard Shortcuts</h3>
                  <p className="text-sm text-muted-foreground">
                    Customize keyboard shortcuts
                  </p>
                </div>

                <div className="border-t border-border pt-6" />

                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Coming soon: Customizable keyboard shortcuts
                  </p>
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

                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Coming soon: Debug mode, experimental features, and more
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
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
          </form>
        </div>
      </main>
    </div>
  );
}
