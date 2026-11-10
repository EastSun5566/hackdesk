import { useEffect, useState } from 'react';

export interface ScrollOverflow {
  /** More content lies before the scrolled view (above, or to the left). */
  start: boolean;
  /** More content lies after the scrolled view (below, or to the right). */
  end: boolean;
}

const NO_OVERFLOW: ScrollOverflow = { start: false, end: false };

/**
 * Which edges of a scroller have content past them. Both are false when the content fits, so an
 * edge fade keyed on them shows only while the scroller actually scrolls, and never at the edge it
 * has reached. Pass the result to data-overflow-start / data-overflow-end.
 *
 * Re-measures on scroll, on the scroller's resize and on its children's resize (folders opening,
 * rows loading), and re-attaches to children as they mount and unmount.
 */
export function useScrollOverflow(scroller: HTMLElement | null, axis: 'x' | 'y'): ScrollOverflow {
  const [overflow, setOverflow] = useState(NO_OVERFLOW);

  useEffect(() => {
    if (!scroller) return;
    const update = () => {
      const offset = axis === 'x' ? scroller.scrollLeft : scroller.scrollTop;
      const view = axis === 'x' ? scroller.clientWidth : scroller.clientHeight;
      const content = axis === 'x' ? scroller.scrollWidth : scroller.scrollHeight;
      // A pixel of slack: fractional sizes can leave a sub-pixel range that is not a real scroll.
      const start = offset > 1;
      const end = offset + view < content - 1;
      setOverflow((current) => (current.start === start && current.end === end ? current : { start, end }));
    };

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    const observeChildren = () => {
      if (!resizeObserver) return;
      resizeObserver.disconnect();
      resizeObserver.observe(scroller);
      for (const child of scroller.children) resizeObserver.observe(child);
    };
    const mutationObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
        observeChildren();
        update();
      });

    observeChildren();
    mutationObserver?.observe(scroller, { childList: true });
    scroller.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      scroller.removeEventListener('scroll', update);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [axis, scroller]);

  return scroller ? overflow : NO_OVERFLOW;
}
