import { useState, useEffect } from 'react';
import DEFAULT_SETTINGS from '@/../src-tauri/src/app/settings.json';
import { readSettings, writeSettings } from './utils';

const DEFAULT_SETTING_STRING = JSON.stringify(DEFAULT_SETTINGS, null, 2);
export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTING_STRING);

  const initSettings = async () => {
    const settings = await readSettings();
    if (!settings) writeSettings(DEFAULT_SETTING_STRING);
      
    setSettings(settings || DEFAULT_SETTING_STRING);
  };

  useEffect(() => {
    initSettings();
  }, []);

  return { settings , setSettings };
}