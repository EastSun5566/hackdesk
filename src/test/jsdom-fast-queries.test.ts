// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';

import { installJsdomFastQueries } from './jsdom-fast-queries';

// The node test project runs this file in its own jsdom, so jsdom's getters can be kept and compared
// before the replacements are installed.
const nativeLabelsGetters = new Map<object, (this: HTMLElement) => NodeListOf<HTMLLabelElement> | null>();
const nativeElementQuery = Element.prototype.querySelector;
const nativeDocumentQuery = Document.prototype.querySelector;

beforeAll(() => {
  for (const type of [HTMLInputElement, HTMLButtonElement, HTMLSelectElement, HTMLTextAreaElement, HTMLOutputElement]) {
    nativeLabelsGetters.set(type.prototype, Object.getOwnPropertyDescriptor(type.prototype, 'labels')!.get!);
  }
  installJsdomFastQueries();
});

function nativeLabels(element: HTMLElement) {
  const labels = nativeLabelsGetters.get(Object.getPrototypeOf(element))!.call(element);
  return labels === null ? null : Array.from(labels);
}

function fastLabels(element: HTMLElement) {
  const labels = (element as HTMLInputElement).labels;
  return labels === null ? null : Array.from(labels);
}

function nativeQuery(root: Element | Document, selectors: string) {
  return root instanceof Document ? nativeDocumentQuery.call(root, selectors) : nativeElementQuery.call(root, selectors);
}

describe('element.labels', () => {
  it.each([
    ['a for= label', '<label for="a">A</label><input id="a">', '#a'],
    ['a wrapping label', '<label>A <input id="a"></label>', '#a'],
    ['several labels in tree order', '<label for="a">1</label><label>2 <input id="a"></label><label for="a">3</label>', '#a'],
    ['a wrapping label that names another control', '<label for="b">A <input id="a"></label><input id="b">', '#a'],
    ['only the first control inside a wrapping label', '<label><input id="a"><input id="b"></label>', '#b'],
    ['a label for a non-labelable element', '<label for="d">A</label><div id="d"></div><input id="a">', '#a'],
    ['a button', '<label for="a">A</label><button id="a"></button>', '#a'],
    ['a select', '<label>A <select id="a"></select></label>', '#a'],
    ['a textarea', '<label for="a">A</label><textarea id="a"></textarea>', '#a'],
    ['an output', '<label for="a">A</label><output id="a"></output>', '#a'],
    ['a hidden input', '<label for="a">A</label><input id="a" type="hidden">', '#a'],
    ['no labels', '<input id="a">', '#a'],
  ])('matches jsdom for %s', (_case, html, selector) => {
    document.body.innerHTML = html;
    const element = document.querySelector<HTMLElement>(selector)!;
    expect(fastLabels(element)).toEqual(nativeLabels(element));
  });

  it('matches jsdom in a detached tree rooted at a label', () => {
    const label = document.createElement('label');
    const input = label.appendChild(document.createElement('input'));
    expect(fastLabels(input)).toEqual(nativeLabels(input));
    expect(fastLabels(input)).toEqual([label]);
  });

  it('sees DOM changes made since the last read', () => {
    document.body.innerHTML = '<label for="a">1</label><input id="a"><input id="b">';
    const a = document.querySelector<HTMLInputElement>('#a')!;
    const b = document.querySelector<HTMLInputElement>('#b')!;
    expect(fastLabels(a)).toHaveLength(1);

    const added = document.body.appendChild(document.createElement('label'));
    added.htmlFor = 'a';
    expect(fastLabels(a)).toEqual(nativeLabels(a));
    expect(fastLabels(a)).toHaveLength(2);

    added.htmlFor = 'b';
    expect(fastLabels(b)).toEqual(nativeLabels(b));
    expect(fastLabels(a)).toHaveLength(1);

    b.id = 'c';
    expect(fastLabels(b)).toEqual([]);

    a.type = 'hidden';
    expect(fastLabels(a)).toBeNull();
    a.type = 'text';
    document.querySelector('label')!.remove();
    expect(fastLabels(a)).toEqual(nativeLabels(a));
    expect(fastLabels(a)).toEqual([]);
  });

  it('supports item() and length like a NodeList', () => {
    document.body.innerHTML = '<label for="a">A</label><input id="a">';
    const labels = document.querySelector<HTMLInputElement>('#a')!.labels!;
    expect(labels.length).toBe(1);
    expect(labels.item(0)).toBe(document.querySelector('label'));
    expect(labels.item(1)).toBeNull();
  });
});

describe('querySelector with an id attribute selector', () => {
  const html = `
    <div id="outside"></div>
    <section id="container"><p id="dup"></p><span id="inside"></span></section>
    <p id="dup"></p>
    <aside id="other"><b id="first-dup"></b></aside>
    <section id="second"><b id="first-dup"></b></section>`;

  it.each([
    ['the document', () => document, '[id="inside"]'],
    ['the document, for a missing id', () => document, '[id="missing"]'],
    ['an element containing the match', () => document.getElementById('container')!, '[id="inside"]'],
    ['an element not containing the match', () => document.getElementById('container')!, '[id="outside"]'],
    ['an element, for the element itself', () => document.getElementById('container')!, '[id="container"]'],
    ['an element, for an id duplicated after it', () => document.getElementById('container')!, '[id="dup"]'],
    ['an element whose id match comes later than an earlier duplicate', () => document.getElementById('second')!, '[id="first-dup"]'],
    ['another selector', () => document.getElementById('container')!, 'span'],
  ])('matches jsdom for %s', (_case, root, selectors) => {
    document.body.innerHTML = html;
    expect(root().querySelector(selectors)).toBe(nativeQuery(root(), selectors));
  });

  it('matches jsdom in a detached tree', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span id="inside"></span>';
    document.body.innerHTML = '<span id="inside"></span>';
    expect(root.querySelector('[id="inside"]')).toBe(nativeQuery(root, '[id="inside"]'));
    expect(root.querySelector('[id="inside"]')).toBe(root.firstChild);
  });
});
