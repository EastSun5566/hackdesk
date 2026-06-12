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
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Blocked renderer request.';
      return new Response(message, {
        status: 400,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  });
}
