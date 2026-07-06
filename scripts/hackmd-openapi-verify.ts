import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_CONTRACT_PATH = join(__dirname, 'fixtures', 'hackmd-openapi-contract.json');
const LIVE_SWAGGER_URL = 'https://api.hackmd.io/v1/docs/swagger.json';

type JsonRecord = Record<string, unknown>;

type OpenApiSchema = JsonRecord & {
  $ref?: string;
  properties?: Record<string, OpenApiSchema | undefined>;
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
  enum?: unknown[];
};

type OpenApiOperation = JsonRecord & {
  security?: unknown[];
  requestBody?: {
    content?: {
      'application/json'?: {
        schema?: OpenApiSchema;
      };
      'multipart/form-data'?: {
        schema?: OpenApiSchema;
      };
    };
  };
};

export type OpenApiContract = JsonRecord & {
  openapi?: string;
  paths?: Record<string, Record<string, OpenApiOperation | undefined> | undefined>;
  components?: {
    schemas?: Record<string, OpenApiSchema | undefined>;
  };
};

const REQUIRED_OPERATIONS: Array<readonly [string, string]> = [
  ['GET', '/me'],
  ['GET', '/teams'],
  ['GET', '/notes'],
  ['POST', '/notes'],
  ['GET', '/notes/{noteId}'],
  ['PATCH', '/notes/{noteId}'],
  ['DELETE', '/notes/{noteId}'],
  ['POST', '/notes/{noteId}/images'],
  ['GET', '/history'],
  ['GET', '/folders'],
  ['POST', '/folders'],
  ['GET', '/folders/folder-order'],
  ['PUT', '/folders/folder-order'],
  ['GET', '/folders/{folderId}'],
  ['PATCH', '/folders/{folderId}'],
  ['DELETE', '/folders/{folderId}'],
  ['GET', '/teams/{teampath}/notes'],
  ['POST', '/teams/{teampath}/notes'],
  ['GET', '/teams/{teampath}/notes/{noteId}'],
  ['PATCH', '/teams/{teampath}/notes/{noteId}'],
  ['DELETE', '/teams/{teampath}/notes/{noteId}'],
  ['GET', '/teams/{teampath}/folders'],
  ['POST', '/teams/{teampath}/folders'],
  ['GET', '/teams/{teampath}/folders/folder-order'],
  ['PUT', '/teams/{teampath}/folders/folder-order'],
  ['GET', '/teams/{teampath}/folders/{folderId}'],
  ['PATCH', '/teams/{teampath}/folders/{folderId}'],
  ['DELETE', '/teams/{teampath}/folders/{folderId}'],
];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function asSchema(value: unknown): OpenApiSchema | null {
  return isRecord(value) ? value as OpenApiSchema : null;
}

function readContract(path = DEFAULT_CONTRACT_PATH): OpenApiContract {
  return JSON.parse(readFileSync(path, 'utf8')) as OpenApiContract;
}

