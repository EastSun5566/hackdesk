import { lazy, Suspense, useLayoutEffect } from 'react';
import { useLocation, useRoutes, type RouteObject } from 'react-router';

import { QuickCapture } from './pages/QuickCapture';

// The workbench loads only in the main window, so the Quick Hack popup never parses it.
const Home = lazy(async () => {
  const module = await import('./pages/Home');
  return { default: module.Home };
});

// reveal.js and its highlighter load only in the presentation window.
const Presentation = lazy(() => import('./pages/Presentation'));

/** The frame Home paints first, so the window shows no other colour while the workbench loads. */
function HomeFallback() {
  return <div aria-hidden="true" data-testid="home-loading" className="app-chrome h-dvh bg-(--background-chrome)" />;
}

const routes: RouteObject[] = [
  {
    path: '/present',
    element: <Suspense><Presentation /></Suspense>,
  },
  {
    path: '/electron',
    element: <Suspense fallback={<HomeFallback />}><Home /></Suspense>,
  },
  {
    path: '/quick-capture',
    element: <QuickCapture />,
  },
];

export default function AppRoutes() {
  const location = useLocation();
  const pathname = location.pathname;

  useLayoutEffect(() => {
    const name = pathname.substring(1).replace(/\//gi, '_');
    document.body.className = `${name ? name : 'main'}-screen`;
  }, [pathname]);

  return useRoutes(routes);
}
