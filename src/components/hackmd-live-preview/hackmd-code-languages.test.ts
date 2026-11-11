import { describe, expect, it } from 'vitest';

import { getCodeLanguageLabel, parseCodeFenceInfo, resolveCodeLanguage } from './hackmd-code-languages';

describe('parseCodeFenceInfo', () => {
  it('separates the language from HackMD line-number and wrap options', () => {
    expect(parseCodeFenceInfo('js')).toEqual({ language: 'js', numbering: null, wrap: false });
    expect(parseCodeFenceInfo('js=')).toEqual({ language: 'js', numbering: { start: 1 }, wrap: false });
    expect(parseCodeFenceInfo('js=101')).toEqual({ language: 'js', numbering: { start: 101 }, wrap: false });
    expect(parseCodeFenceInfo('Python=+')).toEqual({ language: 'python', numbering: { continue: true }, wrap: false });
    expect(parseCodeFenceInfo('bash!')).toEqual({ language: 'bash', numbering: null, wrap: true });
    expect(parseCodeFenceInfo('js=! {title="x"}')).toEqual({ language: 'js', numbering: { start: 1 }, wrap: true });
    expect(parseCodeFenceInfo('=')).toEqual({ language: '', numbering: { start: 1 }, wrap: false });
    expect(parseCodeFenceInfo('')).toEqual({ language: '', numbering: null, wrap: false });
  });
});

describe('resolveCodeLanguage', () => {
  it('finds languages by name or alias, ignoring HackMD options', () => {
    expect(resolveCodeLanguage('js=')?.name).toBe('JavaScript');
    expect(resolveCodeLanguage('python=+')?.name).toBe('Python');
    expect(resolveCodeLanguage('sh!')?.name).toBe('Shell');
    expect(resolveCodeLanguage('tsx')?.name).toBe('TSX');
    expect(resolveCodeLanguage('mermaid')).toBeNull();
    expect(resolveCodeLanguage('')).toBeNull();
  });

  it('labels blocks with the registry name, or the fence text when unknown', () => {
    expect(getCodeLanguageLabel('js=101')).toBe('JavaScript');
    expect(getCodeLanguageLabel('mermaid')).toBe('mermaid');
    expect(getCodeLanguageLabel('')).toBe('');
  });
});
