import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './production/App';
import './production/styles.css';

declare global {
  interface Window {
    __purrQueryClient?: QueryClient;
  }
}

const queryClient =
  window.__purrQueryClient ??
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) => count < 2 && !(error instanceof Error && error.message.includes('401')),
        staleTime: 60_000,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  });

window.__purrQueryClient = queryClient;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>,
);
