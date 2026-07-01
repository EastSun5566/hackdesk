import { forwardRef, lazy, Suspense } from 'react';

import type { MarkdownEditorHandle, MarkdownEditorProps } from './markdown-editor-types';

const LazyMarkdownEditor = lazy(async () => {
  const module = await import('./hackmd-live-preview/HackmdMarkdownEditorCore');
  return { default: module.HackmdMarkdownEditorCore };
});

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
