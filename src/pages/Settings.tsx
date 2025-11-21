import { useEffect, useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { toast } from 'sonner';

import { useTheme } from '@/components/theme-provider';
import { useSettings, useUpdateSettings } from '@/lib/query';
import SETTINGS_JSON from '@/../src-tauri/src/app/settings.json';

const SETTING_JSON_STRING = JSON.stringify(SETTINGS_JSON, null, 2);

export function Settings() {
  const { theme } = useTheme();
  const { data: settings } = useSettings();
  const { mutate: updateSettings } = useUpdateSettings();

  const [content, setContent] = useState(settings || SETTING_JSON_STRING);
  useEffect(() => {
    setContent(settings || SETTING_JSON_STRING);
  }, [settings]);

  useEffect(() => {
    const handleSave = (value: string) => {
      if (value === settings) {
        toast.info('No changes to save');
        return;
      }

      updateSettings(value, {
        onSuccess: () => toast.success('Settings saved successfully'),
        onError: (error) => toast.error(`Failed to save: ${error.message}`),
      });
    };


    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 's') return;
      
      e.preventDefault();
      handleSave(content);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content, settings, updateSettings]);

  return (
    <div className="h-screen">
      <MonacoEditor
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        defaultLanguage="json"
        value={content}
        onChange={(value) => setContent(value || '')}
      />
    </div>
  );
}
