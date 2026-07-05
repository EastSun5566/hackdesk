import { z } from 'zod';

import { writeLog } from './logging';

const notePermissionSchema = z.enum(['owner', 'signed_in', 'guest']);
const commentPermissionSchema = z.enum(['disabled', 'forbidden', 'owners', 'signed_in_users', 'everyone']);
const suggestEditPermissionSchema = z.enum(['disabled', 'forbidden', 'owners', 'signed_in_users']);

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableStringSchema = z.string().nullable();
const optionalStringSchema = z.string().optional();
const optionalStringArraySchema = z.array(z.string()).optional();
const noteFeaturesSchema = z.record(z.string(), z.unknown()).optional();

const folderColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
const folderIconSchema = z.string().regex(/^[0-9A-Fa-f]{4,6}(?:-[0-9A-Fa-f]{4,6})*$/);
const themeSeedSchema = z.strictObject({
  neutral: z.string().regex(/^#[\da-fA-F]{6}$/).optional(),
  primary: z.string().regex(/^#[\da-fA-F]{6}$/).optional(),
  success: z.string().regex(/^#[\da-fA-F]{6}$/).optional(),
  warning: z.string().regex(/^#[\da-fA-F]{6}$/).optional(),
  destructive: z.string().regex(/^#[\da-fA-F]{6}$/).optional(),
});
const customFontStackSchema = z.string().trim().refine((value) => {
  if (!value) {
    return true;
  }

  if (value.length > 180 || /[;{}]|url\s*\(|var\s*\(|@import|expression\s*\(/i.test(value)) {
    return false;
  }

  return value.split(',').every((part) => {
    const family = part.trim();
    return family.length > 0
      && family.length <= 64
      && (/^(?:"[^"\\\r\n]+"|'[^'\\\r\n]+')$/.test(family) || /^[-\w. ]+$/.test(family));
  });
});
const typographySchema = z.strictObject({
  uiFontStack: customFontStackSchema,
  editorFontStack: customFontStackSchema,
  uiFontSize: z.number().int().min(12).max(18),
  editorFontSize: z.number().int().min(10).max(32),
});
const electronActionIdSchema = z.enum([
  'open-command-palette',
  'open-quick-open',
  'open-settings',
  'toggle-theme',
  'set-editor-mode-standard',
  'set-editor-mode-emacs',
  'set-editor-mode-vim',
  'set-editor-mode-helix',
  'set-editor-mode-kakoune',
  'new-tab',
  'new-note',
  'new-folder',
  'rename-folder',
  'delete-folder',
  'toggle-workspace-rail',
  'toggle-navigator',
  'toggle-inspector',
  'refresh',
  'search-notes',
  'navigate-back',
  'navigate-forward',
  'export-debug-logs',
  'go-history',
  'focus-workspace',
  'focus-navigator',
  'focus-editor',
  'focus-inspector',
  'save-note',
  'find-in-note',
  'attach-image',
  'export-note-markdown',
  'import-markdown-note',
  'open-note-web-editor',
  'delete-note',
  'close-tab',
  'close-other-tabs',
  'close-tabs-to-right',
  'reopen-last-closed-tab',
  'split-pane-right',
  'move-tab-to-other-pane',
  'focus-next-tab',
  'focus-previous-tab',
  'focus-next-pane',
  'focus-previous-pane',
]);
const shortcutConfigSchema = z.string().trim().refine((value) => {
  if (value === 'none') {
    return true;
  }

  if (!value || value.includes(',')) {
    return false;
  }

  const lower = value.toLowerCase();
  if (['mod+a', 'mod+c', 'mod+d', 'mod+q', 'mod+v', 'mod+x', 'mod+z', 'mod+shift+z', 'mod+alt+i'].includes(lower)) {
    return false;
  }

  const parts = lower.split('+').filter(Boolean);
  const key = parts.at(-1);
  const hasModifier = parts.slice(0, -1).some((part) => (
    part === 'alt' || part === 'cmd' || part === 'command' || part === 'ctrl' || part === 'control'
    || part === 'meta' || part === 'mod' || part === 'option' || part === 'shift'
  ));

  return Boolean(key) && (hasModifier || key!.length > 1);
});
const shortcutActionIds = new Set(electronActionIdSchema.options);
const shortcutsSchema = z.record(z.string(), shortcutConfigSchema).superRefine((value, context) => {
  for (const actionId of Object.keys(value)) {
    if (!shortcutActionIds.has(actionId as (typeof electronActionIdSchema.options)[number])) {
      context.addIssue({
        code: 'custom',
        message: `Unknown shortcut action: ${actionId}`,
        path: [actionId],
      });
    }
  }
});

export const settingsUpdateSchema = z.strictObject({
  title: optionalStringSchema,
  hackmdApiToken: optionalStringSchema,
  appearance: z.strictObject({
    theme: z.enum(['dark', 'light', 'system']),
    presetId: z.enum(['hackmd-neo', 'hackmd-minimal', 'hackmd-nature', 'solarized', 'catppuccin', 'dracula', 'gruvbox']),
    customSeed: themeSeedSchema,
    typography: typographySchema,
  }).optional(),
  editor: z.strictObject({
    mode: z.enum(['standard', 'emacs', 'vim', 'helix', 'kakoune']),
  }).optional(),
  shortcuts: shortcutsSchema.optional(),
  onboarding: z.strictObject({
    hackmdTokenSetupDeferred: z.boolean(),
  }).optional(),
  localVault: z.strictObject({
    path: z.string().trim().min(1).nullable(),
  }).optional(),
});

export const localVaultRevisionSchema = z.strictObject({
  contentHash: nonEmptyStringSchema,
  mtimeMs: z.number().finite().nonnegative(),
});

export const localVaultCreateNoteInputSchema = z.strictObject({
  title: optionalStringSchema,
  parentPath: z.string().nullable().optional(),
  content: optionalStringSchema,
});

export const localVaultWriteInputSchema = z.strictObject({
  noteId: nonEmptyStringSchema,
  content: z.string(),
  expectedRevision: localVaultRevisionSchema,
});

export const localVaultRenameNoteInputSchema = z.strictObject({
  noteId: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  expectedRevision: localVaultRevisionSchema.optional(),
});

export const localVaultMoveNoteInputSchema = z.strictObject({
  noteId: nonEmptyStringSchema,
  parentPath: z.string().nullable(),
  expectedRevision: localVaultRevisionSchema.optional(),
});

export const localVaultTrashNoteInputSchema = z.strictObject({
  noteId: nonEmptyStringSchema,
});

export const localVaultRevealNoteInputSchema = z.strictObject({
  noteId: nonEmptyStringSchema,
});

export const localVaultImportAttachmentInputSchema = z.strictObject({
  noteId: nonEmptyStringSchema,
  fileName: nonEmptyStringSchema,
  mimeType: z.string(),
  bytes: z.instanceof(ArrayBuffer),
});

export const localVaultCreateFolderInputSchema = z.strictObject({
  name: nonEmptyStringSchema,
  parentPath: z.string().nullable().optional(),
});

export const localVaultRenameFolderInputSchema = z.strictObject({
  relativePath: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
});

export const localVaultMoveFolderInputSchema = z.strictObject({
  relativePath: nonEmptyStringSchema,
  parentPath: z.string().nullable(),
});

export const localVaultTrashFolderInputSchema = z.strictObject({
  relativePath: nonEmptyStringSchema,
});

export const localVaultRevealFolderInputSchema = z.strictObject({
  relativePath: nonEmptyStringSchema,
});

export const createNoteInputSchema = z.strictObject({
  title: optionalStringSchema,
  description: optionalStringSchema,
  tags: optionalStringArraySchema,
  content: optionalStringSchema,
  readPermission: notePermissionSchema.optional(),
  writePermission: notePermissionSchema.optional(),
  commentPermission: commentPermissionSchema.optional(),
  suggestEditPermission: suggestEditPermissionSchema.optional(),
  noteFeatures: noteFeaturesSchema,
  permalink: optionalStringSchema,
  parentFolderId: optionalStringSchema,
  origin: optionalStringSchema,
});

export const updateNoteInputSchema = z.strictObject({
  title: optionalStringSchema,
  content: optionalStringSchema,
  description: optionalStringSchema,
  tags: optionalStringArraySchema,
  readPermission: notePermissionSchema.optional(),
  writePermission: notePermissionSchema.optional(),
  permalink: optionalStringSchema,
  parentFolderId: z.string().nullable().optional(),
});

export const createFolderInputSchema = z.strictObject({
  name: nonEmptyStringSchema,
  description: optionalStringSchema,
  icon: folderIconSchema.optional(),
  color: folderColorSchema.optional(),
  parentFolderId: optionalStringSchema,
});

export const updateFolderInputSchema = z.strictObject({
  name: optionalStringSchema,
  description: nullableStringSchema.optional(),
  icon: folderIconSchema.nullable().optional(),
  color: folderColorSchema.nullable().optional(),
  parentFolderId: nullableStringSchema.optional(),
});

export const folderOrderSchema = z.record(z.string(), z.array(z.string()));

export const appFileFilterSchema = z.strictObject({
  name: nonEmptyStringSchema,
  extensions: z.array(nonEmptyStringSchema).min(1),
});

export const saveTextFileInputSchema = z.strictObject({
  defaultFileName: nonEmptyStringSchema,
  content: z.string(),
  filters: z.array(appFileFilterSchema).optional(),
});

export const openTextFileInputSchema = z.strictObject({
  filters: z.array(appFileFilterSchema).optional(),
});

export const confirmDialogOptionsSchema = z.strictObject({
  title: optionalStringSchema,
  message: nonEmptyStringSchema,
  detail: optionalStringSchema,
  confirmLabel: optionalStringSchema,
  cancelLabel: optionalStringSchema,
  destructive: z.boolean().optional(),
});

export const fatalRendererErrorSchema = z.strictObject({
  message: nonEmptyStringSchema,
  stack: optionalStringSchema,
  componentStack: optionalStringSchema,
  url: z.string(),
  userAgent: z.string(),
  platform: z.string(),
});

export const themeSurfaceInputSchema = z.strictObject({
  mode: z.enum(['dark', 'light']),
  background: z.string().regex(/^(?:#[\da-fA-F]{6}|rgb\(\d{1,3} \d{1,3} \d{1,3}(?: \/ (?:0|1|0?\.\d+))?\))$/),
});

export const uploadNoteImageInputSchema = z.strictObject({
  fileName: nonEmptyStringSchema,
  mimeType: z.string(),
  bytes: z.instanceof(ArrayBuffer),
});

export const openHackmdEditorInputSchema = z.strictObject({
  publishType: z.enum(['edit', 'view', 'slide', 'book']),
  shortId: z.string(),
  userPath: z.string().nullable(),
  teamPath: z.string().nullable(),
  permalink: z.string().nullable(),
  publishLink: z.string(),
});

export function validateIpcInput<T>(channel: string, schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);

  if (result.success) {
    return result.data;
  }

  const message = result.error.issues
    .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
    .join('; ');

  writeLog('ipc', 'invalid IPC payload', { channel, issues: result.error.issues }, 'warn');
  throw new Error(`Invalid ${channel} payload: ${message}`);
}

export function validateNonEmptyString(channel: string, input: unknown) {
  return validateIpcInput(channel, nonEmptyStringSchema, input);
}

export function validateOptionalNumber(channel: string, input: unknown) {
  return validateIpcInput(channel, z.number().finite().positive().optional(), input);
}

export function validateString(channel: string, input: unknown) {
  return validateIpcInput(channel, z.string(), input);
}

export function validateBoolean(channel: string, input: unknown) {
  return validateIpcInput(channel, z.boolean(), input);
}
