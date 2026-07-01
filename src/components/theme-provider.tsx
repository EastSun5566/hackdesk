import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useReducer } from 'react';
import { COMMAND_PALETTE_SYNC_THEME_EVENT } from '@/hooks/useCommandPaletteWindow';
import { getHackDeskAPI } from '@/lib/electron-api';
import {
  normalizeAppearanceSettings,
  type AppearanceSettings,
} from '@/lib/settings';
import {
  buildThemeStyleText,
  getThemeBackground,
  HACKDESK_THEME_PRESETS,
  normalizeThemeMode,
  normalizeThemePresetId,
  parseStoredThemeSeed,
  parseStoredThemeTypography,
  resolveHackDeskTheme,
  serializeThemeSeed,
  serializeThemeTypography,
  THEME_PRELOAD_STYLE_ID,
  THEME_STORAGE_KEYS,
  THEME_STYLE_ID,
  type ResolvedThemeMode,
  type ThemeMode,
  type ThemePresetId,
  type ThemeSeed,
  type ThemeTypography,
} from '@/lib/themes';

type Theme = ThemeMode;

type ThemePreview = {
  theme?: ThemeMode;
  presetId?: ThemePresetId;
  customSeed?: Partial<ThemeSeed>;
  typography?: ThemeTypography;
};

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedMode: ResolvedThemeMode
  presetId: ThemePresetId
  setPresetId: (presetId: ThemePresetId) => void
  customSeed: Partial<ThemeSeed>
  setCustomSeed: (seed: Partial<ThemeSeed>) => void
  typography: ThemeTypography
  setTypography: (typography: ThemeTypography) => void
  setAppearance: (appearance: AppearanceSettings) => void
  previewTheme: (preview: ThemePreview) => void
  commitPreview: () => void
  cancelPreview: () => void
  presets: typeof HACKDESK_THEME_PRESETS
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  resolvedMode: 'light',
  presetId: 'hackmd-neo',
  setPresetId: () => null,
  customSeed: {},
  setCustomSeed: () => null,
  typography: normalizeAppearanceSettings(undefined).typography,
  setTypography: () => null,
  setAppearance: () => null,
  previewTheme: () => null,
  commitPreview: () => null,
  cancelPreview: () => null,
  presets: HACKDESK_THEME_PRESETS,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

type ThemeState = {
  theme: Theme;
  presetId: ThemePresetId;
  customSeed: Partial<ThemeSeed>;
  typography: ThemeTypography;
  systemTheme: ResolvedThemeMode;
  preview: ThemePreview | null;
};

type ThemeAction =
  | { type: 'sync'; theme: Theme; presetId: ThemePresetId; customSeed: Partial<ThemeSeed>; typography: ThemeTypography }
  | { type: 'system'; systemTheme: ResolvedThemeMode }
  | { type: 'theme'; theme: Theme }
  | { type: 'preset'; presetId: ThemePresetId }
  | { type: 'seed'; customSeed: Partial<ThemeSeed> }
  | { type: 'typography'; typography: ThemeTypography }
  | { type: 'preview'; preview: ThemePreview }
  | { type: 'cancelPreview' }
  | { type: 'commitPreview'; theme: Theme; presetId: ThemePresetId; customSeed: Partial<ThemeSeed>; typography: ThemeTypography };

function themeReducer(state: ThemeState, action: ThemeAction): ThemeState {
  switch (action.type) {
  case 'sync':
    return {
      ...state,
      theme: action.theme,
      presetId: action.presetId,
      customSeed: action.customSeed,
      typography: action.typography,
      preview: null,
    };
  case 'system':
    return { ...state, systemTheme: action.systemTheme };
  case 'theme':
    return { ...state, theme: action.theme, preview: null };
  case 'preset':
    return { ...state, presetId: action.presetId, preview: null };
  case 'seed':
    return { ...state, customSeed: action.customSeed, preview: null };
  case 'typography':
    return { ...state, typography: action.typography, preview: null };
  case 'preview':
    return { ...state, preview: { ...(state.preview ?? {}), ...action.preview } };
  case 'cancelPreview':
    return { ...state, preview: null };
  case 'commitPreview':
    return {
      ...state,
      theme: action.theme,
      presetId: action.presetId,
      customSeed: action.customSeed,
      typography: action.typography,
      preview: null,
    };
  }
}

