import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const ELECTRON_RENDERER_URL = 'http://localhost:1421';
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'pnpm.cmd' : 'pnpm';
const electronCommand = isWindows ? 'electron.cmd' : 'electron';

type RunOptions = {
  env?: NodeJS.ProcessEnv;
  ipc?: boolean;
};

const children = new Set<ChildProcess>();

function run(command: string, args: readonly string[], options: RunOptions = {}): ChildProcess {
  const child = spawn(command, args, {
    stdio: options.ipc ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit',
    env: {
      ...process.env,
      ...options.env,
    },
  });

  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

function stopAll() {
  for (const child of children) {
    child.kill();
  }
}

async function waitForUrl(url: string, timeoutMs = 30_000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve(response.statusCode !== undefined && response.statusCode < 500);
      });

      request.on('error', () => resolve(false));
      request.setTimeout(1000, () => {
        request.destroy();
        resolve(false);
      });
    });

    if (ok) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

export async function waitForDevReady(renderer: ChildProcess, builder: ChildProcess, rendererReady: Promise<void>): Promise<void> {
  const cleanup = new AbortController();
  const signal = cleanup.signal;
  const built = once(builder, 'message', { signal }).then(([message]) => {
    if (message !== 'electron-build-ready') throw new Error('Electron builder sent an invalid readiness message.');
  });
  const exited = (child: ChildProcess, name: string) => once(child, 'exit', { signal }).then(([code, exitSignal]) => {
    throw new Error(`${name} exited before startup (code ${code}, signal ${exitSignal}).`);
  });
  try {
    await Promise.race([
      Promise.all([rendererReady, built]),
      exited(renderer, 'Renderer dev server'),
      exited(builder, 'Electron builder'),
    ]);
  } finally {
    cleanup.abort();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.on('SIGINT', () => {
    stopAll();
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    stopAll();
    process.exit(143);
  });

  const renderer = run(npmCommand, ['exec', 'vite'], {
    env: {
      HACKDESK_VITE_PORT: '1421',
    },
  });
  const builder = run(process.execPath, ['scripts/electron-build.ts', '--watch'], { ipc: true });

  waitForDevReady(renderer, builder, waitForUrl(ELECTRON_RENDERER_URL))
    .then(async () => {
      const electron = run(electronCommand, ['.'], {
        env: {
          HACKDESK_ELECTRON_DEV_SERVER_URL: ELECTRON_RENDERER_URL,
        },
      });

      const [code] = await once(electron, 'exit');
      stopAll();
      process.exit(typeof code === 'number' ? code : 0);
    })
    .catch((error) => {
      console.error(error);
      stopAll();
      process.exit(1);
    });
}
