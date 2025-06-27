// Check if the script has already been loaded and executed.
// If so, return immediately to prevent re-initialization.
if (window._HD_APP_INIT_SCRIPT_LOADED) {
  return;
}
window._HD_APP_INIT_SCRIPT_LOADED = true;

function init() {
  const invoke = window.__TAURI__.invoke;

  /** from {@link https://github.com/lencx/ChatGPT/blob/fac5a4399ed553424be5388fe5eb24d5e5c0e98c/scripts/core.js#L102-L108} */
  document.addEventListener('click', ({ target }) => {
    // Ensure target is an Element before calling closest on it.
    if (!(target instanceof Element)) {
      return;
    }
    const origin = target.closest('a');

    // Ensure the link is valid (has href, target) and not targeting _self before invoking open_link.
    if (origin && origin.href && origin.target && origin.target !== '_self') {
      invoke('open_link', { url: origin.href });
    }
  });

  // Note: The original `window._HD_INIT_FUNCTION_RUN` guard that was inside this `init` function
  // has been removed. The script-level `_HD_APP_INIT_SCRIPT_LOADED` guard at the top
  // effectively prevents this `init` function itself from being defined and called more than once
  // if the entire script is processed multiple times.
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}