function getSystemTheme(): ResolvedThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(storageKey: string, fallbackTheme: Theme) {
  return normalizeThemeMode(
    localStorage.getItem(THEME_STORAGE_KEYS.mode) ?? localStorage.getItem(storageKey),
    fallbackTheme,
  );
}

function getStoredPresetId() {
  return normalizeThemePresetId(localStorage.getItem(THEME_STORAGE_KEYS.presetId), 'hackmd-neo');
}

function getStoredCustomSeed() {
  return parseStoredThemeSeed(localStorage.getItem(THEME_STORAGE_KEYS.customSeed));
}

function getStoredTypography() {
  return parseStoredThemeTypography(localStorage.getItem(THEME_STORAGE_KEYS.typography));
}

function getStoredAppearance(storageKey: string, fallbackTheme: Theme): AppearanceSettings {
  return normalizeAppearanceSettings({
    theme: getStoredTheme(storageKey, fallbackTheme),
    presetId: getStoredPresetId(),
    customSeed: getStoredCustomSeed(),
    typography: getStoredTypography(),
  });
}

function hasLegacyStoredAppearance(storageKey: string) {
  return [
    THEME_STORAGE_KEYS.mode,
    THEME_STORAGE_KEYS.legacyMode,
    THEME_STORAGE_KEYS.presetId,
    THEME_STORAGE_KEYS.customSeed,
    THEME_STORAGE_KEYS.typography,
    storageKey,
  ].some((key) => localStorage.getItem(key) !== null);
}

function writeLocalAppearance(storageKey: string, appearance: AppearanceSettings) {
  const normalized = normalizeAppearanceSettings(appearance);
  localStorage.setItem(THEME_STORAGE_KEYS.mode, normalized.theme);
  localStorage.setItem(storageKey, normalized.theme);
  localStorage.setItem(THEME_STORAGE_KEYS.presetId, normalized.presetId);
  localStorage.setItem(THEME_STORAGE_KEYS.customSeed, serializeThemeSeed(normalized.customSeed));
  localStorage.setItem(THEME_STORAGE_KEYS.typography, serializeThemeTypography(normalized.typography));
}

async function readPersistedAppearance(storageKey: string, fallbackTheme: Theme): Promise<AppearanceSettings> {
  const api = getHackDeskAPI();

  if (api?.settings?.get) {
    const settings = await api.settings.get();
    if (settings.hasAppearanceSettings === false && hasLegacyStoredAppearance(storageKey)) {
      const migrated = getStoredAppearance(storageKey, fallbackTheme);
      await api.settings.update({ appearance: migrated });
      return migrated;
    }

    return normalizeAppearanceSettings(settings.appearance);
  }

  return getStoredAppearance(storageKey, fallbackTheme);
}

function writePersistedAppearance(storageKey: string, appearance: AppearanceSettings) {
  const normalized = normalizeAppearanceSettings(appearance);
  const api = getHackDeskAPI();

  if (api?.settings?.update) {
    void api.settings.update({ appearance: normalized }).catch((error) => {
      console.error('Failed to persist theme settings:', error);
    });
    return;
  }

  writeLocalAppearance(storageKey, normalized);
}

function ensureThemeStyleElement() {
  const existing = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
  if (existing) {
    return existing;
  }

  const element = document.createElement('style');
  element.id = THEME_STYLE_ID;
  document.head.appendChild(element);
  return element;
}

