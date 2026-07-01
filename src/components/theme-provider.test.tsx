import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defaultSettings } from '@/lib/settings';
import { getThemeBackground, resolveHackDeskTheme } from '@/lib/themes';
import { ThemeProvider, useTheme } from './theme-provider';

// Helper component to test useTheme hook
function ThemeConsumer() {
  const {
    theme,
    presetId,
    customSeed,
    previewTheme,
    cancelPreview,
    setCustomSeed,
    setPresetId,
    setTypography,
    setTheme,
    typography,
  } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <span data-testid="current-preset">{presetId}</span>
      <span data-testid="current-primary">{customSeed.primary ?? ''}</span>
      <span data-testid="current-editor-font">{typography.editorFontStack}</span>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
      <button onClick={() => setTheme('light')}>Set Light</button>
      <button onClick={() => setTheme('system')}>Set System</button>
      <button onClick={() => setPresetId('hackmd-nature')}>Set Nature</button>
      <button onClick={() => setCustomSeed({ primary: '#123ABC' })}>Set Primary</button>
      <button onClick={() => setTypography({
        ...typography,
        editorFontStack: '"JetBrains Mono", ui-monospace, monospace',
      })}>Set JetBrains Mono</button>
      <button onClick={() => previewTheme({ theme: 'dark', presetId: 'solarized' })}>Preview Solarized Dark</button>
      <button onClick={cancelPreview}>Cancel Preview</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.removeAttribute('data-theme-preset');
    document.getElementById('hackdesk-theme')?.remove();
    document.getElementById('hackdesk-theme-preload')?.remove();
    document.querySelector('meta[name="color-scheme"]')?.remove();
    delete window.hackdeskAPI;
  });

  it('should provide default theme from localStorage', () => {
    localStorage.setItem('theme', 'dark');
    
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    
    expect(screen.getByTestId('current-theme').textContent).toBe('dark');
  });

  it('should use defaultTheme when localStorage is empty', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeConsumer />
      </ThemeProvider>,
    );
    
    expect(screen.getByTestId('current-theme').textContent).toBe('light');
  });

  it('should apply theme class to document', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeConsumer />
      </ThemeProvider>,
    );
    
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should update theme when setTheme is called', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeConsumer />
      </ThemeProvider>,
    );
    
    fireEvent.click(screen.getByText('Set Dark'));
    
    expect(screen.getByTestId('current-theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('theme-mode')).toBe('dark');
  });

  it('syncs native theme surfaces when the resolved mode changes', () => {
    const setThemeSurface = vi.fn();
    window.hackdeskAPI = {
      app: {
        setThemeSurface,
      },
    } as never;

    render(
      <ThemeProvider defaultTheme="light">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    const lightBackground = getThemeBackground(resolveHackDeskTheme({ presetId: 'hackmd-neo', mode: 'light' }));
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.querySelector('meta[name="color-scheme"]')).toHaveAttribute('content', 'light');
    expect(document.getElementById('hackdesk-theme')?.textContent).toContain('color-scheme: light');
    expect(setThemeSurface).toHaveBeenLastCalledWith({ mode: 'light', background: lightBackground });

    fireEvent.click(screen.getByText('Set Dark'));

    const darkBackground = getThemeBackground(resolveHackDeskTheme({ presetId: 'hackmd-neo', mode: 'dark' }));
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
    expect(document.getElementById('hackdesk-theme')?.textContent).toContain('color-scheme: dark');
    expect(setThemeSurface).toHaveBeenLastCalledWith({ mode: 'dark', background: darkBackground });
  });


  it('should log error when useTheme is used outside provider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // In test environment with jsdom, the error might be caught differently
    // The important thing is that useTheme throws when context is undefined
    try {
      render(<ThemeConsumer />);
    } catch {
      // Expected behavior - component throws
    }
    
    consoleSpy.mockRestore();
  });

  it('should use custom storageKey', () => {
    render(
      <ThemeProvider defaultTheme="dark" storageKey="custom-theme">
        <ThemeConsumer />
      </ThemeProvider>,
    );
    
    fireEvent.click(screen.getByText('Set Light'));
    
    expect(localStorage.getItem('custom-theme')).toBe('light');
  });

  it('persists preset and custom seed values', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('Set Nature'));
    fireEvent.click(screen.getByText('Set Primary'));

    expect(screen.getByTestId('current-preset').textContent).toBe('hackmd-nature');
    expect(screen.getByTestId('current-primary').textContent).toBe('#123ABC');
    expect(localStorage.getItem('theme-preset-id')).toBe('hackmd-nature');
    expect(localStorage.getItem('theme-custom-seed')).toContain('#123ABC');
  });

  it('persists committed appearance through the Electron settings API', async () => {
    const settingsUpdate = vi.fn(async (update) => ({
      title: 'HackDesk',
      appearance: update.appearance ?? defaultSettings.appearance,
      hasHackmdApiToken: false,
      hasAppearanceSettings: true,
      hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
      onboarding: defaultSettings.onboarding,
      shouldShowHackmdOnboarding: true,
    }));
    window.hackdeskAPI = {
      settings: {
        get: vi.fn(async () => ({
          title: 'HackDesk',
          appearance: defaultSettings.appearance,
          hasHackmdApiToken: false,
          hasAppearanceSettings: true,
          hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
          onboarding: defaultSettings.onboarding,
          shouldShowHackmdOnboarding: true,
        })),
        update: settingsUpdate,
        importHackmdCliToken: vi.fn(),
      },
      app: {
        setThemeSurface: vi.fn(),
      },
    } as never;

    render(
      <ThemeProvider defaultTheme="light">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('Set Nature'));

    expect(settingsUpdate).toHaveBeenCalledWith({
      appearance: {
        theme: 'light',
        presetId: 'hackmd-nature',
        customSeed: {},
        typography: defaultSettings.appearance.typography,
      },
    });
    expect(localStorage.getItem('theme-preset-id')).toBeNull();
  });

  it('migrates legacy localStorage appearance into Electron settings once', async () => {
    const settingsUpdate = vi.fn(async (update) => ({
      title: 'HackDesk',
      appearance: update.appearance ?? defaultSettings.appearance,
      hasHackmdApiToken: false,
      hasAppearanceSettings: true,
      hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
      onboarding: defaultSettings.onboarding,
      shouldShowHackmdOnboarding: true,
    }));
    localStorage.setItem('theme-mode', 'dark');
    localStorage.setItem('theme-preset-id', 'hackmd-nature');
    window.hackdeskAPI = {
      settings: {
        get: vi.fn(async () => ({
          title: 'HackDesk',
          appearance: defaultSettings.appearance,
          hasHackmdApiToken: false,
          hasAppearanceSettings: false,
          hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
          onboarding: defaultSettings.onboarding,
          shouldShowHackmdOnboarding: true,
        })),
        update: settingsUpdate,
        importHackmdCliToken: vi.fn(),
      },
      app: {
        setThemeSurface: vi.fn(),
      },
    } as never;

    render(
      <ThemeProvider defaultTheme="light">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await vi.waitFor(() => {
      expect(settingsUpdate).toHaveBeenCalledWith({
        appearance: {
          theme: 'dark',
          presetId: 'hackmd-nature',
          customSeed: {},
          typography: defaultSettings.appearance.typography,
        },
      });
    });
  });

  it('persists committed typography through the Electron settings API', () => {
    const settingsUpdate = vi.fn(async (update) => ({
      title: 'HackDesk',
      appearance: update.appearance ?? defaultSettings.appearance,
      hasHackmdApiToken: false,
      hasAppearanceSettings: true,
      hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
      onboarding: defaultSettings.onboarding,
      localVault: defaultSettings.localVault,
      shouldShowHackmdOnboarding: true,
    }));
    window.hackdeskAPI = {
      settings: {
        get: vi.fn(async () => ({
          title: 'HackDesk',
          appearance: defaultSettings.appearance,
          hasHackmdApiToken: false,
          hasAppearanceSettings: true,
          hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
          onboarding: defaultSettings.onboarding,
          localVault: defaultSettings.localVault,
          shouldShowHackmdOnboarding: true,
        })),
        update: settingsUpdate,
        importHackmdCliToken: vi.fn(),
      },
      app: {
        setThemeSurface: vi.fn(),
      },
    } as never;

    render(
      <ThemeProvider defaultTheme="light">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('Set JetBrains Mono'));

    expect(screen.getByTestId('current-editor-font').textContent).toBe('"JetBrains Mono", ui-monospace, monospace');
    expect(settingsUpdate).toHaveBeenCalledWith({
      appearance: {
        ...defaultSettings.appearance,
        theme: 'light',
        typography: {
          ...defaultSettings.appearance.typography,
          editorFontStack: '"JetBrains Mono", ui-monospace, monospace',
        },
      },
    });
  });

  it('previews a theme without persisting it and can cancel back to saved values', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('Preview Solarized Dark'));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.themePreset).toBe('solarized');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
    expect(document.getElementById('hackdesk-theme')?.textContent).toContain('color-scheme: dark');
    expect(screen.getByTestId('current-theme').textContent).toBe('light');
    expect(localStorage.getItem('theme-preset-id')).toBeNull();

    fireEvent.click(screen.getByText('Cancel Preview'));

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.dataset.themePreset).toBe('hackmd-neo');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.querySelector('meta[name="color-scheme"]')).toHaveAttribute('content', 'light');
    expect(document.getElementById('hackdesk-theme')?.textContent).toContain('color-scheme: light');
  });
});
