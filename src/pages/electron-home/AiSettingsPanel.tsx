import { useCallback, useEffect, useRef, useState } from 'react';
import { Meter } from '@base-ui/react/meter';
import { Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectLabelValue, SelectTrigger } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  AI_PROVIDER_COMMANDS,
  AI_PROVIDER_IDS,
  AI_PROVIDER_TITLES,
  AI_SIGN_IN_COMMANDS,
  type AiProviderId,
  type AiProviderStatus,
  type AiUsageWindow,
  getAiErrorMessage,
} from '@/lib/ai';
import { getHackDeskAPI } from '@/lib/electron-api';
import type { AiSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';

import { SettingsSection } from './SettingsPrimitives';

const DEFAULT_MODEL_VALUE = '__default__';
const PROVIDER_VENDORS: Record<AiProviderId, string> = { codex: 'OpenAI', claude: 'Anthropic' };

export function describeAiProviderStatus(status: AiProviderStatus | undefined) {
  if (!status) return 'Checking…';
  switch (status.phase) {
    case 'checking': return 'Checking…';
    case 'not-installed': return 'Not installed';
    case 'sign-in-required': return 'Sign in required';
    case 'failed': return 'Needs attention';
    case 'ready': return [status.plan ?? 'Ready', `${status.models.length} models`].join(' · ');
    default: return status.enabled ? 'Not checked yet' : 'Off';
  }
}

function formatWindow(minutes: number | null) {
  if (!minutes) return 'Usage window';
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}-day window`;
  if (minutes % 60 === 0) return `${minutes / 60}-hour window`;
  return `${minutes}-minute window`;
}

function formatReset(resetsAt: number | null) {
  if (!resetsAt) return null;
  const minutes = Math.max(0, Math.round((resetsAt * 1000 - Date.now()) / 60_000));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const parts = days ? [`${days} d`, `${hours} hr`] : hours ? [`${hours} hr`, `${minutes % 60} min`] : [`${minutes} min`];
  return `Resets in ${parts.join(' ')}`;
}

function UsageRow({ window }: { window: AiUsageWindow }) {
  const left = Math.round(100 - window.usedPercent);
  const reset = formatReset(window.resetsAt);
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div>
        <p className="font-medium">{formatWindow(window.windowMinutes)}</p>
        {reset ? <p className="text-xs text-text-subtle">{reset}</p> : null}
      </div>
      <Meter.Root value={left} aria-label={`${formatWindow(window.windowMinutes)} remaining`} className="flex items-center gap-3">
        <Meter.Track className="h-1.5 w-32 overflow-hidden rounded-full bg-background-selected">
          <Meter.Indicator className="h-full rounded-full bg-primary-default" />
        </Meter.Track>
        <span className="w-16 text-right text-xs tabular-nums text-text-subtle">{left}% left</span>
      </Meter.Root>
    </div>
  );
}

function ProviderCard({
  id,
  status,
  settings,
  isDefault,
  busy,
  onEnabledChange,
  onModelChange,
  onCommandPathChange,
  onRefresh,
}: {
  id: AiProviderId;
  status: AiProviderStatus | undefined;
  settings: AiSettings['providers'][AiProviderId];
  isDefault: boolean;
  busy: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onModelChange: (model: string | null) => void;
  onCommandPathChange: (path: string | null) => void;
  onRefresh: () => void;
}) {
  const title = AI_PROVIDER_TITLES[id];
  const switchId = `settings-ai-${id}-enabled`;
  const modelId = `settings-ai-${id}-model`;
  const pathId = `settings-ai-${id}-command`;
  const [commandPath, setCommandPath] = useState(settings.commandPath ?? '');
  const checking = status?.phase === 'checking';
  const modelLabels: Record<string, string> = {
    [DEFAULT_MODEL_VALUE]: 'Default',
    ...Object.fromEntries((status?.models ?? []).map(model => [model.id, model.label])),
  };
  if (settings.model && !modelLabels[settings.model]) modelLabels[settings.model] = settings.model;

  return (
    <div className="rounded-lg border border-border-default">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <label htmlFor={switchId} className="text-sm font-semibold">
            {title}
            {isDefault ? <span className="ml-2 rounded-full bg-background-selected px-1.5 py-0.5 text-2xs font-medium text-text-subtle">Default</span> : null}
          </label>
          <p className="truncate text-xs text-text-subtle">
            {status?.command ? `Installed command · ${AI_PROVIDER_COMMANDS[id]}` : `${PROVIDER_VENDORS[id]} · ${AI_PROVIDER_COMMANDS[id]} command`}
            {' · '}
            {describeAiProviderStatus(status)}
          </p>
        </div>
        <Switch
          id={switchId}
          checked={settings.enabled}
          disabled={busy}
          onCheckedChange={checked => onEnabledChange(checked)}
        />
      </div>

      {settings.enabled || status?.phase === 'not-installed' ? (
        <div className="space-y-3 border-t border-border-default px-4 py-3">
          <div className="flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className={cn('font-medium', (status?.phase === 'failed' || status?.phase === 'sign-in-required') && 'text-destructive-default')}>
                {status?.phase === 'ready' ? 'Ready' : describeAiProviderStatus(status)}
              </p>
              <p className="text-xs leading-5 text-text-subtle" role={status?.phase === 'failed' ? 'alert' : undefined}>
                {status?.phase === 'sign-in-required'
                  ? `Run \`${AI_SIGN_IN_COMMANDS[id]}\` in a terminal, then refresh.`
                  : status?.message ?? (status?.version ? `${title} ${status.version}` : null)}
              </p>
            </div>
            <Button variant="secondary" size="sm" disabled={busy || checking} onClick={onRefresh}>
              {checking
                ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                : <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>

          {settings.enabled && status?.phase === 'ready' ? (
            <div className="grid gap-2 text-sm">
              <label htmlFor={modelId} className="font-medium">Model</label>
              <Select
                name={modelId}
                value={settings.model ?? DEFAULT_MODEL_VALUE}
                onValueChange={(value) => {
                  if (typeof value === 'string') onModelChange(value === DEFAULT_MODEL_VALUE ? null : value);
                }}
                items={Object.entries(modelLabels).map(([value, label]) => ({ value, label }))}
              >
                <SelectTrigger id={modelId} className="w-full">
                  <SelectLabelValue value={settings.model ?? DEFAULT_MODEL_VALUE} labels={modelLabels} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(modelLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {settings.enabled && status?.usage?.primary ? <UsageRow window={status.usage.primary} /> : null}
          {settings.enabled && status?.usage?.secondary ? <UsageRow window={status.usage.secondary} /> : null}

          <div className="grid gap-2 text-sm">
            <label htmlFor={pathId} className="font-medium">Command path</label>
            <span className="text-xs leading-5 text-text-subtle">
              Leave blank to find <code>{AI_PROVIDER_COMMANDS[id]}</code> the way your terminal does.
            </span>
            <Input
              id={pathId}
              value={commandPath}
              placeholder={status?.command ?? 'Automatic'}
              spellCheck={false}
              disabled={busy}
              onChange={event => setCommandPath(event.target.value)}
              onBlur={() => {
                const next = commandPath.trim() || null;
                if (next !== settings.commandPath) onCommandPathChange(next);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AiSettingsPanel({ active }: { active: boolean }) {
  const api = getHackDeskAPI();
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [statuses, setStatuses] = useState<Partial<Record<AiProviderId, AiProviderStatus>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkedRef = useRef(false);

  const refresh = useCallback(async (id: AiProviderId) => {
    if (!api?.ai) return;
    setStatuses(current => ({ ...current, [id]: { ...(current[id] ?? { id, enabled: false, message: null, version: null, command: null, plan: null, models: [], usage: null }), phase: 'checking' } }));
    try {
      const status = await api.ai.refreshProvider(id);
      setStatuses(current => ({ ...current, [id]: status }));
    } catch (refreshError) {
      setError(getAiErrorMessage(refreshError));
    }
  }, [api]);

  // Checked only once the tab is opened: an enabled provider's check starts its CLI.
  useEffect(() => {
    if (!active || checkedRef.current || !api?.ai) return;
    checkedRef.current = true;
    void api.settings.get().then(settings => setAiSettings(settings.ai ?? null));
    for (const id of AI_PROVIDER_IDS) void refresh(id);
  }, [active, api, refresh]);

  const save = async (next: AiSettings, refreshId?: AiProviderId) => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api.settings.update({ ai: next });
      setAiSettings(saved.ai ?? next);
      if (refreshId) await refresh(refreshId);
    } catch (saveError) {
      setError(getAiErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const updateProvider = (id: AiProviderId, patch: Partial<AiSettings['providers'][AiProviderId]>, refreshAfter = false) => {
    if (!aiSettings) return;
    const providers = { ...aiSettings.providers, [id]: { ...aiSettings.providers[id], ...patch } };
    const enabledIds = AI_PROVIDER_IDS.filter(providerId => providers[providerId].enabled);
    const defaultProvider = aiSettings.defaultProvider && providers[aiSettings.defaultProvider].enabled
      ? aiSettings.defaultProvider
      : enabledIds[0] ?? null;
    void save({ providers, defaultProvider }, refreshAfter ? id : undefined);
  };

  const handleEnabledChange = async (id: AiProviderId, enabled: boolean) => {
    if (enabled && api) {
      const title = AI_PROVIDER_TITLES[id];
      const { confirmed } = await api.app.confirm({
        title: `Turn on ${title}?`,
        message: `Let HackDesk run the ${AI_PROVIDER_COMMANDS[id]} command signed in on this computer?`,
        detail: `Text you send with AI actions goes to ${PROVIDER_VENDORS[id]} through your own ${title} account and counts toward its usage limits. HackDesk turns off its tools, never reads or stores its keys, and runs it in a private empty folder.`,
        confirmLabel: 'Turn On',
        cancelLabel: 'Cancel',
      });
      if (!confirmed) return;
    }
    updateProvider(id, { enabled }, true);
  };

  if (!api?.ai) {
    return <p className="text-sm text-text-subtle">AI providers are available in the HackDesk desktop app.</p>;
  }

  const enabledIds = aiSettings ? AI_PROVIDER_IDS.filter(id => aiSettings.providers[id].enabled) : [];
  const providerLabels = Object.fromEntries(enabledIds.map(id => [id, AI_PROVIDER_TITLES[id]]));

  return (
    <div className="space-y-6">
      <SettingsSection
        title="AI Providers"
        description="HackDesk uses the AI command-line tools already signed in on this computer. Turning one on lets HackDesk run it for AI actions; its keys are never read or stored."
      >
        {error ? <p role="alert" className="text-sm text-destructive-default">{error}</p> : null}
        {aiSettings ? AI_PROVIDER_IDS.map(id => (
          <ProviderCard
            key={id}
            id={id}
            status={statuses[id]}
            settings={aiSettings.providers[id]}
            isDefault={aiSettings.defaultProvider === id && enabledIds.length > 1}
            busy={busy}
            onEnabledChange={enabled => void handleEnabledChange(id, enabled)}
            onModelChange={model => updateProvider(id, { model })}
            onCommandPathChange={commandPath => updateProvider(id, { commandPath }, true)}
            onRefresh={() => void refresh(id)}
          />
        )) : (
          <p role="status" className="text-sm text-text-subtle">Loading…</p>
        )}
      </SettingsSection>

      {aiSettings && enabledIds.length > 1 ? (
        <SettingsSection title="Default provider" description="Used for AI actions unless you pick another one.">
          <Select
            name="settings-ai-default-provider"
            value={aiSettings.defaultProvider ?? enabledIds[0]}
            onValueChange={(value) => {
              if (typeof value === 'string' && enabledIds.includes(value as AiProviderId)) {
                void save({ ...aiSettings, defaultProvider: value as AiProviderId });
              }
            }}
            items={enabledIds.map(id => ({ value: id, label: AI_PROVIDER_TITLES[id] }))}
          >
            <SelectTrigger aria-label="Default AI provider" className="w-full">
              <SelectLabelValue value={aiSettings.defaultProvider ?? enabledIds[0]} labels={providerLabels} />
            </SelectTrigger>
            <SelectContent>
              {enabledIds.map(id => <SelectItem key={id} value={id}>{AI_PROVIDER_TITLES[id]}</SelectItem>)}
            </SelectContent>
          </Select>
        </SettingsSection>
      ) : null}
    </div>
  );
}
