import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyboardNavigation } from './KeyboardNavigation';

function fixture(platform = 'darwin') {
  render(<KeyboardNavigation workspaceKey="local:vault" platform={platform} characterEnabled><button data-workspace-navigation-id="local">Vault</button><button data-navigation-toolbar="true">Save</button></KeyboardNavigation>);
  for(const button of screen.getAllByRole('button'))vi.spyOn(button,'getBoundingClientRect').mockReturnValue(new DOMRect(30,40,100,30));
  screen.getByText('Vault').focus();
  return platform === 'darwin' ? {key:'Meta',metaKey:true} : {key:'Control',ctrlKey:true};
}
function hold(modifier: ReturnType<typeof fixture>){fireEvent.keyDown(window,modifier);}
function codeFor(id:string){return document.querySelector<HTMLElement>(`[data-navigation-hint="${id}"]`)!.dataset.navigationCode!;}
function type(code:string, modifier:ReturnType<typeof fixture>){for(const key of code)fireEvent.keyDown(window,{...modifier,key});}
afterEach(()=>{vi.restoreAllMocks();});

describe('held modifier navigation',()=>{
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
  it('preserves fixed shortcuts and clears on Escape, blur, IME and unmount',()=>{
    const modifier=fixture();hold(modifier);
    const event=new KeyboardEvent('keydown',{...modifier,key:'s',cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);
    for(const cancel of [()=>fireEvent.keyDown(window,{...modifier,key:'Escape'}),()=>fireEvent.blur(window),()=>fireEvent.compositionStart(window)]){
      fireEvent.keyUp(window,{key:'Meta'});hold(modifier);cancel();expect(document.querySelector('[data-keyboard-navigation-overlay]')).toBeNull();
    }
  });
  it('cancels when targets change instead of reassigning mid-chord',async()=>{
    const modifier=fixture();hold(modifier);const save=screen.getByText('Save');save.disabled=true;
    await waitFor(()=>expect(document.querySelector('[data-keyboard-navigation-overlay]')).toBeNull());
  });
  it('cancels context changes without remounting the Workbench or resurrecting old hints',()=>{
    const child=<input aria-label="Draft" defaultValue="Unsaved draft"/>;
    const {rerender}=render(<KeyboardNavigation workspaceKey="a" platform="darwin" characterEnabled>{child}</KeyboardNavigation>);
    const input=screen.getByLabelText('Draft');
    fireEvent.keyDown(window,{key:'Meta',metaKey:true});
    rerender(<KeyboardNavigation workspaceKey="b" platform="darwin" characterEnabled>{child}</KeyboardNavigation>);
    expect(screen.getByLabelText('Draft')).toBe(input);
    expect(document.querySelector('[data-keyboard-navigation-overlay]')).toBeNull();
    rerender(<KeyboardNavigation workspaceKey="a" platform="darwin" characterEnabled>{child}</KeyboardNavigation>);
    expect(document.querySelector('[data-keyboard-navigation-overlay]')).toBeNull();
    expect(input).toHaveValue('Unsaved draft');
  });

});
