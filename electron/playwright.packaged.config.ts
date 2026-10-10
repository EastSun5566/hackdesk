import { defineConfig } from '@playwright/test';
import smokeConfig from './playwright.config';

export default defineConfig(smokeConfig, {
  testIgnore: [],
  testMatch: '**/packaged-startup.spec.ts',
});
