// Check if already initialized at the script level
if (window._HD_APP_INIT_SCRIPT_LOADED) {
  // Script has already run, do nothing.
} else {
  // Mark this script as loaded and processed immediately.
  window._HD_APP_INIT_SCRIPT_LOADED = true;

  function init() {
    // This inner guard is mostly for sanity, in case init() is somehow called multiple times
    // from within this script execution block, which shouldn't happen with the current structure.
    if (window._HD_APP_INIT_FUNCTION_RUN) return;

    const invoke = window.__TAURI__.invoke;

    /** from {@link https://github.com/lencx/ChatGPT/blob/fac5a4399ed553424be5388fe5eb24d5e5c0e98c/scripts/core.js#L102-L108} */
    document.addEventListener('click', ({ target }) => {
      const origin = target.closest('a');
      // Ensure origin, origin.href, and origin.target exist before trying to access origin.target
      // and ensure target is not _self.
      if (origin && origin.href && origin.target && origin.target !== '_self') {
        invoke('open_link', { url: origin.href });
      }
    });

    window._HD_APP_INIT_FUNCTION_RUN = true;
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
}
