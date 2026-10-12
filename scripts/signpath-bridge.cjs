const fs = require('node:fs/promises');
const { openSync, closeSync } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID, X509Certificate } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { gunzipSync } = require('node:zlib');

const roles = ['app', 'elevate', 'uninstaller', 'installer'];
const names = ['HackDesk.exe', 'elevate.exe', 'Uninstall-HackDesk.exe', 'HackDesk-Installer.exe'];
const configurations = ['windows-app-v1', 'windows-elevate-v1', 'windows-uninstaller-v1', 'windows-installer-v1'];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
const hashFile = async file => digest(await fs.readFile(file));
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
async function writeJson(file, value) {
  await fs.writeFile(`${file}.tmp`, JSON.stringify(value, null, 2), { flag: 'wx' });
  await fs.rename(`${file}.tmp`, file);
}
async function optionalJson(file) {
  try { return await json(file); } catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
}
function hostedWindows() {
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
    throw new Error('Signing requires a GitHub-hosted Windows runner.');
  }
}
function expectedPaths(session) {
  return [
    path.join(session.output, 'win-unpacked', 'HackDesk.exe'),
    path.join(session.output, 'win-unpacked', 'resources', 'elevate.exe'),
    path.join(session.output, `${path.basename(session.installer, 'exe')}__uninstaller.exe`),
    session.installer,
  ];
}
function roleIndex(role) {
  const index = roles.indexOf(role);
  if (index < 0) throw new Error('Unexpected signing role.');
  return index;
}
function validateRequest(session, request, role) {
  const index = roleIndex(role);
  if (request.nonce !== session.nonce || request.role !== role || request.source !== expectedPaths(session)[index] ||
      !/^[a-f0-9]{64}$/.test(request.unsignedSha256) || typeof request.id !== 'string') {
    throw new Error('Invalid or stale signing request.');
  }
}
function signingParameters(role, metadata) {
  roleIndex(role);
  if (role === 'elevate') return '';
  return ['productVersion', 'fileVersion'].map(name => {
    const value = metadata[name];
    if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)) throw new Error('Invalid PE version parameter.');
    // The pinned SignPath action expects one name: JSON-string pair per line.
    return `${name}: ${JSON.stringify(value)}`;
  }).join('\n');
}

