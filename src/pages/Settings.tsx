import { useState, useRef, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';

import SETTINGS_JSON from '@/../src-tauri/src/app/settings.json';
import { 
  debounce,
  getSettingsPath,
  readSettings,
  writeSettings,
} from '@/utils';

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
  const [content, setContent] = useState('');
  useEffect(() => {
    setContent(defaultValue);
    onChange && onChange(defaultValue);
  }, [defaultValue, onChange]);

  const handleChange = (value: string = '') => {
    onChange && onChange(value);
    setContent(value);
  };

  return (
    <div className="w-full h-screen">
      <MonacoEditor
        defaultLanguage={lang}
        value={content}
        onChange={handleChange}
      />
    </div>
  );
}

const SETTING_JSON_STRING = JSON.stringify(SETTINGS_JSON, null, 2);

export function Settings() {
  // const navigate = useNavigate();
  const isInit = useRef(true);
  const [content, setContent] = useState('');
  const [, setFilePath] = useState('');

  useEffect(() => {
    return () => {
      if (!isInit.current) {
        window.location.reload();
        return;
      }

      isInit.current = false;
    };
  }, []);

  const writeContent = async (value?: string) => {
    writeSettings(value || SETTING_JSON_STRING);
  };

  const handleEdit = debounce(writeContent, 500);

  useEffect(() => {
    (async () => {
      setFilePath(await getSettingsPath());
      const settings = await readSettings();
      if (!settings) {
        writeContent(SETTING_JSON_STRING);
        setContent(SETTING_JSON_STRING);
        return;
      }
      setContent(settings);
    })();
  }, []);

  // const handleScript = () => {
  //   navigate('/script');
  // };

  return (
    <Editor
      defaultValue={content}
      onChange={handleEdit}
    />
  );
}