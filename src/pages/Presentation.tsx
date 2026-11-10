import 'reveal.js/reveal.css';
import 'reveal.js/plugin/highlight/monokai.css';
import 'katex/dist/katex.min.css';

import Reveal from 'reveal.js';
import RevealHighlight from 'reveal.js/plugin/highlight';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { parseSlides, type SlideTheme } from '@/lib/slides';

import { renderSlides } from './presentation/render-slides';

// Loaded as text: the remote font imports some themes have would fail the whole stylesheet here.
const THEME_STYLES: Record<SlideTheme, () => Promise<{ default: string }>> = {
  black: () => import('reveal.js/theme/black.css?inline'),
  white: () => import('reveal.js/theme/white.css?inline'),
  league: () => import('reveal.js/theme/league.css?inline'),
  beige: () => import('reveal.js/theme/beige.css?inline'),
  sky: () => import('reveal.js/theme/sky.css?inline'),
  night: () => import('reveal.js/theme/night.css?inline'),
  serif: () => import('reveal.js/theme/serif.css?inline'),
  simple: () => import('reveal.js/theme/simple.css?inline'),
  solarized: () => import('reveal.js/theme/solarized.css?inline'),
  blood: () => import('reveal.js/theme/blood.css?inline'),
  moon: () => import('reveal.js/theme/moon.css?inline'),
  dracula: () => import('reveal.js/theme/dracula.css?inline'),
  'black-contrast': () => import('reveal.js/theme/black-contrast.css?inline'),
  'white-contrast': () => import('reveal.js/theme/white-contrast.css?inline'),
};

const ESCAPE_KEY = 27;
const F_KEY = 70;
/** The full screen button shows while the pointer moves, then fades so it never sits on a talk. */
const CONTROLS_IDLE_MS = 2000;

/** Drops `@import`s of web fonts, which the app does not load; the theme falls back to system fonts. */
const withoutRemoteImports = (css: string) => css.replace(/@import\s*(?:url\()?\s*["']?https?:[^;]*;/g, '');

/**
 * The presentation window: the note it was opened with, as reveal.js slides, filling the window it
 * opened in. The button in the corner, or F, puts it full screen. Esc leaves full screen, then closes.
 */
export default function Presentation() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const fullScreenRef = useRef(false);
  const [controlsShown, setControlsShown] = useState(true);

  useEffect(() => window.hackdeskPresentationAPI?.onFullScreenChange((next) => {
    fullScreenRef.current = next;
    setFullScreen(next);
  }), []);

  // The window reports full screen only once it has switched. Until then, the state asked for
  // decides what Esc does, so F followed at once by Esc leaves full screen instead of closing.
  const toggleFullScreen = useCallback(() => {
    const api = window.hackdeskPresentationAPI;
    if (!api) return;
    fullScreenRef.current = !fullScreenRef.current;
    setFullScreen(fullScreenRef.current);
    void api.toggleFullScreen().then((next) => {
      fullScreenRef.current = next;
      setFullScreen(next);
    });
  }, []);

  useEffect(() => {
    let timer = window.setTimeout(() => setControlsShown(false), CONTROLS_IDLE_MS);
    const show = () => {
      setControlsShown(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setControlsShown(false), CONTROLS_IDLE_MS);
    };
    window.addEventListener('pointermove', show);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', show);
    };
  }, []);

  useEffect(() => {
    const api = window.hackdeskPresentationAPI;
    const host = hostRef.current;
    if (!api || !host) return;
    // reveal.js owns this markup, so it is built here rather than rendered by React.
    const element = document.createElement('div');
    element.className = 'reveal';
    const slidesElement = document.createElement('div');
    slidesElement.className = 'slides';
    element.append(slidesElement);
    host.replaceChildren(element);
    let reveal: InstanceType<typeof Reveal> | null = null;
    let cancelled = false;

    const start = async () => {
      const deck = await api.getDeck();
      if (cancelled) return;
      if (!deck) {
        setError('Nothing to present. Choose Present on a note to start.');
        return;
      }
      // Presenting again reloads these slides in a window that may already be full screen.
      fullScreenRef.current = deck.fullScreen;
      setFullScreen(deck.fullScreen);

      const slides = parseSlides(deck.content);
      document.title = slides.title ?? deck.title ?? 'Presentation';
      if (slides.lang) element.lang = slides.lang;
      const theme = document.createElement('style');
      theme.textContent = withoutRemoteImports((await THEME_STYLES[slides.theme]()).default);
      if (cancelled) return;
      document.head.append(theme);

      slidesElement.replaceChildren(...renderSlides(slides));
      const keyboard = typeof slides.options.keyboard === 'object' ? slides.options.keyboard : {};
      reveal = new Reveal(element, {
        ...slides.options,
        // The window's own route is the URL hash, so reveal.js must never write to it.
        hash: false,
        history: false,
        keyboard: {
          ...keyboard,
          // Esc steps back: out of full screen first, then out of the presentation.
          [ESCAPE_KEY]: () => (fullScreenRef.current ? toggleFullScreen() : void api.close()),
          // reveal.js's own F asks the page for full screen; this one is the window's, like the button.
          [F_KEY]: toggleFullScreen,
        },
        plugins: [RevealHighlight],
      });
      await reveal.initialize();
    };

    // reveal.js follows `#/2` and slide-id links itself; any other `#` link would replace the route.
    const keepRoute = (event: MouseEvent) => {
      if (!event.defaultPrevented && event.target instanceof Element && event.target.closest('a[href^="#"]')) {
        event.preventDefault();
      }
    };
    window.addEventListener('click', keepRoute);

    start().catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not present this note.');
    });
    return () => {
      cancelled = true;
      window.removeEventListener('click', keepRoute);
      reveal?.destroy();
    };
  }, [toggleFullScreen]);

  return (
    <div className="fixed inset-0 bg-zinc-900">
      {error ? (
        <p role="alert" className="flex h-full items-center justify-center p-8 text-center text-lg text-white">{error}</p>
      ) : null}
      <div ref={hostRef} hidden={Boolean(error)} className="size-full" />
      {error ? null : (
        <button
          type="button"
          onClick={(event) => {
            // A clicked button keeps focus, and Space would press it again instead of moving on a slide.
            if (event.detail > 0) event.currentTarget.blur();
            toggleFullScreen();
          }}
          aria-label={fullScreen ? 'Exit Full Screen' : 'Full Screen'}
          title={fullScreen ? 'Exit Full Screen (F)' : 'Full Screen (F)'}
          data-shown={controlsShown || undefined}
          className="fixed right-3 top-3 z-50 flex size-9 items-center justify-center rounded-md bg-black/50 text-white opacity-0 transition-opacity duration-200 hover:bg-black/70 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white data-shown:opacity-100 motion-reduce:transition-none"
        >
          {fullScreen ? <Minimize2 aria-hidden="true" className="size-4" /> : <Maximize2 aria-hidden="true" className="size-4" />}
        </button>
      )}
    </div>
  );
}
