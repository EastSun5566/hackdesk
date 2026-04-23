import { describe, expect, it } from 'vitest';

import {
  createQuickNotePayload,
  getHackmdErrorMessage,
  getHackmdNotePath,
  hasHackmdToken,
} from './hackmd';

describe('HackMD helpers', () => {
  it('detects whether a HackMD token is configured', () => {
    expect(hasHackmdToken({ hackmdApiToken: '  token  ' })).toBe(true);
    expect(hasHackmdToken({ hackmdApiToken: '   ' })).toBe(false);
  });

  it('builds a personal note path for navigation', () => {
    expect(getHackmdNotePath({
      publishType: 'edit',
      shortId: 'abc123',
      userPath: 'michael',
      teamPath: null,
      permalink: 'hello-world',
      publishLink: 'https://hackmd.io/abc123',
    })).toBe('/@michael/hello-world');
  });

  it('builds an edit path for newly created notes', () => {
    expect(getHackmdNotePath({
      publishType: 'edit',
      shortId: 'abc123',
      userPath: null,
      teamPath: null,
      permalink: null,
      publishLink: 'https://hackmd.io/abc123',
    }, true)).toBe('/abc123');
  });

  it('uses publishLink for team note navigation when available', () => {
    expect(getHackmdNotePath({
      publishType: 'view',
      shortId: 'team123',
      userPath: null,
      teamPath: 'engineering',
      permalink: 'roadmap',
      publishLink: 'https://hackmd.io/@engineering/roadmap',
    })).toBe('/@engineering/roadmap');
  });

  it('builds an edit path for team notes from publishLink', () => {
    expect(getHackmdNotePath({
      publishType: 'view',
      shortId: 'team123',
      userPath: null,
      teamPath: 'engineering',
      permalink: 'roadmap',
      publishLink: 'https://hackmd.io/@engineering/roadmap',
    }, true)).toBe('/@engineering/roadmap/edit');
  });

  it('creates starter markdown for quick note creation', () => {
    expect(createQuickNotePayload('Sprint Notes')).toEqual({
      title: 'Sprint Notes',
      content: '# Sprint Notes\n\n',
    });
  });

  it('surfaces string errors from backend commands', () => {
    expect(getHackmdErrorMessage('Your HackMD API token is invalid or expired.')).toBe(
      'Your HackMD API token is invalid or expired.',
    );
  });

  it('prefers structured error messages when available', () => {
    expect(getHackmdErrorMessage({ message: 'HackMD took too long to respond.' })).toBe(
      'HackMD took too long to respond.',
    );
  });
});