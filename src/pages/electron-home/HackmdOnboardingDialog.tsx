import { useReducer, type FormEvent, type ReactNode } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  TerminalSquare,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { HackmdCliConfigStatus, ImportHackmdCliTokenResult, UserSummary } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

import { SettingsRow, SettingsSecretInput } from './SettingsPrimitives';
import {
  FOCUS_RING_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from './ui';

const ONBOARDING_TOKEN_ID = 'hackmd-onboarding-token';
const ONBOARDING_TOKEN_STATUS_ID = 'hackmd-onboarding-token-status';

type OnboardingStep = 'connect' | 'complete';
type OnboardingStatus = {
  kind: 'idle' | 'validating' | 'saving' | 'importing' | 'error';
  message: string;
};
type OnboardingState = {
  connectedUser: UserSummary | null;
  status: OnboardingStatus;
  step: OnboardingStep;
  token: string;
  tokenVisible: boolean;
};
type OnboardingAction =
  | { type: 'reset' }
  | { type: 'set-connected-user'; user: UserSummary | null }
  | { type: 'set-status'; status: OnboardingStatus }
  | { type: 'set-step'; step: OnboardingStep }
  | { type: 'set-token'; token: string }
  | { type: 'set-token-visible'; visible: boolean };

const initialOnboardingState: OnboardingState = {
  connectedUser: null,
  status: { kind: 'idle', message: '' },
  step: 'connect',
  token: '',
  tokenVisible: false,
};

function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
  case 'reset':
    return initialOnboardingState;
  case 'set-connected-user':
    return { ...state, connectedUser: action.user };
  case 'set-status':
    return { ...state, status: action.status };
  case 'set-step':
    return { ...state, step: action.step };
  case 'set-token':
    return { ...state, token: action.token };
  case 'set-token-visible':
    return { ...state, tokenVisible: action.visible };
  }
}

export type HackmdOnboardingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hackmdCliConfig: HackmdCliConfigStatus;
  onChooseLocalVault: () => Promise<void>;
  onImportHackmdCliToken: () => Promise<ImportHackmdCliTokenResult>;
  onOpenHackmdSettings: () => void;
  onSaveToken: (token: string) => Promise<void>;
  onSetupLater: () => Promise<void> | void;
  onValidateToken: (token: string) => Promise<UserSummary>;
};

