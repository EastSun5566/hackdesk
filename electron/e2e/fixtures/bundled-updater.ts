import { app } from 'electron';
import electronUpdater from 'electron-updater';
import { createServer } from 'node:http';
import { once } from 'node:events';

// This separate entry point uses the production bundler, not a mocked updater.
// It never loads HackDesk settings or reaches a public update feed.
const check = async () => {
  await app.whenReady();
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const path = request.url!.split('?')[0];
    requests.push(path);
    if (!/^\/latest(?:-(?:mac|linux)(?:-arm64)?)?\.yml$/.test(path)) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader('Content-Type', 'text/yaml');
    response.end('version: 999.0.0\nfiles:\n  - url: fixture.zip\n    sha512: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==\n    size: 1\npath: fixture.zip\nsha512: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==\nreleaseNotes: "Local YAML fixture"\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as { port: number };
  // Public class avoids AppImage's APPIMAGE environment requirement on Linux.
  // Only the common check/provider path runs; no installer code is invoked.
  const updater = new electronUpdater.NsisUpdater();
  updater.forceDevUpdateConfig = true;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.logger = null;
  const blocked: string[] = [];
  updater.netSession.webRequest.onBeforeRequest((details, done) => {
    const url = new URL(details.url);
    const allowed = url.origin === `http://127.0.0.1:${port}` && url.pathname.endsWith('.yml');
    if (!allowed) blocked.push(details.url);
    done({ cancel: !allowed });
  });
  try {
    updater.setFeedURL({ provider: 'generic', url: `http://127.0.0.1:${port}/` });
    const result = await updater.checkForUpdates();
    return { version: result?.updateInfo.version, notes: result?.updateInfo.releaseNotes, download: result?.downloadPromise ?? null, available: result?.isUpdateAvailable, requests, blocked };
  } finally {
    updater.netSession.webRequest.onBeforeRequest(null);
    server.close();
    server.closeAllConnections();
  }
};
Object.assign(globalThis, { updaterResult: check() });
