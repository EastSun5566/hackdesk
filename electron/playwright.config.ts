import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const isCI = !!process.env.CI;
// Local runs keep the app's windows invisible, unfocused and out of the Dock (see
// electron/src/main/e2e-background-windows.ts), so they can run in parallel without taking over
// the screen or the keyboard. HACKDESK_E2E_FOREGROUND=1 shows them, for watching or debugging.
const runInBackground = !isCI && process.env.HACKDESK_E2E_FOREGROUND !== '1';
if (runInBackground) process.env.HACKDESK_E2E_BACKGROUND = '1';

// Pin the Playwright report and test-results dirs to the repo root so the
// build.yml artifact-upload paths (`playwright-report`, `test-results`) keep
// resolving regardless of which directory Playwright decides to walk up to
// for the nearest package.json. Without this, an `electron/package.json`
// or a runner-level `PLAYWRIGHT_*_OUTPUT_DIR` env var would silently move
// both dirs and the uploads would go up empty.
const repoRoot = resolve(import.meta.dirname, '..');

export default defineConfig({
  testDir: './e2e',
  // packaged-startup.spec.ts needs a packaged binary on disk; the regular
  // `pnpm run test:smoke` (run on ubuntu-latest by the quality job) has no
  // packaged binary. Exclude it here so it only runs from the `package-smoke`
  // job after `pnpm run package:check` produces the binary on the same runner.
  testIgnore: '**/packaged-startup.spec.ts',
  // Every test launches its own app with its own home directory, so tests can run side by side.
  // CI stays serial on its small runners; visible local runs too, since windows fight for focus.
  fullyParallel: runInBackground,
  workers: runInBackground ? 4 : 1,
  // Under parallel load a few timing-sensitive UI tests occasionally miss; one retry keeps a
  // local run green while the report still lists them as flaky.
  retries: runInBackground ? 1 : 0,
  // Refuse committed `.only` calls in CI so a forgotten focus on a single
  // test cannot ship under the guise of a full suite. Local runs still
  // allow it (so a developer can debug one test without ceremony).
  forbidOnly: isCI,
  // HTML report only in CI so it can be uploaded as a workflow artifact.
  // `list` is friendlier in a local terminal.
  timeout: 60_000,
  use: {
    trace: 'retain-on-failure',
  },
  outputDir: resolve(repoRoot, 'test-results'),
  reporter: isCI
    ? [['html', { outputFolder: resolve(repoRoot, 'playwright-report'), open: 'never' }]]
    : 'list',
});
