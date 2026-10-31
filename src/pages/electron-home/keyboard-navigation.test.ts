import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerEditorNavigationKeymap } from '@/lib/editor-navigation-keymap';
import { allocateNavigationCodes, collectNavigationTargets, isNavigationVisible, navigationHintPositions, navigateToTarget, safeNavigationLetters } from './keyboard-navigation';

function visibleRect<T extends HTMLElement>(element: T, top = 40) {
  vi.spyOn(element as HTMLElement, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, top, 100, 30));
  return element;
}
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('navigation codes', () => {
  it('uses unique prefix-free two-letter codes and preserves surviving IDs', () => {
    const first = allocateNavigationCodes(['a','b','c'], 'ijk', new Map())!;
    expect(new Set(first.values()).size).toBe(3);
    expect(Array.from(first.values()).every(code => code.length === 2)).toBe(true);
    const next = allocateNavigationCodes(['new','c','b'], 'ijk', first)!;
    expect(next.get('b')).toBe(first.get('b'));
    expect(next.get('c')).toBe(first.get('c'));
    expect(next.get('new')).not.toBe(next.get('b'));
  });
  it('uses three or four letters when needed without changing surviving two-letter codes', () => {
    const prior = new Map([['a','ii']]);
    const result = allocateNavigationCodes(['a',...Array.from({length:5},(_,i)=>String(i))], 'ij', prior)!;
    expect(result.get('a')).toBe('ii');
    for (const code of result.values()) for (const other of result.values()) if (code !== other) expect(other.startsWith(code)).toBe(false);
    expect(allocateNavigationCodes(Array.from({length:9},(_,i)=>String(i)), 'ij', new Map())?.get('0')).toHaveLength(4);
    expect(allocateNavigationCodes(Array.from({length:17},(_,i)=>String(i)), 'ij', new Map())).toBeNull();
    expect(allocateNavigationCodes(['a'], 'i', new Map())).toBeNull();
  });
  it('never allocates native, app, custom or installed editor bindings', () => {
    const mac = safeNavigationLetters('darwin', { 'new-note':'mod+i,mod+j' }, true, null);
    expect(mac).not.toMatch(/[acvxyzfhmpqwerij]/);
    const editor=document.createElement('div');editor.dataset.editorMode='standard';
    registerEditorNavigationKeymap(editor,()=>[[{key:'Mod-u'},{mac:'Meta-d',key:'Ctrl-d'}]]);
    expect(safeNavigationLetters('darwin', {},true,editor)).not.toMatch(/[ud]/);
    editor.dataset.editorMode='vim';
    expect(safeNavigationLetters('win32',{},true,editor)).toBe('');
    registerEditorNavigationKeymap(editor,()=>[[{any:()=>false}]]);
    expect(safeNavigationLetters('darwin',{},true,editor)).toBe('');
  });
  it.each(['darwin', 'win32', 'linux'])('reserves plain primary chords without excluding modified-only chords on %s', platform => {
    const letters = safeNavigationLetters(platform, { 'new-note': 'mod+shift+l' }, true, null);
    expect(letters).toContain('l');
    expect(letters).not.toMatch(/[er]/);
    const ids = Array.from({ length: 40 }, (_, index) => String(index));
    expect(allocateNavigationCodes(ids, letters, new Map())?.size).toBe(40);
    expect(allocateNavigationCodes(ids, safeNavigationLetters(platform, {}, true, null), new Map())?.size).toBe(40);
    expect(safeNavigationLetters(platform, { 'new-note': 'mod+l' }, true, null)).not.toContain('l');
    expect(safeNavigationLetters(platform, {}, true, null)).not.toContain('j');
    const editor = document.createElement('div');
    editor.dataset.editorMode = 'standard';
    registerEditorNavigationKeymap(editor, () => [[{ key: 'Mod-Shift-l' }, { key: 'Mod-Alt-g' }, { key: 'Mod-i' }]]);
    const editorLetters = safeNavigationLetters(platform, {}, true, editor);
    expect(editorLetters).toContain('l');
    expect(editorLetters).toContain('g');
    expect(editorLetters).not.toContain('i');
  });
});