async function fetchLiveContract(): Promise<OpenApiContract> {
  const response = await fetch(LIVE_SWAGGER_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch HackMD swagger: ${response.status} ${response.statusText}`);
  }

  return await response.json() as OpenApiContract;
}

function getOperation(contract: OpenApiContract, method: string, path: string): OpenApiOperation | null {
  return contract.paths?.[path]?.[method.toLowerCase()] ?? null;
}

function hasJsonBody(operation: OpenApiOperation | null): boolean {
  return Boolean(operation?.requestBody?.content?.['application/json']);
}

function hasMultipartBody(operation: OpenApiOperation | null): boolean {
  return Boolean(operation?.requestBody?.content?.['multipart/form-data']);
}

function resolveRef(contract: OpenApiContract, ref: string): OpenApiSchema | null {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return null;
  }

  let current: unknown = contract;
  for (const segment of ref.slice(2).split('/')) {
    if (!isRecord(current)) {
      return null;
    }

    current = current[segment];
  }

  return asSchema(current);
}

function schemaContainsProperty(
  contract: OpenApiContract,
  schema: OpenApiSchema | null,
  propertyName: string,
  seenRefs = new Set<string>(),
): boolean {
  if (!schema || typeof schema !== 'object') {
    return false;
  }

  if (schema.$ref) {
    if (seenRefs.has(schema.$ref)) {
      return false;
    }

    seenRefs.add(schema.$ref);
    return schemaContainsProperty(contract, resolveRef(contract, schema.$ref), propertyName, seenRefs);
  }

  if (schema.properties?.[propertyName]) {
    return true;
  }

  return (['anyOf', 'oneOf', 'allOf'] as const).some((key) => (
    Array.isArray(schema[key])
    && schema[key].some((child) => schemaContainsProperty(contract, child, propertyName, seenRefs))
  ));
}

function getJsonSchema(operation: OpenApiOperation | null): OpenApiSchema | null {
  return operation?.requestBody?.content?.['application/json']?.schema ?? null;
}

function getMultipartSchema(operation: OpenApiOperation | null): OpenApiSchema | null {
  return operation?.requestBody?.content?.['multipart/form-data']?.schema ?? null;
}

function assert(condition: unknown, message: string, failures: string[]): void {
  if (!condition) {
    failures.push(message);
  }
}

export function verifyHackmdOpenApiContract(contract: OpenApiContract): void {
  const failures: string[] = [];

  assert(contract?.openapi?.startsWith('3.'), 'Expected an OpenAPI 3.x contract.', failures);

  for (const [method, path] of REQUIRED_OPERATIONS) {
    const operation = getOperation(contract, method, path);
    assert(Boolean(operation), `Missing ${method} ${path}.`, failures);
    assert(Array.isArray(operation?.security), `Missing bearer token security on ${method} ${path}.`, failures);
  }

  for (const [method, path] of REQUIRED_OPERATIONS.filter(([method]) => ['POST', 'PATCH', 'PUT'].includes(method))) {
    const operation = getOperation(contract, method, path);
    if (path.endsWith('/images')) {
      assert(hasMultipartBody(operation), `Expected multipart body on ${method} ${path}.`, failures);
      assert(schemaContainsProperty(contract, getMultipartSchema(operation), 'image'), `Expected multipart image field on ${method} ${path}.`, failures);
      continue;
    }

    assert(hasJsonBody(operation), `Expected JSON body on ${method} ${path}.`, failures);
  }

  const personalCreateNoteSchema = getJsonSchema(getOperation(contract, 'POST', '/notes'));
  const personalUpdateNoteSchema = getJsonSchema(getOperation(contract, 'PATCH', '/notes/{noteId}'));
  for (const propertyName of ['title', 'content', 'tags', 'readPermission', 'writePermission', 'parentFolderId']) {
    assert(schemaContainsProperty(contract, personalCreateNoteSchema, propertyName), `CreateNote missing ${propertyName}.`, failures);
    assert(schemaContainsProperty(contract, personalUpdateNoteSchema, propertyName), `UpdateNote missing ${propertyName}.`, failures);
  }

  const folderOrderSchema = getJsonSchema(getOperation(contract, 'PUT', '/folders/folder-order'));
  const teamFolderOrderSchema = getJsonSchema(getOperation(contract, 'PUT', '/teams/{teampath}/folders/folder-order'));
  assert(schemaContainsProperty(contract, folderOrderSchema, 'order'), 'Personal folder-order body must wrap the order object.', failures);
  assert(schemaContainsProperty(contract, teamFolderOrderSchema, 'order'), 'Team folder-order body must wrap the order object.', failures);

  const permissionEnum = contract.components?.schemas?.NotePermissionRole?.enum ?? [];
  for (const permission of ['owner', 'signed_in', 'guest']) {
    assert(permissionEnum.includes(permission), `NotePermissionRole missing ${permission}.`, failures);
  }

  if (failures.length > 0) {
    throw new Error(`HackMD OpenAPI contract check failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  }
}

async function main() {
  const contract = process.argv.includes('--live')
    ? await fetchLiveContract()
    : readContract();

  verifyHackmdOpenApiContract(contract);
  console.log(`HackMD OpenAPI contract verified (${process.argv.includes('--live') ? LIVE_SWAGGER_URL : DEFAULT_CONTRACT_PATH}).`);
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
