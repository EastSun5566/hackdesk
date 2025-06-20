import {
  QueryClient,
  QueryClientProvider,
} from 'react-query';

import Routes from '@/routes';
import { ThemeProvider } from '@/components/theme-provider';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider storageKey="theme">
        <Routes />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
