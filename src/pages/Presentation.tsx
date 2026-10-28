import 'reveal.js/reveal.css';
import 'reveal.js/plugin/highlight/monokai.css';
import 'katex/dist/katex.min.css';

import Reveal from 'reveal.js';
import RevealHighlight from 'reveal.js/plugin/highlight';
import { useEffect, useRef, useState } from 'react';

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

/** Drops `@import`s of web fonts, which the app does not load; the theme falls back to system fonts. */
const withoutRemoteImports = (css: string) => css.replace(/@import\s*(?:url\()?\s*["']?https?:[^;]*;/g, '');

/** The presentation window: the note it was opened with, as reveal.js slides. Esc closes it. */
export default function Presentation() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

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
        keyboard: { ...keyboard, [ESCAPE_KEY]: () => void api.close() },
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
  }, []);

  return (
    <div className="fixed inset-0 bg-zinc-900">
      {error ? (
        <p role="alert" className="flex h-full items-center justify-center p-8 text-center text-lg text-white">{error}</p>
      ) : null}
      <div ref={hostRef} hidden={Boolean(error)} className="size-full" />
    </div>
  );
}
