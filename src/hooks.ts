import { useState, useEffect, useContext } from 'react';
import DEFAULT_SETTINGS from '@/../src-tauri/src/app/settings.json';
import { ThemeContext } from './components/theme-provider';
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

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');

  return context;
}