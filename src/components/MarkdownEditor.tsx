import { forwardRef, lazy, Suspense } from 'react';

import type {
  HackmdMarkdownEditorHandle as MarkdownEditorHandle,
  HackmdMarkdownEditorProps as MarkdownEditorProps,
} from './hackmd-live-preview/HackmdMarkdownEditorCore';

type MarkdownEditorComponent =
  typeof import('./hackmd-live-preview/HackmdMarkdownEditorCore').HackmdMarkdownEditorCore;

const LazyMarkdownEditor = lazy(async () => {
  const module = await import('./hackmd-live-preview/HackmdMarkdownEditorCore');
  return { default: module.HackmdMarkdownEditorCore };
}) as MarkdownEditorComponent;

export type { MarkdownEditorHandle, MarkdownEditorProps };

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(props, ref) {
  return (
    <Suspense
      fallback={(
        <div className="markdown-editor min-h-0 flex-1 overflow-hidden bg-background-default" />
      )}
    >
      <LazyMarkdownEditor {...props} ref={ref} />
    </Suspense>
  );
});
