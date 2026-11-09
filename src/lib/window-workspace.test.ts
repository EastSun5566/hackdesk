import { describe, expect, it } from 'vitest';

import {
  appendWindowWorkspaceToUrl,
  decodeWindowWorkspaceScope,
  encodeWindowWorkspaceScope,
  readWindowWorkspaceFromLocation,
  type WindowWorkspaceScope,
} from './window-workspace';

describe('window workspace scope', () => {
  it('round-trips a team scope through its URL encoding', () => {
    const scope: WindowWorkspaceScope = { type: 'team', label: 'Atlas Team', teamPath: 'atlas' };
    expect(decodeWindowWorkspaceScope(encodeWindowWorkspaceScope(scope))).toEqual(scope);
  });

  it('round-trips a scope without a team path', () => {
    const scope: WindowWorkspaceScope = { type: 'local', label: 'Local Vault' };
    expect(decodeWindowWorkspaceScope(encodeWindowWorkspaceScope(scope))).toEqual(scope);
  });

  it('rejects scopes that name no workspace', () => {
    expect(decodeWindowWorkspaceScope(null)).toBeNull();
    expect(decodeWindowWorkspaceScope('')).toBeNull();
    expect(decodeWindowWorkspaceScope('%7Bbroken')).toBeNull();
    expect(decodeWindowWorkspaceScope(encodeURIComponent(JSON.stringify({ type: 'team', label: 'Atlas' })))).toBeNull();
    expect(decodeWindowWorkspaceScope(encodeURIComponent(JSON.stringify({ type: 'spaceship', label: 'X' })))).toBeNull();
    expect(decodeWindowWorkspaceScope(encodeURIComponent(JSON.stringify({ type: 'team', label: 'A', teamPath: 'a', extra: 1 })))).toEqual({
      type: 'team',
      label: 'A',
      teamPath: 'a',
    });
    expect(() => encodeWindowWorkspaceScope({ type: 'team', label: 'Atlas' })).toThrow('invalid workspace scope');
  });

  it('reads the scope from the hash query before the search query', () => {
    const team = { type: 'team', label: 'Atlas', teamPath: 'atlas' } as const;
    expect(readWindowWorkspaceFromLocation({ hash: `#/electron?workspace=${encodeWindowWorkspaceScope(team)}`, search: '' })).toEqual(team);
    expect(readWindowWorkspaceFromLocation({ hash: '#/electron', search: `?workspace=${encodeWindowWorkspaceScope(team)}` })).toEqual(team);
    expect(readWindowWorkspaceFromLocation({ hash: '#/electron', search: '' })).toBeNull();
  });

  it('appends the scope without touching the entry route', () => {
    const scope: WindowWorkspaceScope = { type: 'history', label: 'History' };
    expect(appendWindowWorkspaceToUrl('hackdesk://renderer/index.html#/electron', scope)).toBe(
      `hackdesk://renderer/index.html#/electron?workspace=${encodeWindowWorkspaceScope(scope)}`,
    );
    expect(appendWindowWorkspaceToUrl('http://localhost:5173/#/electron?other=1', scope)).toContain('&workspace=');
  });
});
