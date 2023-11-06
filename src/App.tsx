import Routes from '@/routes';
import { ThemeProvider } from '@/components/theme-provider';

function App() {
  return (
    <ThemeProvider storageKey="theme">
      <Routes />
    </ThemeProvider>
  );
}

export default App;
