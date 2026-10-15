import { readFileSync, writeFileSync } from 'node:fs';
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

type OpenApiResponse = JsonRecord & {
  headers?: Record<string, unknown>;
  content?: {
    'application/json'?: {
      schema?: OpenApiSchema;
    };
  };
};

type OpenApiOperation = JsonRecord & {
  security?: unknown[];
  parameters?: Array<JsonRecord & { name?: string; in?: string }>;
  responses?: Record<string, OpenApiResponse | undefined>;
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
    securitySchemes?: unknown;
  };
};

/** Success statuses the HackMD service handles. 207 is a partial note create. */
const HANDLED_SUCCESS_STATUSES = new Set(['200', '201', '202', '204', '207']);

const REQUIRED_OPERATIONS: Array<readonly [string, string]> = [
  ['GET', '/me'],
  ['GET', '/teams'],
  ['GET', '/notes'],
  ['POST', '/notes'],
  ['GET', '/notes/{noteId}'],
  ['PATCH', '/notes/{noteId}'],
  ['DELETE', '/notes/{noteId}'],
  ['PUT', '/trash/{noteId}/restore'],
  ['GET', '/notes/{noteId}/versions'],
  ['GET', '/notes/{noteId}/versions/{versionId}'],
  ['GET', '/notes/{noteId}/versions/compare'],
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

function collectRefs(value: unknown, refs: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRefs(item, refs));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && typeof child === 'string') refs.add(child);
    else collectRefs(child, refs);
  }
}

/**
 * Keeps only the operations HackDesk calls and the schemas they reference,
 * so the checked-in fixture stays small and its diffs show real API changes.
 */
