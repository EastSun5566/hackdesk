import Routes from '@/routes';
import { ThemeProvider } from '@/components/theme-provider';

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="theme">
      <Routes />
    </ThemeProvider>
  );
}

export default App;
