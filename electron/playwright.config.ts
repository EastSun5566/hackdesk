import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

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
	reporter: isCI ? 'html' : 'list',
	timeout: 60_000,
	use: {
		trace: 'retain-on-failure',
	},
});
