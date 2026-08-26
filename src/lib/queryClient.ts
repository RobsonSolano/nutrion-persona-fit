// Instância única do QueryClient.
//
// Vivia num `useMemo` dentro do RootLayout, o que a tornava inalcançável
// para o `useAuthBootstrap` — que roda ACIMA do QueryClientProvider e é o
// único lugar que observa troca de usuário. Sem acesso ao client ali, o
// cache sobrevivia ao logout e podia servir dado de um usuário para o
// próximo na mesma instalação.

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});
