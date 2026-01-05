function init() {
  if (window._HD_INIT) return;

  const invoke = window.__TAURI_INTERNALS__.invoke;

  /** from {@link https://github.com/lencx/ChatGPT/blob/fac5a4399ed553424be5388fe5eb24d5e5c0e98c/scripts/core.js#L102-L108} */
  document.addEventListener('click', ({ target }) => {
    const origin = target.closest('a');
    if (!origin || !origin.target) return;
    if (origin && origin.href && origin.target !== '_self') {
      invoke('open_link', { url: origin.href });
    }
  });

  window._HD_INIT = true;
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}
