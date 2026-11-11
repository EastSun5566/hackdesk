import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';

/**
 * Splits a fence info string into its language and HackMD's options, which are appended to the
 * language itself: `=` numbers lines from 1, `=N` from N, `=+` continues the previous numbered
 * block, and a trailing `!` wraps long lines (`js=`, `js=101`, `js=+`, `js!`). Numbering and
 * wrapping together (`js=!`) are accepted here too.
 */
export function parseCodeFenceInfo(info: string) {
  const word = info.trim().split(/\s+/, 1)[0] ?? '';
  const match = word.match(/^(.*?)(=(\d+|\+)?)?(!)?$/);
  const language = (match?.[1] ?? word).toLowerCase();
  const numbering = match?.[2] === undefined
    ? null
    : match[3] === '+'
      ? { continue: true as const }
      : { start: match[3] === undefined ? 1 : Number.parseInt(match[3], 10) };

  return { language, numbering, wrap: match?.[4] === '!' };
}

/** The fence's language, loaded on demand from CodeMirror's registry, or null for plain text. */
export function resolveCodeLanguage(info: string): LanguageDescription | null {
  const { language } = parseCodeFenceInfo(info);
  return language ? LanguageDescription.matchLanguageName(languages, language, true) : null;
}

/** The label a code block shows: the registry's name for its language, else what the fence says. */
export function getCodeLanguageLabel(info: string): string {
  const { language } = parseCodeFenceInfo(info);
  if (!language) return '';
  return LanguageDescription.matchLanguageName(languages, language, true)?.name ?? language;
}
