import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Vitest escopado à lógica pura do app (src/lib/**), sem JSX/React Native.
// Os testes de UI seguem verificação manual + typecheck (ver .specs/features/2026-06-22-paywall-ui/design.md).
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    // src/lib + lógica pura das edges (módulos TS sem imports Deno, ex: mapEvent).
    include: ['src/lib/**/*.test.ts', 'supabase/functions/**/*.test.ts', 'scripts/lib/**/*.test.mjs'],
    passWithNoTests: true,
  },
});
