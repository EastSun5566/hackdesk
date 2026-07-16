import { useLayoutEffect } from 'react';
import { useLocation, useRoutes, type RouteObject } from 'react-router-dom';

import { Home } from './pages/Home';
import { QuickCapture } from './pages/QuickCapture';

const routes: RouteObject[] = [
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