export function HackmdOnboardingDialog({
  hackmdCliConfig,
  open,
  onChooseLocalVault,
  onImportHackmdCliToken,
  onOpenChange,
  onOpenHackmdSettings,
  onSaveToken,
  onSetupLater,
  onValidateToken,
}: HackmdOnboardingDialogProps) {
  const [state, dispatch] = useReducer(onboardingReducer, initialOnboardingState);
  const { connectedUser, status, step, token, tokenVisible } = state;
  const normalizedToken = token.trim();
  const busy = status.kind === 'validating' || status.kind === 'saving' || status.kind === 'importing';
  const canImportHackmdCliToken = hackmdCliConfig.hasAccessToken && !hackmdCliConfig.hasCustomEndpoint;

  const reset = () => {
    dispatch({ type: 'reset' });
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const handleSetupLater = () => {
    Promise.resolve(onSetupLater())
      .then(close)
      .catch((error) => {
        dispatch({ type: 'set-status', status: {
          kind: 'error',
          message: error instanceof Error ? error.message : 'Failed to defer setup.',
        } });
      });
  };
  const handleChooseLocalVault = () => {
    dispatch({ type: 'set-status', status: { kind: 'saving', message: 'Opening folder picker...' } });
    onChooseLocalVault()
      .then(close)
      .catch((error) => {
        dispatch({ type: 'set-status', status: {
          kind: 'error',
          message: error instanceof Error ? error.message : 'Failed to open local vault.',
        } });
      });
  };

  const handleSubmitToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizedToken || busy) {
      return;
    }

    dispatch({ type: 'set-status', status: { kind: 'validating', message: 'Testing token...' } });
    onValidateToken(normalizedToken)
      .then((user) => {
        dispatch({ type: 'set-connected-user', user });
        dispatch({ type: 'set-status', status: { kind: 'saving', message: 'Saving token locally...' } });
        return onSaveToken(normalizedToken);
      })
      .then(() => {
        dispatch({ type: 'set-status', status: { kind: 'idle', message: '' } });
        dispatch({ type: 'set-step', step: 'complete' });
      })
      .catch((error) => {
        dispatch({ type: 'set-status', status: {
          kind: 'error',
          message: error instanceof Error ? error.message : 'Failed to connect to HackMD.',
        } });
      });
  };

  const handleImportHackmdCliToken = () => {
    if (!canImportHackmdCliToken || busy) {
      return;
    }

    dispatch({
      type: 'set-status',
      status: { kind: 'importing', message: 'Importing token from hackmd-cli...' },
    });
    onImportHackmdCliToken()
      .then((result) => {
        dispatch({ type: 'set-connected-user', user: result.user });
        dispatch({ type: 'set-status', status: { kind: 'idle', message: '' } });
        dispatch({ type: 'set-step', step: 'complete' });
      })
      .catch((error) => {
        dispatch({ type: 'set-step', step: 'connect' });
        dispatch({ type: 'set-status', status: {
          kind: 'error',
          message: error instanceof Error ? error.message : 'Failed to import hackmd-cli token.',
        } });
      });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && !busy) {
        close();
      }
    }}>
      <DialogContent className="w-[min(440px,calc(100dvw-2rem))] overflow-hidden p-0">
        {step === 'connect' ? (
          <OnboardingStepShell
            icon={<KeyRound aria-hidden="true" className="h-8 w-8" />}
            title="Connect HackMD"
            description="Import your hackmd-cli token or paste a HackMD API token. HackDesk tests it before saving."
          >
            <HackmdCliImportCard
              config={hackmdCliConfig}
              busy={busy}
              onImport={handleImportHackmdCliToken}
            />
            <form id="hackmd-onboarding-token-form" className="mt-4 space-y-4" onSubmit={handleSubmitToken}>
              <SettingsRow
                label="HackMD API Token"
                htmlFor={ONBOARDING_TOKEN_ID}
              >
                <SettingsSecretInput
                  id={ONBOARDING_TOKEN_ID}
                  name="hackmd-api-token"
                  visible={tokenVisible}
                  onVisibleChange={(visible) => dispatch({ type: 'set-token-visible', visible })}
                  value={token}
                  onChange={(event) => {
                    dispatch({ type: 'set-token', token: event.target.value });
                    dispatch({ type: 'set-status', status: { kind: 'idle', message: '' } });
                  }}
                  placeholder="Paste token"
                  autoComplete="off"
                  required
                  aria-describedby={ONBOARDING_TOKEN_STATUS_ID}
                  aria-invalid={status.kind === 'error'}
                />
              </SettingsRow>

              <div className="flex items-start justify-between gap-3">
                <p
                  id={ONBOARDING_TOKEN_STATUS_ID}
                  aria-live="polite"
                  className={cn(
                    'min-h-5 text-xs leading-5',
                    status.kind === 'error' ? 'text-destructive-default' : 'text-text-subtle',
                  )}
                >
                  {status.message}
                </p>
                <button
                  type="button"
                  className={cn('inline-flex shrink-0 items-center gap-1 text-xs text-text-subtle transition-colors hover:text-text-default', FOCUS_RING_CLASS)}
                  onClick={onOpenHackmdSettings}
                >
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  Open HackMD settings
                </button>
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={!normalizedToken || busy}
                  className={cn(PRIMARY_BUTTON_CLASS, 'w-full justify-center')}
                >
                  {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
                  {status.kind === 'saving'
                    ? 'Saving...'
                    : status.kind === 'validating'
                      ? 'Testing...'
                      : status.kind === 'importing'
                        ? 'Importing...'
                        : 'Connect'}
                </button>
              </div>
            </form>
            <div className="mt-5 grid gap-2 border-t border-border-default pt-4">
              <button
                type="button"
                disabled={busy}
                className={cn(SECONDARY_BUTTON_CLASS, 'w-full justify-center disabled:pointer-events-none disabled:opacity-50')}
                onClick={handleChooseLocalVault}
              >
                {status.message === 'Opening folder picker...' ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
                Open local folder
              </button>
              <button
                type="button"
                disabled={busy}
                className={cn(
                  'inline-flex h-9 items-center justify-center rounded-md px-3 text-sm text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default disabled:pointer-events-none disabled:opacity-50',
                  FOCUS_RING_CLASS,
                )}
                onClick={handleSetupLater}
              >
                Setup later
              </button>
            </div>
          </OnboardingStepShell>
        ) : null}

        {step === 'complete' ? (
          <OnboardingStepShell
            icon={<CheckCircle2 aria-hidden="true" className="h-8 w-8 text-success-default" />}
            title="HackMD connected"
            description={connectedUser
              ? `Connected as ${connectedUser.name} (@${connectedUser.username}).`
              : 'Your HackMD API token is ready.'}
          >
            <button
              type="button"
              className={cn(PRIMARY_BUTTON_CLASS, 'mt-2 w-full justify-center')}
              onClick={close}
            >
              Start using HackDesk
            </button>
          </OnboardingStepShell>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function HackmdCliImportCard({
  busy,
  config,
  onImport,
}: {
  busy: boolean;
  config: HackmdCliConfigStatus;
  onImport: () => void;
}) {
  if (!config.hasAccessToken) {
    return null;
  }

  const unsupportedCustomEndpoint = config.hasCustomEndpoint;

  return (
    <div className="rounded-lg border border-border-default bg-background-muted p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-default">
          <TerminalSquare aria-hidden="true" className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-default">hackmd-cli token found</p>
          <p className="mt-1 text-xs leading-5 text-text-subtle">
            Use the token from <code className="font-mono">hackmd-cli login</code>.
          </p>
          {unsupportedCustomEndpoint ? (
            <p className="mt-2 text-xs leading-5 text-warning-default">
              Custom endpoints are not imported in this version.
            </p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        disabled={busy || unsupportedCustomEndpoint}
        className={cn(
          PRIMARY_BUTTON_CLASS,
          'mt-3 w-full justify-center disabled:pointer-events-none disabled:opacity-50',
        )}
        onClick={onImport}
      >
        Import token
      </button>
    </div>
  );
}

function OnboardingStepShell({
  children,
  description,
  icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="p-6">
      <DialogHeader className="items-center text-center">
        <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-default">
          {icon}
        </div>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="max-w-sm">{description}</DialogDescription>
      </DialogHeader>
      <div className="mt-6">{children}</div>
    </div>
  );
}
