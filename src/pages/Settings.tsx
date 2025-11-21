import { useState, useEffect, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { toast } from 'sonner';

import { useTheme } from '@/components/theme-provider';
import { useSettings, useUpdateSettings } from '@/lib/query';
import SETTINGS_JSON from '@/../src-tauri/src/app/settings.json';

interface EditorProps {
  lang?: string;
  defaultValue?: string;
  onChange?: (content?: string) => void;
}

function Editor ({
  lang = 'json',
  defaultValue = '',
  onChange,
}: EditorProps) {
  const { theme } = useTheme();

  const [content, setContent] = useState('');
  useEffect(() => {
    setContent(defaultValue);
  }, [defaultValue]);

  const handleChange = (value: string = '') => {
    if (onChange) {
      onChange(value);
    }
    setContent(value);
  };

  return (
    <div className="w-full h-screen">
      <MonacoEditor
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        defaultLanguage={lang}
        value={content}
        onChange={handleChange}
      />
    </div>
  );
}

const SETTING_JSON_STRING = JSON.stringify(SETTINGS_JSON, null, 2);

export function Settings() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [localContent, setLocalContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize content when settings are loaded
  useEffect(() => {
    if (settings) {
      setLocalContent(settings);
    } else {
      setLocalContent(SETTING_JSON_STRING);
    }
  }, [settings]);

  // Handle content changes
  const handleContentChange = (value?: string) => {
    setLocalContent(value || '');
    setHasChanges(value !== settings);
  };

  // Save settings
  const handleSave = useCallback(() => {
    if (!hasChanges) {
      toast.info('No changes to save');
      return;
    }

    updateSettings.mutate(localContent, {
      onSuccess: () => {
        toast.success('Settings saved successfully');
        setHasChanges(false);
      },
      onError: (error) => {
        toast.error(`Failed to save: ${error.message}`);
      },
    });
  }, [hasChanges, localContent, updateSettings]);

  // Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  return (
    <div className="relative h-screen">
      <Editor
        defaultValue={localContent}
        onChange={handleContentChange}
      />
    </div>
  );
}
