// Two DOM lookups that are slow in jsdom on a large tree, answered faster with the same results.
// Settings mounts about 1,500 nodes, and a single `screen.getByLabelText` there took about 300 ms
// after any DOM change. Both are installed for every renderer test from src/test/setup.ts.
//
// 1. `element.labels`. jsdom builds it as a live NodeList that walks the whole document each time
//    it is read after a DOM change. Testing Library reads it for every form control on every
//    `*ByLabelText` query, and Base UI fields read it while they mount. The replacement builds one
//    map from each label's control to its labels and rebuilds it only after the DOM has changed: a
//    MutationObserver's `takeRecords()` reports pending changes synchronously, so a read never sees
//    a stale map. Elements outside the document (detached, or in a shadow root) scan their own tree.
//
// 2. `querySelector('[id="…"]')`. Testing Library resolves every `aria-labelledby` id this way,
//    and jsdom's selector engine scans the tree for each. `getElementById` returns the first element
//    with that id in document order; when it lies inside the queried root it is also the first match
//    there. Every other case falls through to the original `querySelector`.

type Labels = NodeListOf<HTMLLabelElement>;

const LABELABLE_TYPES = [
  HTMLButtonElement,
  HTMLInputElement,
  HTMLMeterElement,
  HTMLOutputElement,
  HTMLProgressElement,
  HTMLSelectElement,
  HTMLTextAreaElement,
];

function asNodeList(labels: HTMLLabelElement[]): Labels {
  return Object.assign(labels, { item: (index: number) => labels[index] ?? null }) as unknown as Labels;
}

function labelsInTree(root: Node, element: HTMLElement): HTMLLabelElement[] {
  const candidates: HTMLLabelElement[] = [];
  if (root instanceof HTMLLabelElement) candidates.push(root);
  if (root instanceof Document || root instanceof DocumentFragment || root instanceof Element) {
    candidates.push(...root.querySelectorAll('label'));
  }
  return candidates.filter((label) => label.control === element);
}

function installFastLabels() {
  let byControl: Map<HTMLElement, HTMLLabelElement[]> | null = null;
  const observer = new MutationObserver(() => {
    byControl = null;
  });
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['id', 'for', 'type'],
  });

  function documentLabels() {
    if (observer.takeRecords().length > 0) byControl = null;
    if (!byControl) {
      byControl = new Map();
      for (const label of document.querySelectorAll('label')) {
        const control = label.control;
        if (!control) continue;
        const labels = byControl.get(control);
        if (labels) labels.push(label);
        else byControl.set(control, [label]);
      }
    }
    return byControl;
  }

  for (const type of LABELABLE_TYPES) {
    Object.defineProperty(type.prototype, 'labels', {
      configurable: true,
      get(this: HTMLElement): Labels | null {
        if (this instanceof HTMLInputElement && this.type === 'hidden') return null;
        const root = this.getRootNode();
        const labels = root === document ? documentLabels().get(this) ?? [] : labelsInTree(root, this);
        return asNodeList([...labels]);
      },
    });
  }
}

const ID_SELECTOR = /^\[id="([^"\\]+)"\]$/;

function installFastIdQuery() {
  for (const prototype of [Element.prototype, Document.prototype]) {
    const original = prototype.querySelector as (this: Element | Document, selectors: string) => Element | null;
    Object.defineProperty(prototype, 'querySelector', {
      configurable: true,
      writable: true,
      value(this: Element | Document, selectors: string) {
        const id = ID_SELECTOR.exec(selectors)?.[1];
        const document = this instanceof Document ? this : this.ownerDocument;
        if (id !== undefined && (this === document || this.isConnected)) {
          // No element in the document has this id, so none inside a connected root has it either.
          const match = document.getElementById(id);
          if (!match) return null;
          if (this === document || (this !== match && this.contains(match))) return match;
        }
        return original.call(this, selectors);
      },
    });
  }
}

export function installJsdomFastQueries() {
  installFastLabels();
  installFastIdQuery();
}
