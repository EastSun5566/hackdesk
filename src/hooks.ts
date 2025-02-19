import { useState, useEffect, useContext } from 'react';
import { useQuery } from 'react-query';
import HackMDApi from '@hackmd/api';

import DEFAULT_SETTINGS from '@/../src-tauri/src/app/settings.json';
import { ThemeContext } from './components/theme-provider';
import { readSettings, writeSettings } from './utils';

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');

  return context;
}

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

let hackMDApiClient: HackMDApi | null = null;
export function useHackMDApiClient() {
  const { settings } = useSettings();
  if (hackMDApiClient) return hackMDApiClient;

  const { hackMDApiAccessToken } = JSON.parse(settings || '{}') as Partial<typeof DEFAULT_SETTINGS>;
  if(!hackMDApiAccessToken) return null;
  
  hackMDApiClient = new HackMDApi(hackMDApiAccessToken);
  return hackMDApiClient;
}

export function useHistory() {
  const hackMDApiClient = useHackMDApiClient();
  return useQuery('history', () => hackMDApiClient?.getHistory());
}
