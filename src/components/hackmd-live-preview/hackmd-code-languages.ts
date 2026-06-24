import { javascript } from '@codemirror/lang-javascript';
import { LanguageDescription } from '@codemirror/language';

export const hackmdCodeLanguages = [
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['js', 'javascript', 'mjs', 'cjs', 'jsx'],
    extensions: ['js', 'mjs', 'cjs', 'jsx'],
    load: () => Promise.resolve(javascript({ jsx: true })),
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['ts', 'typescript', 'tsx'],
    extensions: ['ts', 'mts', 'cts', 'tsx'],
    load: () => Promise.resolve(javascript({ jsx: true, typescript: true })),
  }),
] as const;
