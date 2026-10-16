import type { AiProviderStatus } from '../../../../src/lib/ai';

export type ProviderLaunch = {
  executable: string;
  env: NodeJS.ProcessEnv;
  /** A private, empty folder: never the user's vault or home. */
  cwd: string;
};

export type ProviderProbe = Pick<AiProviderStatus, 'phase' | 'message' | 'version' | 'plan' | 'models' | 'usage'>;

export type ProviderTurn = {
  model: string | null;
  system: string;
  prompt: string;
  signal: AbortSignal;
  onDelta: (text: string) => void;
  /** How long a CLI may print nothing before the turn fails; tests shorten it. */
  stallTimeoutMs?: number;
};

export type AiProviderAdapter = {
  probe: (launch: ProviderLaunch, signal?: AbortSignal) => Promise<ProviderProbe>;
  /** Resolves when the answer is complete; rejects with a user-facing message otherwise. */
  stream: (launch: ProviderLaunch, turn: ProviderTurn) => Promise<void>;
  /** Starts anything slow ahead of a turn the user is about to ask for. */
  prewarm?: (launch: ProviderLaunch) => Promise<void>;
  dispose?: () => void;
};

export class AiTurnCancelledError extends Error {
  constructor() {
    super('The AI request was cancelled.');
    this.name = 'AiTurnCancelledError';
  }
}
