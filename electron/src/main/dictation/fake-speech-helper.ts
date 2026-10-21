import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type FakeSpeechMode = 'ok' | 'denied' | 'crash';

/**
 * A stand-in for `hackdesk-speech`: hears "Hello world." at once, then " Second line." once told
 * to stop. `denied` fails like a refused microphone; `crash` exits mid-recording.
 */
const FAKE_SPEECH_HELPER = String.raw`
const [command, , locale] = process.argv.slice(2);
const out = (value) => process.stdout.write(JSON.stringify(value) + '\n');
if (command === 'status') {
  out({ type: 'status', available: true, locales: ['en-US', 'zh-TW'], installed: ['en-US'], suggested: 'en-US' });
  process.exit(0);
}
if (command === 'install') {
  out({ type: 'progress', fraction: 0.5 });
  setTimeout(() => { out({ type: 'installed', locale }); process.exit(0); }, 20);
  return;
}
if (command !== 'transcribe') { out({ type: 'error', code: 'usage', message: 'Unknown command.' }); process.exit(1); }
if (MODE === 'denied') {
  out({ type: 'error', code: 'microphone-denied', message: 'HackDesk does not have microphone access.' });
  process.exit(1);
}
out({ type: 'ready', locale: locale || 'en-US' });
out({ type: 'level', value: 0.4 });
out({ type: 'volatile', text: 'Hello' });
out({ type: 'final', text: 'Hello world.' });
out({ type: 'volatile', text: ' Second' });
if (MODE === 'crash') { process.stderr.write('audio engine failed\n', () => process.exit(3)); return; }
let buffer = '';
let finished = false;
const finish = (type) => {
  if (finished) return;
  finished = true;
  if (type === 'cancel') out({ type: 'cancelled' });
  else {
    out({ type: 'final', text: ' Second line.' });
    out({ type: 'done', text: 'Hello world. Second line.' });
  }
  process.exit(0);
};
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  for (const line of buffer.split('\n').slice(0, -1)) {
    const type = JSON.parse(line).type;
    if (type === 'stop' || type === 'cancel') finish(type);
  }
  buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
});
process.stdin.on('end', () => finish('stop'));
`;

export async function createFakeSpeechHelper(mode: FakeSpeechMode = 'ok') {
  const directory = await mkdtemp(join(tmpdir(), 'hackdesk-fake-speech-'));
  const executable = join(directory, 'hackdesk-speech');
  // Wrapped in a function so the script can return early, like the real helper's commands.
  await writeFile(executable, `#!${process.execPath}\nconst MODE = ${JSON.stringify(mode)};\n(() => {${FAKE_SPEECH_HELPER}})();\n`);
  await chmod(executable, 0o755);
  return { directory, executable };
}
