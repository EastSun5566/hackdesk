import MonacoEditor from '@monaco-editor/react';

import { 
  debounce,
  writeSettings,
} from '@/utils';
import DEFAULT_SETTINGS from '@/../src-tauri/src/app/settings.json';
import { useSettings, useTheme } from '@/hooks';

interface EditorProps {
  lang?: string;
  value?: string;
  onChange?: (value?: string) => void;
}

function Editor ({
  lang = 'json',
  ...restProps
}: EditorProps) {
  const { theme } = useTheme();

  return (
    <div className="w-full h-screen">
      <MonacoEditor
        onMount={(editor) => {
          editor.focus();
        }}
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        defaultLanguage={lang}
        {...restProps}
      />
    </div>
  );
}

const DEFAULT_SETTING_STRING = JSON.stringify(DEFAULT_SETTINGS, null, 2);

export function Settings() {
  const { settings, setSettings } = useSettings();

  const handleChange = (content?: string) => {
    setSettings(content || DEFAULT_SETTING_STRING);
    debounce(writeSettings, 500)(content || DEFAULT_SETTING_STRING);
  };

  return (
    <Editor
      value={settings}
      onChange={handleChange}
    />
  );
}