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

export const createNoteInputSchema = z.object({
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
}).strict();

export const updateNoteInputSchema = z.object({
  title: optionalStringSchema,
  content: optionalStringSchema,
  description: optionalStringSchema,
  tags: optionalStringArraySchema,
  readPermission: notePermissionSchema.optional(),
  writePermission: notePermissionSchema.optional(),
  permalink: optionalStringSchema,
  parentFolderId: z.string().nullable().optional(),
}).strict();

export const createFolderInputSchema = z.object({
  name: nonEmptyStringSchema,
  description: optionalStringSchema,
  icon: folderIconSchema.optional(),
  color: folderColorSchema.optional(),
  parentFolderId: optionalStringSchema,
}).strict();

export const updateFolderInputSchema = z.object({
  name: optionalStringSchema,
  description: nullableStringSchema.optional(),
  icon: folderIconSchema.nullable().optional(),
  color: folderColorSchema.nullable().optional(),
  parentFolderId: nullableStringSchema.optional(),
}).strict();

export const folderOrderSchema = z.record(z.string(), z.array(z.string()));

export const appFileFilterSchema = z.object({
  name: nonEmptyStringSchema,
  extensions: z.array(nonEmptyStringSchema).min(1),
}).strict();

export const saveTextFileInputSchema = z.object({
  defaultFileName: nonEmptyStringSchema,
  content: z.string(),
  filters: z.array(appFileFilterSchema).optional(),
}).strict();

export const openTextFileInputSchema = z.object({
  filters: z.array(appFileFilterSchema).optional(),
}).strict();

export const confirmDialogOptionsSchema = z.object({
  title: optionalStringSchema,
  message: nonEmptyStringSchema,
  detail: optionalStringSchema,
  confirmLabel: optionalStringSchema,
  cancelLabel: optionalStringSchema,
  destructive: z.boolean().optional(),
}).strict();

export const fatalRendererErrorSchema = z.object({
  message: nonEmptyStringSchema,
  stack: optionalStringSchema,
  componentStack: optionalStringSchema,
  url: z.string(),
  userAgent: z.string(),
  platform: z.string(),
}).strict();

export const uploadNoteImageInputSchema = z.object({
  fileName: nonEmptyStringSchema,
  mimeType: z.string(),
  bytes: z.instanceof(ArrayBuffer),
}).strict();

export const openHackmdEditorInputSchema = z.object({
  publishType: z.enum(['edit', 'view', 'slide', 'book']),
  shortId: z.string(),
  userPath: z.string().nullable(),
  teamPath: z.string().nullable(),
  permalink: z.string().nullable(),
  publishLink: z.string(),
}).strict();

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
