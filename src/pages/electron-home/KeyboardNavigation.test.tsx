import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HINT_DELAY_MS, KeyboardNavigation } from './KeyboardNavigation';

function fixture(platform = 'darwin') {
  render(<KeyboardNavigation workspaceKey="local:vault" platform={platform} characterEnabled><button data-workspace-navigation-id="local">Vault</button><button data-navigation-toolbar="true">Save</button></KeyboardNavigation>);
  for(const button of screen.getAllByRole('button'))vi.spyOn(button,'getBoundingClientRect').mockReturnValue(new DOMRect(30,40,100,30));
  screen.getByText('Vault').focus();
  return platform === 'darwin' ? {key:'Meta',metaKey:true} : {key:'Control',ctrlKey:true};
}
// Hints show only after the key has been held for a moment.
function hold(modifier: ReturnType<typeof fixture>){fireEvent.keyDown(window,modifier);act(()=>{vi.advanceTimersByTime(HINT_DELAY_MS);});}
function codeFor(id:string){return document.querySelector<HTMLElement>(`[data-navigation-hint="${id}"]`)!.dataset.navigationCode!;}
function type(code:string, modifier:ReturnType<typeof fixture>){for(const key of code)fireEvent.keyDown(window,{...modifier,key});}
// Only timeouts are faked: frame callbacks and Testing Library's polling keep real time.
beforeEach(()=>{vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

describe('held modifier navigation',()=>{
  it('waits a moment before showing hints, and a quick chord such as Cmd+Right never shows them',()=>{
    const modifier=fixture();
    fireEvent.keyDown(window,modifier);
    act(()=>{vi.advanceTimersByTime(HINT_DELAY_MS-50);});
    expect(document.querySelector('[data-keyboard-navigation-overlay]')).toBeNull();
    expect(document.documentElement.dataset.navigationHints).toBeUndefined();
    const arrow=new KeyboardEvent('keydown',{...modifier,key:'ArrowRight',cancelable:true});
    act(()=>{window.dispatchEvent(arrow);});
    expect(arrow.defaultPrevented).toBe(false);
    act(()=>{vi.advanceTimersByTime(HINT_DELAY_MS);});
    expect(document.querySelector('[data-keyboard-navigation-overlay]')).toBeNull();

    fireEvent.keyUp(window,{...modifier,metaKey:false});
    hold(modifier);
    expect(document.querySelector('[data-keyboard-navigation-overlay]')).not.toBeNull();
  });
  it('drops a pending hold when the key is released early',()=>{
    const modifier=fixture();
    fireEvent.keyDown(window,modifier);
    fireEvent.keyUp(window,{...modifier,metaKey:false});
    act(()=>{vi.advanceTimersByTime(HINT_DELAY_MS);});
    expect(document.querySelector('[data-keyboard-navigation-overlay]')).toBeNull();
  });
  it.each(['darwin','win32','linux'])('navigates in %s, then clears until release',platform=>{
    const modifier=fixture(platform);const click=vi.fn();screen.getByText('Vault').onclick=click;
    hold(modifier);const code=codeFor('workspace:local');type(code,modifier);
    expect(click).toHaveBeenCalledOnce();expect(document.querySelector('[data-keyboard-navigation-overlay]')).toBeNull();
    fireEvent.keyDown(window,{...modifier,key:code[0]});expect(click).toHaveBeenCalledOnce();
    fireEvent.keyUp(window,{...modifier,key:modifier.key,metaKey:false,ctrlKey:false});hold(modifier);expect(codeFor('workspace:local')).toBe(code);
  });
  it('filters by prefix, supports Backspace, and focuses action buttons without executing',()=>{
    const modifier=fixture();const click=vi.fn();const save=screen.getByText('Save');save.onclick=click;hold(modifier);
    const code=codeFor('toolbar:::null');type(code[0],modifier);
    expect(Array.from(document.querySelectorAll<HTMLElement>('[data-navigation-code]')).every(element=>element.dataset.navigationCode!.startsWith(code[0]))).toBe(true);
    fireEvent.keyDown(window,{...modifier,key:'Backspace'});expect(document.querySelectorAll('[data-navigation-code]')).toHaveLength(2);
    type(code,modifier);expect(save).toHaveFocus();expect(click).not.toHaveBeenCalled();
  });
  it('marks the document while hints show, so on-demand controls appear before codes are assigned',()=>{
    const modifier=fixture();expect(document.documentElement.dataset.navigationHints).toBeUndefined();
    hold(modifier);expect(document.documentElement.dataset.navigationHints).toBe('true');
    fireEvent.keyDown(window,{...modifier,key:'Escape'});expect(document.documentElement.dataset.navigationHints).toBeUndefined();
  });
  it('preserves fixed shortcuts and clears on Escape, blur, IME and unmount',()=>{
    const modifier=fixture();hold(modifier);
    const event=new KeyboardEvent('keydown',{...modifier,key:'s',cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);
    for(const cancel of [()=>fireEvent.keyDown(window,{...modifier,key:'Escape'}),()=>fireEvent.blur(window),()=>fireEvent.compositionStart(window)]){
      fireEvent.keyUp(window,{key:'Meta'});hold(modifier);cancel();expect(document.querySelector('[data-keyboard-navigation-overlay]')).toBeNull();
    }
  });
  it('cancels when targets change instead of reassigning mid-chord',async()=>{
    const modifier=fixture();hold(modifier);vi.useRealTimers();const save=screen.getByRole<HTMLButtonElement>('button', { name: 'Save' });save.disabled=true;
    await waitFor(()=>expect(document.querySelector('[data-keyboard-navigation-overlay]')).toBeNull());
  });
  it.each(['darwin', 'win32', 'linux'])('passes additional modifiers through unchanged on %s', platform => {
    const modifier = fixture(platform);
    for (const extra of [{ shiftKey: true }, { altKey: true }]) {
      fireEvent.keyUp(window, { key: modifier.key });
      hold(modifier);
      const event = new KeyboardEvent('keydown', { ...modifier, ...extra, key: 'l', cancelable: true });
      act(() => { window.dispatchEvent(event); });
      expect(event.defaultPrevented).toBe(false);
      expect(document.querySelector('[data-keyboard-navigation-overlay]')).toBeNull();
    }
  });
  it('cancels context changes without remounting the Workbench or resurrecting old hints',()=>{
    const child=<input aria-label="Draft" defaultValue="Unsaved draft"/>;
    const {rerender}=render(<KeyboardNavigation workspaceKey="a" platform="darwin" characterEnabled>{child}</KeyboardNavigation>);
    const input=screen.getByLabelText('Draft');
    hold({key:'Meta',metaKey:true});
    rerender(<KeyboardNavigation workspaceKey="b" platform="darwin" characterEnabled>{child}</KeyboardNavigation>);
    expect(screen.getByLabelText('Draft')).toBe(input);
    expect(document.querySelector('[data-keyboard-navigation-overlay]')).toBeNull();
    rerender(<KeyboardNavigation workspaceKey="a" platform="darwin" characterEnabled>{child}</KeyboardNavigation>);
    expect(document.querySelector('[data-keyboard-navigation-overlay]')).toBeNull();
    expect(input).toHaveValue('Unsaved draft');
  });

});
