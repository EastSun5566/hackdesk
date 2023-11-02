import { useLayoutEffect } from 'react';
import { useLocation, useRoutes, type RouteObject } from 'react-router-dom';

import { 
  CommandPalette,
  Settings,
} from './pages';

const routes: RouteObject[] = [
  {
    path: '/settings',
    element: <Settings />,
  },
  {
    path: '/command-palette',
    element: <CommandPalette />,
  },
];

export default () => {
  const location = useLocation();
  const pathname = location.pathname;

  useLayoutEffect(() => {
    const name = pathname.substring(1).replace(/\//gi, '_');
    document.body.className = `${name ? name : 'main'}-screen`;
  }, [pathname]);

  return useRoutes(routes);
};