// The builder owns file order; this hook never signs arbitrary paths or predicts a rename.
function createBridge(session, { timeoutMs = 40 * 60_000, pollMs = 500 } = {}) {
  let next = 0;
  return async function signFile(file, { hash = 'sha256', isNest = false, helperSource } = {}) {
    const source = path.resolve(file);
    if (hash !== 'sha256' || isNest || source !== expectedPaths(session)[next]) {
      throw new Error('Unexpected signing file, order, or digest.');
    }
    const info = await fs.lstat(source);
    if (!info.isFile() || info.isSymbolicLink() || path.resolve(await fs.realpath(source)).toLowerCase() !== source.toLowerCase()) {
      throw new Error('Signing input must be a regular file at its expected build path.');
    }
    const unsignedSha256 = await hashFile(source);
    if (next === 1 && (!helperSource || await hashFile(helperSource) !== unsignedSha256)) {
      throw new Error('Elevate helper does not match the verified NSIS toolset.');
    }
    const role = roles[next];
    const directory = path.join(session.root, role);
    await fs.mkdir(path.join(directory, 'unsigned'), { recursive: true });
    await fs.copyFile(source, path.join(directory, 'unsigned', names[next]));
    const request = { nonce: session.nonce, id: randomUUID(), role, source, unsignedSha256 };
    await writeJson(path.join(directory, 'request.json'), request);
    const deadline = Date.now() + timeoutMs;
    let response;
    while (!(response = await optionalJson(path.join(directory, 'response.json')))) {
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for verified ${role}.`);
      await pause(pollMs);
    }
    const signed = path.join(directory, 'signed', names[next]);
    if (response.nonce !== session.nonce || response.id !== request.id || response.status !== 'Valid' ||
        response.unsignedSha256 !== unsignedSha256 ||
        typeof response.certificateSha256 !== 'string' || typeof response.signedSha256 !== 'string' ||
        response.certificateSha256.toLowerCase() !== session.certificateSha256.toLowerCase() ||
        response.signedSha256.toLowerCase() !== await hashFile(signed)) {
      throw new Error('Invalid or stale verified signing response.');
    }
    if (await hashFile(source) !== unsignedSha256) throw new Error('Unsigned input changed while waiting for signing.');
    await fs.copyFile(signed, source);
    if (await hashFile(source) !== response.signedSha256.toLowerCase()) throw new Error('Signed replacement changed.');
    next++;
  };
}

async function sign(task, packager) {
  hostedWindows();
  const session = await json(path.join(process.env.SIGNPATH_DIRECTORY, 'session.json'));
  if (!sign.bridge) sign.bridge = createBridge(session);
  let helperSource;
  if (path.resolve(task.path) === expectedPaths(session)[1]) {
    // Version-pinned builder API: it downloads the toolset with its built-in checksum.
    const builderRequire = createRequire(require.resolve('electron-builder'));
    const { getNsisElevatePath } = builderRequire('app-builder-lib/out/toolsets/windows');
    helperSource = await getNsisElevatePath(packager.config.toolsets?.nsis);
  }
  await sign.bridge(task.path, { hash: task.hash, isNest: task.isNest, helperSource });
}

async function waitRequest(session, role) {
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const request = await optionalJson(path.join(session.root, role, 'request.json'));
    if (request) { validateRequest(session, request, role); return request; }
    const result = await optionalJson(path.join(session.root, 'build-result.json'));
    if (result) throw new Error(`Builder finished before ${role}: ${result.error || 'missing signing phase'}`);
    try { process.kill(session.pid, 0); } catch { throw new Error('Builder exited without a result.'); }
    await pause(500);
  }
  throw new Error(`Timed out waiting for ${role} input.`);
}
function powershell(script, args) {
  return execFileSync('pwsh', ['-NoProfile', '-File', path.join(__dirname, script), ...args], { encoding: 'utf8', timeout: 5 * 60_000 });
}
async function cli(command, role) {
  hostedWindows();
  const root = process.env.SIGNPATH_DIRECTORY;
  if (!root) throw new Error('Missing SIGNPATH_DIRECTORY.');
  if (command === 'start') {
    const pkg = require('../package.json');
    const output = path.join(root, 'build');
    const session = {
      root, nonce: randomUUID(), output,
      installer: path.join(output, `HackDesk-${pkg.version}-x64-test-certificate.exe`),
      certificateSha256: process.env.CERTIFICATE_SHA256,
    };
    if (!/^[a-fA-F0-9]{64}$/.test(session.certificateSha256 || '')) throw new Error('Missing certificate fingerprint.');
    const certificate = new X509Certificate(Buffer.from(process.env.CERTIFICATE_BASE64 || '', 'base64'));
    if (digest(certificate.raw) !== session.certificateSha256.toLowerCase() ||
        certificate.subject !== certificate.issuer || !certificate.verify(certificate.publicKey)) {
      throw new Error('Expected the pinned self-signed test certificate.');
    }
    // Fresh per-run directory; refuse leftovers rather than accepting stale responses.
    await fs.mkdir(root);
    await writeJson(path.join(root, 'session.json'), session);
    const logs = ['builder.stdout.log', 'builder.stderr.log'].map(name => openSync(path.join(root, name), 'w'));
    const child = spawn(process.execPath, [__filename, 'build'], { detached: true, stdio: ['ignore', ...logs] });
    logs.forEach(closeSync);
    session.pid = child.pid;
    child.unref();
    await writeJson(path.join(root, 'session.json'), session);
    return;
  }
  const session = await json(path.join(root, 'session.json'));
  if (command === 'build') {
    try {
      const { build, Platform, Arch } = require('electron-builder');
      const pkg = require('../package.json');
      const publisher = new X509Certificate(Buffer.from(process.env.CERTIFICATE_BASE64, 'base64')).subject.match(/^CN=(.+)$/m)?.[1];
      if (!publisher) throw new Error('Test certificate must identify its publisher.');
      const builderRequire = createRequire(require.resolve('electron-builder'));
      if (builderRequire('app-builder-lib/package.json').version !== '26.15.3') throw new Error('Revalidate signing order before upgrading electron-builder.');
      for (const key of ['CSC_LINK', 'WIN_CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_KEY_PASSWORD', 'ELECTRON_BUILDER_NSIS_DIR', 'ELECTRON_BUILDER_NSIS_RESOURCES_DIR']) delete process.env[key];
      await build({ targets: Platform.WINDOWS.createTarget('nsis', Arch.x64), publish: 'never', config: {
        ...pkg.build, directories: { ...pkg.build.directories, output: session.output }, forceCodeSigning: true,
        win: { ...pkg.build.win, artifactName: path.basename(session.installer), signtoolOptions: {
          sign: './scripts/signpath-bridge.cjs', signingHashAlgorithms: ['sha256'], publisherName: publisher,
        } },
      } });
      for (const item of roles) if (!await optionalJson(path.join(root, item, 'response.json'))) throw new Error(`Missing ${item} signature.`);
      await writeJson(path.join(root, 'build-result.json'), { success: true });
    } catch (error) {
      await writeJson(path.join(root, 'build-result.json'), { success: false, error: String(error) });
      throw error;
    }
    return;
  }
  if (command === 'prepare') {
    const request = await waitRequest(session, role);
    const index = roleIndex(role);
    const unsigned = path.join(root, role, 'unsigned', names[index]);
    if (await hashFile(unsigned) !== request.unsignedSha256) throw new Error('Staged input changed.');
    const metadata = JSON.parse(powershell('signpath-installer.ps1', ['-Action', 'Metadata', '-Path', unsigned]));
    if (role !== 'elevate' && (metadata.productName !== 'HackDesk' || !metadata.productVersion || !metadata.fileVersion)) throw new Error('Missing HackDesk PE metadata.');
    const outputs = {
      directory: path.join(root, role), filename: names[index], configuration: configurations[index],
    };
    for (const [key, value] of Object.entries(outputs)) {
      if (/[\r\n]/.test(value)) throw new Error('Invalid action output.');
      await fs.appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
    const delimiter = randomUUID();
    await fs.appendFile(process.env.GITHUB_OUTPUT, `parameters<<${delimiter}\n${signingParameters(role, metadata)}\n${delimiter}\n`);
    return;
  }
  if (command === 'accept') {
    for (const key of ['UNSIGNED_ARTIFACT_ID', 'SIGNING_REQUEST_ID', 'SIGNING_REQUEST_URL']) {
      if (!process.env[key]) throw new Error(`Missing signing evidence: ${key}`);
    }
    const index = roleIndex(role);
    const directory = path.join(root, role);
    const request = await json(path.join(directory, 'request.json'));
    validateRequest(session, request, role);
    const signed = path.join(directory, 'signed', names[index]);
    const files = await fs.readdir(path.join(directory, 'signed'));
    if (files.length !== 1 || files[0] !== names[index] || !(await fs.lstat(signed)).isFile()) throw new Error('Expected one signed executable at artifact root.');
    const reportPath = path.join(directory, 'verification.json');
    powershell('verify-signpath-test.ps1', [
      '-UnsignedPath', path.join(directory, 'unsigned', names[index]), '-SignedPath', signed,
      '-CertificateBase64', process.env.CERTIFICATE_BASE64, '-ExpectedCertSha256', session.certificateSha256,
      '-Role', role, '-ReportPath', reportPath,
    ]);
    const report = await json(reportPath);
    if (report.unsignedSha256.toLowerCase() !== request.unsignedSha256) throw new Error('Unsigned staging input changed.');
    Object.assign(report, {
      role, artifactId: process.env.UNSIGNED_ARTIFACT_ID, signingRequestId: process.env.SIGNING_REQUEST_ID,
      signingRequestUrl: process.env.SIGNING_REQUEST_URL,
      workflowRunUrl: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    await writeJson(path.join(directory, 'response.json'), { ...report, nonce: session.nonce, id: request.id, unsignedSha256: request.unsignedSha256 });
    return;
  }
  if (command === 'finish') {
    const deadline = Date.now() + 15 * 60_000;
    let result;
    while (!(result = await optionalJson(path.join(root, 'build-result.json')))) {
      try { process.kill(session.pid, 0); } catch { throw new Error('Builder exited without a result.'); }
      if (Date.now() >= deadline) throw new Error('Builder did not finish.');
      await pause(500);
    }
    if (!result.success) throw new Error(result.error);
    const signedReport = await json(path.join(root, 'installer', 'verification.json'));
    if (await hashFile(session.installer) !== signedReport.signedSha256.toLowerCase()) throw new Error('Final installer changed after signing.');
    // Reuse the exact locked builder's YAML parser and blockmap implementation.
    const builderRequire = createRequire(require.resolve('electron-builder'));
    const appBuilderRequire = createRequire(builderRequire.resolve('app-builder-lib'));
    const { load } = appBuilderRequire('js-yaml');
    const { buildBlockMap } = appBuilderRequire('./targets/blockmap/blockmap');
    const recomputed = path.join(root, 'recomputed.blockmap');
    await buildBlockMap(session.installer, 'gzip', recomputed);
    if (!gunzipSync(await fs.readFile(recomputed)).equals(gunzipSync(await fs.readFile(`${session.installer}.blockmap`)))) throw new Error('Installer blockmap does not match final signed bytes.');
    const bytes = await fs.readFile(session.installer);
    const deliverables = path.join(root, 'deliverables');
    await fs.mkdir(deliverables);
    await fs.copyFile(session.installer, path.join(deliverables, path.basename(session.installer)));
    await fs.copyFile(`${session.installer}.blockmap`, path.join(deliverables, `${path.basename(session.installer)}.blockmap`));
    const updates = (await fs.readdir(session.output)).filter(file => file.endsWith('.yml') && file !== 'builder-effective-config.yaml');
    let checked = 0;
    for (const file of updates) {
      const metadata = load(await fs.readFile(path.join(session.output, file), 'utf8'));
      if (!Array.isArray(metadata?.files)) continue;
      if (metadata.sha512 !== digest(bytes, 'sha512', 'base64') || decodeURIComponent(metadata.path) !== path.basename(session.installer)) {
        throw new Error('Legacy update metadata does not match final signed installer.');
      }
      for (const entry of metadata.files) {
        if (decodeURIComponent(entry.url) !== path.basename(session.installer)) throw new Error('Unexpected update artifact.');
        if (entry.sha512 !== digest(bytes, 'sha512', 'base64') || entry.size !== bytes.length) throw new Error('Update metadata does not match final signed installer.');
        checked++;
      }
      await fs.copyFile(path.join(session.output, file), path.join(deliverables, file));
    }
    if (!checked) throw new Error('Missing installer update metadata.');
    await writeJson(path.join(root, 'update-verification.json'), { installer: path.basename(session.installer), sha512: digest(bytes, 'sha512', 'base64'), size: bytes.length, blockmap: 'matched', metadataFiles: checked });
    return;
  }
  if (command === 'cleanup') {
    if ((await optionalJson(path.join(root, 'build-result.json')))?.success) return;
    try { process.kill(session.pid, 0); execFileSync('taskkill', ['/PID', String(session.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* Builder may already have exited. */ }
    return;
  }
  throw new Error('Unknown bridge command.');
}

module.exports = { sign, createBridge, expectedPaths, validateRequest, waitRequest, signingParameters };
if (require.main === module) cli(process.argv[2], process.argv[3]).catch(error => { console.error(error); process.exitCode = 1; });
