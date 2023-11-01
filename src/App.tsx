import Routes from '@/routes';
import { ThemeProvider } from '@/components/theme-provider';
import '@/App.css';

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="hackmd-ui-theme">
      <Routes />
    </ThemeProvider>
  );
}

export default App;
