import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';

import { RENDERER_PROTOCOL, resolveRendererFile } from './renderer-url';

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

export function registerRendererProtocol() {
  if (protocolRegistered) {
    return;
  }

  protocolRegistered = true;
  protocol.handle(RENDERER_PROTOCOL, (request) => {
    try {
      const filePath = resolveRendererFile(request.url);
      return net.fetch(pathToFileURL(filePath).toString()).then(async (response) => {
        const headers = new Headers(response.headers);
        headers.set(
          'content-security-policy',
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.hackmd.io; object-src 'none'; base-uri 'none'; form-action 'none'",
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
