import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { verifyHackmdOpenApiContract } from '../../../scripts/hackmd-openapi-verify.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const contractPath = join(__dirname, '..', '..', '..', 'scripts', 'fixtures', 'hackmd-openapi-contract.json');

describe('HackMD OpenAPI contract', () => {
  it('covers the API surface used by the Electron HackMD service', () => {
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));

    expect(() => verifyHackmdOpenApiContract(contract)).not.toThrow();
  });

  it('fails when folder-order stops accepting the wrapped order body', () => {
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    contract.paths['/folders/folder-order'].put.requestBody.content['application/json'].schema = { type: 'object' };

    expect(() => verifyHackmdOpenApiContract(contract)).toThrow(/folder-order body must wrap the order object/);
  });
});