describe('visible navigation targets', () => {
  it('collects stable IDs and only activates navigation, not ordinary controls', () => {
    document.body.innerHTML='<button data-workspace-navigation-id="personal">Home</button><button role="tab" data-navigation-tab-id="t1">Tab</button><div data-folder-tree-row-id="note:n1"><button role="treeitem">Note</button></div><input name="noteSearch"><button data-navigation-toolbar data-navigation-action="save-note">Save</button>';
    document.querySelectorAll<HTMLElement>('button,input').forEach(element=>visibleRect(element));
    const targets=collectNavigationTargets({},'darwin',true);
    expect(targets.map(target=>target.id)).toEqual(['workspace:personal','tab:t1','tree:note:n1','finder','toolbar:::save-note']);
    const save=targets.at(-1)!;const click=vi.fn();save.element.onclick=click;
    expect(navigateToTarget(save)).toBe(true);expect(save.element).toHaveFocus();expect(click).not.toHaveBeenCalled();
    const note=targets[2];note.element.onclick=click;navigateToTarget(note);expect(click).toHaveBeenCalledOnce();
  });
  it('excludes hidden, disabled, clipped, covered and offscreen targets', () => {
    const button=visibleRect(document.createElement('button'));document.body.append(button);
    expect(isNavigationVisible(button)).toBe(true);
    button.disabled=true;expect(isNavigationVisible(button)).toBe(false);button.disabled=false;
    button.hidden=true;expect(isNavigationVisible(button)).toBe(false);button.hidden=false;
    button.style.opacity='0';expect(isNavigationVisible(button)).toBe(false);button.style.opacity='1';
    vi.mocked(button.getBoundingClientRect).mockReturnValue(new DOMRect(-120,20,100,20));expect(isNavigationVisible(button)).toBe(false);
    vi.mocked(button.getBoundingClientRect).mockReturnValue(new DOMRect(20,120,100,20));
    const parent=visibleRect(document.createElement('div'));parent.style.overflow='hidden';document.body.append(parent);parent.append(button);expect(isNavigationVisible(button)).toBe(false);
  });
  it('scopes Settings hints to visible controls and only focuses them', () => {
    document.body.innerHTML = '<button data-navigation-toolbar>Background</button><div role="dialog" data-keyboard-navigation-scope="settings" data-navigation-page="general"><input id="settings-title"><button aria-label="Save">Save</button><button aria-label="Save">Other save</button><input hidden></div>';
    document.querySelectorAll<HTMLElement>('div,button,input').forEach(element => visibleRect(element));
    const targets = collectNavigationTargets({}, 'darwin', true);
    expect(targets).toHaveLength(3);
    expect(new Set(targets.map(target => target.id)).size).toBe(3);
    expect(targets.every(target => target.id.startsWith('settings:general:') && !target.activate)).toBe(true);
    const click = vi.fn();
    targets[1].element.onclick = click;
    navigateToTarget(targets[1]);
    expect(targets[1].element).toHaveFocus();
    expect(click).not.toHaveBeenCalled();
    const menu = visibleRect(document.createElement('div'));
    menu.setAttribute('role', 'menu'); document.body.append(menu);
    expect(collectNavigationTargets({}, 'darwin', true)).toEqual([]);
  });
  it('removes background targets while a dialog or drag is active',()=>{
    document.body.innerHTML='<button data-navigation-toolbar>Button</button><div role="dialog">Modal</div>';
    visibleRect(document.querySelector('button')!);
    expect(collectNavigationTargets({},'darwin',true)).toEqual([]);
    document.querySelector('[role="dialog"]')!.remove();document.body.firstElementChild!.setAttribute('data-hackdesk-dragging','true');
    expect(collectNavigationTargets({},'darwin',true)).toEqual([]);
  });
});

it.each([['Ctrl+Alt+B', 70], ['Ctrl+Shift+R', 82]])('keeps dense toolbar hints showing %s within the viewport and apart', (shortcut, width) => {
  const hints = Array.from({ length: 8 }, (_, index) => ({ id: String(index), element: document.createElement('button'), activate: false, code: 'ij', shortcut, rect: new DOMRect(index * 28, 0, 24, 24) }));
  const positions = navigationHintPositions(hints, '', { width: 600, height: 400 });
  // Each hint is as wide as its rendered shortcut: about 6px a glyph, plus padding and border.
  for (const a of positions) {
    expect(a.top).toBeGreaterThanOrEqual(2);
    for (const b of positions) if (a !== b) expect(a.left < b.left + width && a.left + width > b.left && a.top < b.top + 30 && a.top + 30 > b.top).toBe(false);
  }
});