function syncColorSchemeMeta(mode: ResolvedThemeMode) {
  let element = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (!element) {
    element = document.createElement('meta');
    element.name = 'color-scheme';
    document.head.appendChild(element);
  }
  element.content = mode;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'theme',
  ...props
}: ThemeProviderProps) {
  const [state, dispatch] = useReducer(themeReducer, undefined, () => ({
    ...getStoredAppearance(storageKey, defaultTheme),
    systemTheme: getSystemTheme(),
    preview: null,
  }));
  const { customSeed, presetId, preview, systemTheme, theme, typography } = state;
  const effectiveTheme = preview?.theme ?? theme;
  const effectivePresetId = preview?.presetId ?? presetId;
  const effectiveCustomSeed = preview?.customSeed ?? customSeed;
  const effectiveTypography = preview?.typography ?? typography;

  // Resolve the actual theme to apply (handles 'system')
  const resolvedTheme = effectiveTheme === 'system' ? systemTheme : effectiveTheme;

  // Apply theme class to document before paint when possible.
  useLayoutEffect(() => {
    const root = window.document.documentElement;
    const resolved = resolveHackDeskTheme({
      presetId: effectivePresetId,
      mode: resolvedTheme,
      customSeed: effectiveCustomSeed,
      typography: effectiveTypography,
    });
    const css = buildThemeStyleText(resolved, resolvedTheme, effectivePresetId);
    const background = getThemeBackground(resolved);

    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
    root.dataset.themePreset = effectivePresetId;
    root.style.backgroundColor = background;
    root.style.colorScheme = resolvedTheme;
    syncColorSchemeMeta(resolvedTheme);
    document.getElementById(THEME_PRELOAD_STYLE_ID)?.remove();
    ensureThemeStyleElement().textContent = css;
    if (!preview) {
      localStorage.setItem(THEME_STORAGE_KEYS.cachedCss, css);
    }

    void getHackDeskAPI()?.app.setThemeSurface?.({
      mode: resolvedTheme,
      background,
    });
  }, [effectiveCustomSeed, effectivePresetId, effectiveTypography, preview, resolvedTheme]);

  // Sync theme when another window or settings backend changes the committed appearance.
  useEffect(() => {
    let cancelled = false;
    const syncTheme = () => {
      void readPersistedAppearance(storageKey, defaultTheme)
        .then((appearance) => {
          if (cancelled) {
            return;
          }

          dispatch({
            type: 'sync',
            theme: appearance.theme,
            presetId: appearance.presetId,
            customSeed: appearance.customSeed,
            typography: appearance.typography,
          });
        })
        .catch((error) => {
          console.error('Failed to load theme settings:', error);
        });
    };

    syncTheme();
    window.addEventListener(COMMAND_PALETTE_SYNC_THEME_EVENT, syncTheme);
    window.addEventListener('storage', syncTheme);

    return () => {
      cancelled = true;
      window.removeEventListener(COMMAND_PALETTE_SYNC_THEME_EVENT, syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, [defaultTheme, storageKey]);

  // Listen for system theme changes when theme is 'system'
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      dispatch({ type: 'system', systemTheme: getSystemTheme() });
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const value = useMemo(() => {
    const commitAppearance = (appearance: AppearanceSettings) => {
      const normalized = normalizeAppearanceSettings(appearance);
      writePersistedAppearance(storageKey, normalized);
      dispatch({
        type: 'commitPreview',
        theme: normalized.theme,
        presetId: normalized.presetId,
        customSeed: normalized.customSeed,
        typography: normalized.typography,
      });
    };

    return {
      theme,
      resolvedMode: resolvedTheme,
      presetId,
      customSeed,
      typography,
      presets: HACKDESK_THEME_PRESETS,
      setTheme: (newTheme: Theme) => {
        commitAppearance({ theme: newTheme, presetId, customSeed, typography });
      },
      setPresetId: (nextPresetId: ThemePresetId) => {
        commitAppearance({ theme, presetId: nextPresetId, customSeed, typography });
      },
      setCustomSeed: (seed: Partial<ThemeSeed>) => {
        commitAppearance({
          theme,
          presetId,
          customSeed: normalizeAppearanceSettings({ theme, presetId, customSeed: seed, typography }).customSeed,
          typography,
        });
      },
      setTypography: (nextTypography: ThemeTypography) => {
        commitAppearance({ theme, presetId, customSeed, typography: nextTypography });
      },
      setAppearance: commitAppearance,
      previewTheme: (nextPreview: ThemePreview) => {
        dispatch({ type: 'preview', preview: nextPreview });
      },
      commitPreview: () => {
        if (!preview) {
          return;
        }

        commitAppearance({
          theme: preview.theme ?? theme,
          presetId: preview.presetId ?? presetId,
          customSeed: preview.customSeed ?? customSeed,
          typography: preview.typography ?? typography,
        });
      },
      cancelPreview: () => {
        dispatch({ type: 'cancelPreview' });
      },
    };
  }, [customSeed, presetId, preview, resolvedTheme, storageKey, theme, typography]);

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
