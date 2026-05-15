function init() {
  if (window._HD_INIT) return;

  const invoke = window.__TAURI__.core.invoke;

  let lastUrl = '';
  let lastTitle = '';

  const syncCurrentPageContext = () => {
    const nextUrl = window.location.href;
    const nextTitle = document.title;

    if (nextUrl === lastUrl && nextTitle === lastTitle) {
      return;
    }

    lastUrl = nextUrl;
    lastTitle = nextTitle;

    invoke('set_current_page_context', {
      context: {
        url: nextUrl,
        title: nextTitle,
      },
    }).catch(() => {
      // Ignore bridge errors in the injected page context.
    });
  };

  const wrapHistoryMethod = (methodName) => {
    const originalMethod = window.history[methodName];

    window.history[methodName] = function patchedHistoryMethod(...args) {
      const result = originalMethod.apply(this, args);
      queueMicrotask(syncCurrentPageContext);
      return result;
    };
  };

  wrapHistoryMethod('pushState');
  wrapHistoryMethod('replaceState');

  window.addEventListener('popstate', syncCurrentPageContext);
  window.addEventListener('hashchange', syncCurrentPageContext);
  window.setInterval(syncCurrentPageContext, 1000);

  /** from {@link https://github.com/lencx/ChatGPT/blob/fac5a4399ed553424be5388fe5eb24d5e5c0e98c/scripts/core.js#L102-L108} */
  document.addEventListener('click', (event) => {
    const { target } = event;
    const origin = target.closest('a');
    if (!origin || !origin.target) return;
    if (origin && origin.href && origin.target !== '_self') {
      event.preventDefault();
      invoke('open_link', { url: origin.href });
    }
  });

  syncCurrentPageContext();

  window._HD_INIT = true;
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}
