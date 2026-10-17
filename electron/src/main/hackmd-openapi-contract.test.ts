import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { extractHackmdContract, verifyHackmdOpenApiContract } from '../../../scripts/hackmd-openapi-verify.ts';

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

  it('fails on a success status the service does not handle', () => {
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    contract.paths['/notes/{noteId}'].patch.responses['206'] = { description: '' };

    expect(() => verifyHackmdOpenApiContract(contract)).toThrow(/Unhandled success status 206 on PATCH \/notes\/\{noteId\}/);
  });

  it('fails when a batch restore outcome stops reporting the failure reason', () => {
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    delete contract.components.schemas.TrashBatchOperationResponse.additionalProperties.properties.reason;

    expect(() => verifyHackmdOpenApiContract(contract)).toThrow(/Batch restore 207 outcome missing reason/);
  });

  it('fails when comments stop carrying the current anchor', () => {
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    delete contract.components.schemas.ApiCommentHead.properties.currentAnchor;

    expect(() => verifyHackmdOpenApiContract(contract)).toThrow(/Comment thread head missing currentAnchor/);
  });

  it('fails when a version edit stops taking the base version', () => {
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    for (const option of contract.components.schemas.UpdateNoteVersionBody.anyOf) delete option.properties.base;

    expect(() => verifyHackmdOpenApiContract(contract)).toThrow(/Update version body missing base/);
  });

  it('keeps only the operations HackDesk calls and the schemas they reference', () => {
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    const spec = {
      ...contract,
      paths: { ...contract.paths, '/webhooks': { get: { security: [], responses: { 200: { $ref: '#/components/schemas/ApiWebhook' } } } } },
      components: { ...contract.components, schemas: { ...contract.components.schemas, ApiWebhook: { type: 'object' } } },
    };

    expect(extractHackmdContract(spec)).toEqual(contract);
  });
});
