function init() {
  if (window._HD_INIT) return;

  const invoke = window.__TAURI__.invoke;

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
