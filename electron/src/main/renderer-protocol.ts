import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';

import { RENDERER_PROTOCOL, resolveRendererFile } from './renderer-url';
import { LOCAL_IMAGE_HOST, parseLocalImageRequest } from '../../../src/lib/local-image';
import { readLocalVaultImage } from './local-vault-service';

protocol.registerSchemesAsPrivileged([
  {
    scheme: RENDERER_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

let protocolRegistered = false;

async function serveLocalImage(request: Request) {
  const headers = {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'",
  };
  try {
    const destination = request.headers.get('sec-fetch-dest');
    if (request.method !== 'GET' || (destination && destination !== 'image')) throw new Error('Images only.');
    const { bytes, mimeType } = await readLocalVaultImage(parseLocalImageRequest(request.url));
    return new Response(bytes, { headers: { ...headers, 'content-type': mimeType } });
  } catch {
    // Do not expose filesystem paths or settings through an image error response.
    return new Response('Image unavailable.', { status: 404, headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } });
  }
}

export function registerRendererProtocol() {
  if (protocolRegistered) {
    return;
  }

  protocolRegistered = true;
  protocol.handle(RENDERER_PROTOCOL, (request) => {
    try {
      if (new URL(request.url).hostname === LOCAL_IMAGE_HOST) return serveLocalImage(request);
      const filePath = resolveRendererFile(request.url);
      return net.fetch(pathToFileURL(filePath).toString()).then(async (response) => {
        const headers = new Headers(response.headers);
        headers.set(
          'content-security-policy',
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: hackdesk://vault-image; font-src 'self' data:; connect-src 'self' https://api.hackmd.io; object-src 'none'; base-uri 'none'; form-action 'none'",
        );
        return new Response(await response.arrayBuffer(), {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Blocked renderer request.';
      return new Response(message, {
        status: 400,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  });
}