export function extractHackmdContract(spec: OpenApiContract): OpenApiContract {
  const paths: NonNullable<OpenApiContract['paths']> = {};
  const refs = new Set<string>();

  for (const [method, path] of REQUIRED_OPERATIONS) {
    const operation = getOperation(spec, method, path);
    if (!operation) continue;

    const kept = Object.fromEntries(
      (['security', 'parameters', 'requestBody', 'responses'] as const)
        .filter((key) => operation[key] !== undefined)
        .map((key) => [key, operation[key]]),
    );
    paths[path] = { ...paths[path], [method.toLowerCase()]: kept };
    collectRefs(kept, refs);
  }

  const schemas: Record<string, OpenApiSchema | undefined> = {};
  const pending = [...refs];
  while (pending.length > 0) {
    const ref = pending.pop()!;
    const name = ref.replace('#/components/schemas/', '');
    if (ref === name || schemas[name]) continue;

    const schema = spec.components?.schemas?.[name];
    if (!schema) continue;

    schemas[name] = schema;
    const nested = new Set<string>();
    collectRefs(schema, nested);
    pending.push(...nested);
  }

  return {
    openapi: spec.openapi,
    paths: Object.fromEntries(Object.entries(paths).sort(([left], [right]) => left.localeCompare(right))),
    components: {
      securitySchemes: spec.components?.securitySchemes,
      schemas: Object.fromEntries(Object.entries(schemas).sort(([left], [right]) => left.localeCompare(right))),
    },
  };
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

function schemaContainsPath(contract: OpenApiContract, schema: OpenApiSchema | null, [head, ...rest]: string[]): boolean {
  if (!schema) {
    return false;
  }

  if (schema.$ref) {
    return schemaContainsPath(contract, resolveRef(contract, schema.$ref), [head, ...rest]);
  }

  const child = schema.properties?.[head];
  if (child) {
    return rest.length === 0 || schemaContainsPath(contract, child, rest);
  }

  return (['anyOf', 'oneOf', 'allOf'] as const).some((key) => (
    Array.isArray(schema[key]) && schema[key].some((option) => schemaContainsPath(contract, option, [head, ...rest]))
  ));
}

function getResponseSchema(operation: OpenApiOperation | null, status: string): OpenApiSchema | null {
  return operation?.responses?.[status]?.content?.['application/json']?.schema ?? null;
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
    if (path.endsWith('/restore')) {
      // Restoring from the trash takes no body.
      continue;
    }

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

  for (const [method, path] of REQUIRED_OPERATIONS) {
    const operation = getOperation(contract, method, path);
    for (const [status, response] of Object.entries(operation?.responses ?? {})) {
      if (status.startsWith('2')) {
        assert(HANDLED_SUCCESS_STATUSES.has(status), `Unhandled success status ${status} on ${method} ${path}.`, failures);
        assert(status !== '207' || path.endsWith('/notes'), `Unexpected partial success on ${method} ${path}.`, failures);
        continue;
      }

      const schema = response?.content?.['application/json']?.schema ?? null;
      if (Number(status) >= 400 && schema) {
        assert(
          schemaContainsProperty(contract, schema, 'error') || schemaContainsProperty(contract, schema, 'message'),
          `Error ${status} on ${method} ${path} has neither error nor message.`,
          failures,
        );
      }
    }
  }

  for (const path of ['/notes/{noteId}', '/teams/{teampath}/notes/{noteId}']) {
    const operation = getOperation(contract, 'GET', path);
    const schema = getResponseSchema(operation, '200');
    for (const propertyName of ['id', 'content', 'lastChangedAt']) {
      assert(schemaContainsProperty(contract, schema, propertyName), `GET ${path} response missing ${propertyName}.`, failures);
    }

    // The pre-save check sends the ETag from the last read and expects 304 when nothing changed.
    assert(
      operation?.parameters?.some((parameter) => parameter.name === 'If-None-Match' && parameter.in === 'header'),
      `GET ${path} missing the If-None-Match header.`,
      failures,
    );
    assert(isRecord(operation?.responses?.['200']?.headers?.ETag), `GET ${path} 200 missing the ETag header.`, failures);
    assert(Boolean(operation?.responses?.['304']), `GET ${path} missing the 304 response.`, failures);
  }

  for (const path of ['/notes', '/teams/{teampath}/notes']) {
    const partial = getResponseSchema(getOperation(contract, 'POST', path), '207');
    assert(!partial || schemaContainsProperty(contract, partial, 'note'), `POST ${path} partial response must wrap the note.`, failures);
  }

  assert(
    schemaContainsPath(contract, getResponseSchema(getOperation(contract, 'POST', '/notes/{noteId}/images'), '201'), ['data', 'link']),
    'Image upload response missing data.link.',
    failures,
  );
  assert(
    getOperation(contract, 'GET', '/history')?.parameters?.some((parameter) => parameter.name === 'limit' && parameter.in === 'query'),
    'GET /history missing the limit query parameter.',
    failures,
  );

  // Version history reads these fields; the list is paged by meta.total_pages.
  const versionsSchema = getResponseSchema(getOperation(contract, 'GET', '/notes/{noteId}/versions'), '200');
  for (const path of [['data'], ['meta', 'page'], ['meta', 'total_pages']]) {
    assert(schemaContainsPath(contract, versionsSchema, path), `GET /notes/{noteId}/versions response missing ${path.join('.')}.`, failures);
  }
  for (const propertyName of ['id', 'name_source', 'created_at', 'content_available', 'content']) {
    assert(
      schemaContainsProperty(contract, getResponseSchema(getOperation(contract, 'GET', '/notes/{noteId}/versions/{versionId}'), '200'), propertyName),
      `GET /notes/{noteId}/versions/{versionId} response missing ${propertyName}.`,
      failures,
    );
  }
  const compareOperation = getOperation(contract, 'GET', '/notes/{noteId}/versions/compare');
  assert(
    schemaContainsProperty(contract, getResponseSchema(compareOperation, '200'), 'unified_diff'),
    'Version compare response missing unified_diff.',
    failures,
  );
  for (const name of ['base', 'target']) {
    assert(
      compareOperation?.parameters?.some((parameter) => parameter.name === name && parameter.in === 'query'),
      `Version compare missing the ${name} query parameter.`,
      failures,
    );
  }

  const permissionEnum = contract.components?.schemas?.NotePermissionRole?.enum ?? [];
  for (const permission of ['owner', 'signed_in', 'guest']) {
    assert(permissionEnum.includes(permission), `NotePermissionRole missing ${permission}.`, failures);
  }

  if (failures.length > 0) {
    throw new Error(`HackMD OpenAPI contract check failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  }
}

async function main() {
  const updateIndex = process.argv.indexOf('--update');
  if (updateIndex !== -1) {
    // `--update` refreshes the fixture from the live spec, or from a saved swagger.json path.
    const source = process.argv[updateIndex + 1];
    const spec = source && !source.startsWith('--') ? readContract(source) : await fetchLiveContract();
    const contract = extractHackmdContract(spec);
    verifyHackmdOpenApiContract(contract);
    writeFileSync(DEFAULT_CONTRACT_PATH, `${JSON.stringify(contract, null, 2)}\n`);
    console.log(`HackMD OpenAPI contract updated (${DEFAULT_CONTRACT_PATH}).`);
    return;
  }

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
