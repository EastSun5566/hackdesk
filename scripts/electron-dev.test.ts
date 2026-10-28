import { EventEmitter, once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, onTestFailed, vi } from 'vitest';
import { waitForDevReady } from './electron-dev';

const child = () => new EventEmitter() as unknown as ChildProcess;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe('Electron dev startup', () => {
  it.each(['builder', 'renderer'])('does not launch while %s is still starting', async last => {
    const renderer = child();
    const builder = child();
    const url = deferred();
    const launch = vi.fn();
    const pending = waitForDevReady(renderer, builder, url.promise).then(launch);
    if (last === 'builder') url.resolve();
    else builder.emit('message', 'electron-build-ready');
    await Promise.resolve();
    expect(launch).not.toHaveBeenCalled();
    if (last === 'builder') builder.emit('message', 'electron-build-ready');
    else url.resolve();
    await pending;
    expect(launch).toHaveBeenCalledOnce();
    for (const entry of [renderer, builder]) {
      expect(entry.listenerCount('exit')).toBe(0);
      expect(entry.listenerCount('error')).toBe(0);
      expect(entry.listenerCount('message')).toBe(0);
    }
  });

  it.each(['builder', 'renderer'])('does not launch after an early %s exit', async source => {
    const renderer = child();
    const builder = child();
    const launch = vi.fn();
    const pending = expect(waitForDevReady(renderer, builder, Promise.resolve()).then(launch)).rejects.toThrow('exited before startup');
    (source === 'builder' ? builder : renderer).emit('exit', 1, null);
    await pending;
    expect(launch).not.toHaveBeenCalled();
  });

  it('propagates a failed spawn and rejects invalid readiness messages', async () => {
    const renderer = child();
    const builder = child();
    const failedSpawn = expect(waitForDevReady(renderer, builder, Promise.resolve())).rejects.toThrow('spawn failed');
    builder.emit('error', new Error('spawn failed'));
    await failedSpawn;
    const invalid = expect(waitForDevReady(renderer, builder, Promise.resolve())).rejects.toThrow('invalid readiness message');
    builder.emit('message', 'old output exists');
    await invalid;
  });
});

describe('real Electron watch build', () => {
  // Includes a cold Node/esbuild process, initial build, rebuild and cleanup on Windows.
  it.each(['clean', 'stale', 'invalid'])('handles %s outputs before allowing startup', async mode => {
    const root = await mkdtemp(join(tmpdir(), 'hackdesk-dev-build-'));
    const targets = [
      ['electron/src/main/index.ts', 'electron/dist/main.cjs'],
      ['electron/src/preload/index.ts', 'electron/dist/preload.cjs'],
      ['electron/src/preload/quick-capture.ts', 'electron/dist/quick-capture-preload.cjs'],
      ['electron/src/preload/presentation.ts', 'electron/dist/presentation-preload.cjs'],
    ];
    for (const [source, output] of targets) {
      await mkdir(dirname(join(root, source)), { recursive: true });
      await writeFile(join(root, source), `console.log("${source}");`);
      if (mode !== 'clean') {
        await mkdir(dirname(join(root, output)), { recursive: true });
        await writeFile(join(root, output), 'stale output');
      }
    }
    if (mode === 'invalid') await writeFile(join(root, targets[1][0]), 'const broken = ;');
    const builder = spawn(process.execPath, [resolve(import.meta.dirname, 'electron-build.ts'), '--watch'], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env, CI: 'true' },
    });
    const exited = once(builder, 'close');
    let stderr = '';
    builder.stdout!.resume();
    builder.stderr!.on('data', chunk => { stderr += chunk.toString(); });
    onTestFailed(() => {
      console.error(`Watch build (${mode}): exitCode=${builder.exitCode}, signalCode=${builder.signalCode}\n${stderr}`);
    });
    try {
      const ready = waitForDevReady(child(), builder, Promise.resolve());
      if (mode === 'invalid') {
        await expect(ready).rejects.toThrow('Electron builder exited before startup');
        await exited;
        expect(builder.exitCode).toBe(1);
        expect(stderr).toContain('Initial Electron build failed');
        expect(await readFile(join(root, targets[1][1]), 'utf8')).toBe('stale output');
      } else {
        await ready;
        for (const [source, output] of targets) expect(await readFile(join(root, output), 'utf8')).toContain(source);
        // The same watcher still rebuilds after the initial gate has settled.
        await writeFile(join(root, targets[0][0]), 'console.log("updated fixture");');
        await vi.waitFor(async () => expect(await readFile(join(root, targets[0][1]), 'utf8')).toContain('updated fixture'), { timeout: 3000 });
      }
    } finally {
      if (builder.exitCode === null && builder.signalCode === null) builder.kill();
      await exited;
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);
});
