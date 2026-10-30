import { lazy, Suspense, useLayoutEffect } from 'react';
import { useLocation, useRoutes, type RouteObject } from 'react-router';

import { Home } from './pages/Home';
import { QuickCapture } from './pages/QuickCapture';

// reveal.js and its highlighter load only in the presentation window.
const Presentation = lazy(() => import('./pages/Presentation'));

const routes: RouteObject[] = [
  {
    path: '/present',
    element: <Suspense><Presentation /></Suspense>,
  },
  {
    path: '/electron',
    element: <Home />,
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
