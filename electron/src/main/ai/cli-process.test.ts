import { describe, expect, it } from 'vitest';

import { runCli } from './cli-process';

describe.skipIf(process.platform === 'win32')('runCli', () => {
  it('settles when the CLI exits while a background child still holds its output open', async () => {
    const started = Date.now();
    // The shell exits at once; the backgrounded sleep inherits stdout and keeps the pipe open.
    const result = await runCli('/bin/sh', ['-c', 'sleep 30 & echo ready'], { cwd: process.cwd(), env: process.env, timeoutMs: 10_000 });
    expect(result).toMatchObject({ code: 0, timedOut: false });
    expect(result.stdout).toBe('ready\n');
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
