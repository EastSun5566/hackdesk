import { isAbsolute, join, relative, resolve } from 'node:path';

export const RENDERER_PROTOCOL = 'hackdesk';
export const RENDERER_HOST = 'renderer';

export function getDevServerRendererUrl() {
  const devServerUrl = process.env.HACKDESK_ELECTRON_DEV_SERVER_URL;

  return devServerUrl ? `${devServerUrl.replace(/\/$/, '')}/#/electron` : null;
}

export function getProductionRendererRoot() {
  return resolve(__dirname, '../../dist');
}

export function getProductionRendererUrl() {
  return `${RENDERER_PROTOCOL}://${RENDERER_HOST}/index.html#/electron`;
}

export function getRendererEntryUrl() {
  return getDevServerRendererUrl() ?? getProductionRendererUrl();
}

export function getRendererRouteUrl(route: string) {
  const [root] = getRendererEntryUrl().split('#');
  return `${root}#${route.startsWith('/') ? route : `/${route}`}`;
}

export function isTrustedRendererUrl(url: string) {
  const devServerUrl = getDevServerRendererUrl();

  try {
    const parsed = new URL(url);

    if (devServerUrl) {
      const devOrigin = new URL(devServerUrl).origin;
      return parsed.origin === devOrigin;
    }

    return parsed.protocol === `${RENDERER_PROTOCOL}:` && parsed.host === RENDERER_HOST;
  } catch {
    return false;
  }
}

export function resolveRendererFile(url: string, rendererRoot = getProductionRendererRoot()) {
  const parsed = new URL(url);

  if (parsed.protocol !== `${RENDERER_PROTOCOL}:` || parsed.host !== RENDERER_HOST) {
    throw new Error('Blocked untrusted renderer URL.');
  }

  const rawPath = url.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)/i)?.[1] || '/';
  const decodedRawPath = decodeURIComponent(rawPath);
  if (decodedRawPath.split(/[\\/]+/).includes('..')) {
    throw new Error('Blocked renderer path traversal.');
  }

  const pathname = parsed.pathname === '/' ? '/index.html' : decodeURIComponent(parsed.pathname);
  const filePath = resolve(rendererRoot, join('.', pathname));
  const relativePath = relative(rendererRoot, filePath);
  const isSafe = relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath);

  if (!isSafe) {
    throw new Error('Blocked renderer path traversal.');
  }

  return filePath;
}
