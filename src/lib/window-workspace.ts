/**
 * The workspace a new window boots into, carried in its entry URL
 * (`#/electron?workspace=...`) so the first render already shows it.
 * A local scope may name a vault or a named workspace; the new window
 * activates it on boot. Without either, a local scope means the active vault.
 */
export type WindowWorkspaceScope = {
  type: 'local' | 'personal' | 'history' | 'team';
  label: string;
  teamPath?: string;
  vaultId?: string;
  workspaceId?: string;
};

export const WINDOW_WORKSPACE_PARAM = 'workspace';

const SCOPE_TYPES = new Set(['local', 'personal', 'history', 'team']);

function cleanScope(value: unknown): WindowWorkspaceScope | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const { type, label, teamPath, vaultId, workspaceId } = value as Record<string, unknown>;
  if (typeof type !== 'string' || !SCOPE_TYPES.has(type) || typeof label !== 'string' || !label.trim() || label.trim().length > 200) {
    return null;
  }
  if (type === 'team') {
    if (typeof teamPath !== 'string' || !teamPath.trim() || teamPath.trim().length > 500) {
      return null;
    }
    return vaultId === undefined && workspaceId === undefined
      ? { type: 'team', label: label.trim(), teamPath: teamPath.trim() }
      : null;
  }
  if (teamPath !== undefined) {
    return null;
  }
  if (vaultId !== undefined && (type !== 'local' || typeof vaultId !== 'string' || !vaultId.trim() || vaultId.trim().length > 200)) {
    return null;
  }
  if (workspaceId !== undefined && (type !== 'local' || typeof workspaceId !== 'string' || !workspaceId.trim() || workspaceId.trim().length > 200)) {
    return null;
  }
  const cleaned: WindowWorkspaceScope = { type: type as WindowWorkspaceScope['type'], label: label.trim() };
  if (vaultId !== undefined) cleaned.vaultId = vaultId.trim();
  if (workspaceId !== undefined) cleaned.workspaceId = workspaceId.trim();
  return cleaned;
}

export function encodeWindowWorkspaceScope(scope: WindowWorkspaceScope): string {
  const cleaned = cleanScope(scope);
  if (!cleaned) {
    throw new Error('Cannot encode an invalid workspace scope.');
  }
  return encodeURIComponent(JSON.stringify(cleaned));
}

export function decodeWindowWorkspaceScope(value: string | null | undefined): WindowWorkspaceScope | null {
  if (!value) {
    return null;
  }
  try {
    return cleanScope(JSON.parse(decodeURIComponent(value)));
  } catch {
    return null;
  }
}

/** Reads the workspace from a window location; HashRouter keeps the query inside the hash. */
export function readWindowWorkspaceFromLocation(location: { hash: string; search: string }): WindowWorkspaceScope | null {
  const hashQuery = location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?')) : '';
  for (const query of [hashQuery, location.search]) {
    if (!query) {
      continue;
    }
    const decoded = decodeWindowWorkspaceScope(new URLSearchParams(query).get(WINDOW_WORKSPACE_PARAM));
    if (decoded) {
      return decoded;
    }
  }
  return null;
}

/** Appends the workspace to a renderer entry URL without touching its route. */
export function appendWindowWorkspaceToUrl(entryUrl: string, scope: WindowWorkspaceScope): string {
  const separator = entryUrl.includes('?') ? '&' : '?';
  return `${entryUrl}${separator}${WINDOW_WORKSPACE_PARAM}=${encodeWindowWorkspaceScope(scope)}`;
}
