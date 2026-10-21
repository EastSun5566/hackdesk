import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const SPEECH_HELPER_SOURCE = join(root, 'native/speech-helper/main.swift');
const SPEECH_HELPER_OUTPUT = join(root, 'build/native/hackdesk-speech');
/** SpeechAnalyzer first shipped in the macOS 26 SDK. */
const MINIMUM_SDK = 26;

function isFresh() {
  try {
    return statSync(SPEECH_HELPER_OUTPUT).mtimeMs >= statSync(SPEECH_HELPER_SOURCE).mtimeMs;
  } catch {
    return false;
  }
}

/**
 * Builds the universal dictation helper on macOS. Elsewhere, or with an SDK older than macOS 26,
 * it skips and dictation reports itself unavailable, unless HACKDESK_REQUIRE_SPEECH_HELPER=1
 * (release builds) turns the skip into a failure.
 */
export function buildSpeechHelper({ required = process.env.HACKDESK_REQUIRE_SPEECH_HELPER === '1' } = {}) {
  const skip = (reason: string) => {
    if (required) throw new Error(`The dictation helper is required but cannot be built: ${reason}`);
    console.warn(`Skipping the dictation helper: ${reason}`);
  };
  if (process.platform !== 'darwin') return skip('it needs macOS.');
  let sdk: string;
  try {
    sdk = execFileSync('xcrun', ['--show-sdk-version'], { encoding: 'utf8' }).trim();
  } catch {
    return skip('Xcode command line tools are not installed.');
  }
  if (Number.parseInt(sdk, 10) < MINIMUM_SDK) return skip(`it needs the macOS ${MINIMUM_SDK} SDK; this Mac has ${sdk}.`);
  if (isFresh()) return;

  const work = mkdtempSync(join(tmpdir(), 'hackdesk-speech-'));
  try {
    const slices = ['arm64', 'x86_64'].map((arch) => {
      const output = join(work, arch);
      execFileSync('xcrun', [
        'swiftc', '-parse-as-library', '-O', '-target', `${arch}-apple-macos${MINIMUM_SDK}`, SPEECH_HELPER_SOURCE, '-o', output,
      ], { stdio: 'inherit' });
      return output;
    });
    mkdirSync(join(SPEECH_HELPER_OUTPUT, '..'), { recursive: true });
    execFileSync('lipo', ['-create', ...slices, '-output', SPEECH_HELPER_OUTPUT], { stdio: 'inherit' });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    buildSpeechHelper();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
