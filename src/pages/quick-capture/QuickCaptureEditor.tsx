import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';

import { quickCaptureMarkdownExtensions } from './quick-capture-markdown';

export type QuickCaptureEditorHandle = {
  focus: () => void;
};

export type QuickCaptureEditorProps = {
  value: string;
  label: string;
  placeholder: string;
  disabled: boolean;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

function contentAttributes({ label, invalid, describedBy }: Pick<QuickCaptureEditorProps, 'label' | 'invalid' | 'describedBy'>) {
  const attributes: Record<string, string> = {
    'aria-label': label,
    'aria-multiline': 'true',
    role: 'textbox',
  };
  if (invalid) attributes['aria-invalid'] = 'true';
  if (describedBy) attributes['aria-describedby'] = describedBy;
  return EditorView.contentAttributes.of(attributes);
}

function editable(disabled: boolean) {
  return [EditorView.editable.of(!disabled), EditorState.readOnly.of(disabled)];
}

/** The Quick Hack text field, a small Markdown editor. The parent owns the text. */
export const QuickCaptureEditor = forwardRef<QuickCaptureEditorHandle, QuickCaptureEditorProps>(function QuickCaptureEditor(
  props,
  ref,
) {
  const { value, label, disabled, invalid, describedBy } = props;
  const parentRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const compartments = useRef({ attributes: new Compartment(), editable: new Compartment() });

  const createState = (doc: string) => EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [
      quickCaptureMarkdownExtensions({
        placeholderText: latest.current.placeholder,
        onSubmit: () => latest.current.onSubmit(),
      }),
      compartments.current.attributes.of(contentAttributes(latest.current)),
      compartments.current.editable.of(editable(latest.current.disabled)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) latest.current.onChange(update.state.doc.toString());
      }),
    ],
  });

  useLayoutEffect(() => {
    const view = new EditorView({ state: createState(latest.current.value), parent: parentRef.current! });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The view is created once; later props reach it through the effects below.
  }, []);

  // Text replaced from outside (cleared after a capture) starts a fresh state, so undo cannot
  // bring back a capture that has already been sent.
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.setState(createState(value));
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: [
        compartments.current.attributes.reconfigure(contentAttributes({ label, invalid, describedBy })),
        compartments.current.editable.reconfigure(editable(disabled)),
      ],
    });
  }, [label, invalid, describedBy, disabled]);

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
  }), []);

  return <div ref={parentRef} className="min-h-0 flex-1 overflow-hidden" />;
});
