import { spawn } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';

const ELECTRON_RENDERER_URL = 'http://localhost:1421';
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'pnpm.cmd' : 'pnpm';
const electronCommand = isWindows ? 'electron.cmd' : 'electron';

const children = new Set();

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
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

async function waitForUrl(url, timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const ok = await new Promise((resolve) => {
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

process.on('SIGINT', () => {
  stopAll();
  process.exit(130);
});

process.on('SIGTERM', () => {
  stopAll();
  process.exit(143);
});

const renderer = run(npmCommand, ['run', 'frontend:dev'], {
  env: {
    HACKDESK_VITE_PORT: '1421',
  },
});
const builder = run(process.execPath, ['scripts/electron-build.js', '--watch']);

Promise.race([
  once(renderer, 'exit').then(([code]) => {
    throw new Error(`Renderer dev server exited with code ${code}`);
  }),
  once(builder, 'exit').then(([code]) => {
    throw new Error(`Electron builder exited with code ${code}`);
  }),
  waitForUrl(ELECTRON_RENDERER_URL),
])
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
