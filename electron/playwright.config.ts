import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const isCI = !!process.env.CI;

// Pin the Playwright report and test-results dirs to the repo root so the
// build.yml artifact-upload paths (`playwright-report`, `test-results`) keep
// resolving regardless of which directory Playwright decides to walk up to
// for the nearest package.json. Without this, an `electron/package.json`
// or a runner-level `PLAYWRIGHT_*_OUTPUT_DIR` env var would silently move
// both dirs and the uploads would go up empty.
const repoRoot = resolve(import.meta.dirname, '..');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
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
