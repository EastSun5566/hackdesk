import { describe, expect, it } from 'vitest';

import { AI_ACTIONS } from '../../../../src/lib/ai';
import { aiTurnInputSchema } from '../ipc-validation';
import { AI_SYSTEM_PROMPT, buildAiPrompt } from './prompts';

const base = { requestId: '6c4a1a39-5d9b-4c4f-9a43-5f1c2b0d9e11', providerId: 'claude' as const, text: 'Hello wrold' };

describe('AI prompts', () => {
  it('gives every action its own instruction around the selection', () => {
    const prompts = AI_ACTIONS.map(action => buildAiPrompt({ ...base, action, instruction: 'Make it formal' }));
    expect(new Set(prompts.map(prompt => prompt.split('\n')[0])).size).toBe(AI_ACTIONS.length);
    for (const prompt of prompts) expect(prompt).toContain('<selection>\nHello wrold\n</selection>');
  });

  it('sends surrounding text as context only', () => {
    const prompt = buildAiPrompt({ ...base, action: 'fix', noteTitle: 'Draft\n"x"', context: { before: 'Intro.', after: 'Outro.' } });
    expect(prompt).toContain('Note title: Draft &quot;x&quot;');
    expect(prompt.indexOf('<before>\nIntro.\n</before>')).toBeLessThan(prompt.indexOf('<selection>'));
    expect(prompt.indexOf('<after>\nOutro.\n</after>')).toBeGreaterThan(prompt.indexOf('</selection>'));
    expect(AI_SYSTEM_PROMPT).toContain('Only the <selection> may change');
  });

  it('quotes a custom request so it stays the user\'s words', () => {
    expect(buildAiPrompt({ ...base, action: 'custom', instruction: 'say "hi"' })).toContain('"say \\"hi\\""');
    expect(buildAiPrompt({ ...base, action: 'translate', targetLanguage: 'Japanese' })).toContain('into Japanese');
  });

  it('accepts only bounded requests, and custom ones with an instruction', () => {
    expect(aiTurnInputSchema.safeParse({ ...base, action: 'fix' }).success).toBe(true);
    expect(aiTurnInputSchema.safeParse({ ...base, action: 'custom' }).success).toBe(false);
    expect(aiTurnInputSchema.safeParse({ ...base, action: 'custom', instruction: 'x'.repeat(501) }).success).toBe(false);
    expect(aiTurnInputSchema.safeParse({ ...base, action: 'fix', context: { before: 'x'.repeat(2_001), after: '' } }).success).toBe(false);
    expect(aiTurnInputSchema.safeParse({ ...base, action: 'rewrite' }).success).toBe(false);
  });
});
