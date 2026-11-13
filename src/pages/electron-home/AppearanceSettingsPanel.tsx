import { ThemeAppearanceFields } from '@/components/ThemeAppearanceControls';
import { Select, SelectContent, SelectItem, SelectLabelValue, SelectTrigger } from '@/components/ui/select';
import { CODE_THEMES, DEFAULT_CODE_THEME, isCodeThemeId, setCodeTheme, useCodeTheme } from '@/lib/code-themes';
import type { ThemeAppearanceDraftController } from '@/components/useThemeAppearanceDraft';

import { SettingsPage, SettingsRow, SettingsSection, SettingsSwitchRow } from './SettingsPrimitives';
import { setStatusLineVisible, useStatusLineVisible } from './status-line-preference';
import {
  isSidebarTranslucency,
  setSidebarTranslucency,
  SIDEBAR_TRANSLUCENCY_LABELS,
  SIDEBAR_TRANSLUCENCY_LEVELS,
  useSidebarTranslucency,
} from './sidebar-translucency-preference';
import { setTreeGuides, useTreeGuides } from './tree-guides-preference';

export function AppearanceSettingsPanel({
  controller,
  platform,
  onRevertTheme,
  onRevertSidebar,
  onRevertWindow,
}: {
  controller: ThemeAppearanceDraftController;
  platform: string;
  onRevertTheme: () => void;
  onRevertSidebar: () => void;
  onRevertWindow: () => void;
}) {
  const showTreeGuides = useTreeGuides();
  const showStatusLine = useStatusLineVisible();
  const codeTheme = useCodeTheme();
  const translucency = useSidebarTranslucency();

  return (
    <SettingsPage>
      <SettingsSection
        title="Theme"
        description="Every change applies at once."
        onRevert={onRevertTheme}
        revertLabel="Reset theme to system mode and the default preset"
      >
        <ThemeAppearanceFields
          controller={controller}
          density="compact"
          customSeedsDefaultOpen={false}
          // Each field is a row of the section's card.
          className="settings-card-rows"
        />
      </SettingsSection>
      <SettingsSection title="Code blocks" onRevert={() => setCodeTheme(DEFAULT_CODE_THEME)} revertLabel="Match code colors to the app theme">
        <SettingsRow label="Syntax colors" htmlFor="settings-code-theme" description="Colors for code in notes, in light and dark mode. The block keeps the theme's background.">
          <Select value={codeTheme} onValueChange={(value) => { if (isCodeThemeId(value)) setCodeTheme(value); }}>
            <SelectTrigger id="settings-code-theme" aria-label="Syntax colors" className="w-full">
              <SelectLabelValue value={codeTheme} labels={Object.fromEntries(CODE_THEMES.map((theme) => [theme.id, theme.name]))} />
            </SelectTrigger>
            <SelectContent>
              {CODE_THEMES.map((theme) => <SelectItem key={theme.id} value={theme.id}>{theme.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsSection>
      {/* Take effect at once, like the theme above. */}
      <SettingsSection title="Sidebar" onRevert={onRevertSidebar} revertLabel="Show indent guides and turn translucency off">
        <SettingsSwitchRow
          id="settings-tree-guides"
          label="Indent guides"
          description="Lines that connect a folder to what it contains."
          checked={showTreeGuides}
          onCheckedChange={setTreeGuides}
        />
        {/* Only the macOS window has a material behind it to show through. */}
        {platform === 'darwin' ? (
          <SettingsRow label="Translucency" htmlFor="settings-sidebar-translucency" description="Lets what is behind the window show through the sidebar and frame, blurred. Notes stay opaque.">
            <Select value={translucency} onValueChange={(value) => { if (isSidebarTranslucency(value)) setSidebarTranslucency(value); }}>
              <SelectTrigger id="settings-sidebar-translucency" aria-label="Translucency" className="w-full">
                <SelectLabelValue value={translucency} labels={SIDEBAR_TRANSLUCENCY_LABELS} />
              </SelectTrigger>
              <SelectContent>
                {SIDEBAR_TRANSLUCENCY_LEVELS.map((level) => <SelectItem key={level} value={level}>{SIDEBAR_TRANSLUCENCY_LABELS[level]}</SelectItem>)}
              </SelectContent>
            </Select>
          </SettingsRow>
        ) : null}
      </SettingsSection>
      <SettingsSection title="Window" onRevert={onRevertWindow} revertLabel="Show the status line">
        <SettingsSwitchRow
          id="settings-status-line"
          label="Status line"
          description="The line along the bottom of the window, with keys you can press."
          checked={showStatusLine}
          onCheckedChange={setStatusLineVisible}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
