import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import {
  AuthCancelled,
  deleteMyAccount,
  signInWithEmailPassword,
  signInWithGoogle,
  signOut,
  signUpWithPassword,
  type DeleteMyAccountError,
} from '@/services/auth';
import { useSessionStore } from '@/stores/useSessionStore';
import { queryClient } from '@/lib/queryClient';
import { initBilling, logoutBilling } from '@/services/billing';

// Sincroniza o billing (RevenueCat) com a sessão: identifica o SDK com profiles.id (= user.id,
// que o webhook #5a usa) ao logar, e desidentifica no logout. Best-effort e no-op sem billing.
function syncBilling(userId: string | undefined) {
  if (userId) void initBilling(userId);
  else void logoutBilling();
}

export function useAuthBootstrap() {
  const setSession = useSessionStore((s) => s.setSession);
  const setBootstrapping = useSessionStore((s) => s.setBootstrapping);
  /** Último usuário observado. `undefined` = ainda não observamos nenhum. */
  const usuarioAnterior = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;

    /**
     * Zera o cache do react-query quando QUEM está logado muda.
     *
     * Sem isso, sair de uma conta e entrar em outra na mesma instalação
     * servia dado cacheado do usuário anterior — exercício exclusivo de um
     * professor apareceu pra um aluno que não é dele, e o mesmo valeria pra
     * perfil, plano e lista de alunos. A RLS estava correta; o vazamento era
     * o cache.
     *
     * Só limpa quando o id muda de fato: `onAuthStateChange` também dispara
     * em TOKEN_REFRESHED com o mesmo usuário, e limpar ali causaria refetch
     * de tudo a cada renovação de token.
     */
    function sincronizar(userId: string | undefined) {
      const anterior = usuarioAnterior.current;
      const atual = userId ?? null;
      if (anterior !== undefined && anterior !== atual) {
        queryClient.clear();
      }
      usuarioAnterior.current = atual;
      syncBilling(userId);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setBootstrapping(false);
      sincronizar(data.session?.user?.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      sincronizar(session?.user?.id);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [setSession, setBootstrapping]);
}

export function useAuth() {
  const session = useSessionStore((s) => s.session);
  const user = useSessionStore((s) => s.user);
  const isBootstrapping = useSessionStore((s) => s.isBootstrapping);

  const loginWithGoogle = useCallback(async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      if (err instanceof AuthCancelled) return;
      throw err;
    }
  }, []);

  const loginWithEmail = useCallback(
    (email: string, password: string) =>
      signInWithEmailPassword({ email, password }),
    [],
  );

  const signUp = useCallback(
    (fullName: string, email: string, password: string) =>
      signUpWithPassword({ fullName, email, password }),
    [],
  );

  const logout = useCallback(async () => {
    await signOut();
  }, []);

  return {
    session,
    user,
    isAuthenticated: !!session,
    isBootstrapping,
    loginWithGoogle,
    loginWithEmail,
    signUp,
    logout,
  };
}

/**
 * Auto-exclusão de conta (LGPD / Play Store / App Store).
 *
 * Após sucesso:
 *   1. `qc.clear()` zera todos os caches (evita refetch zumbi).
 *   2. `signOut()` invalida a sessão local; o token já está inválido
 *      no servidor depois do delete em auth.users.
 *   3. UI deve redirecionar pra `/(auth)/login` no `onSuccess`.
 *
 * Erros conhecidos vêm em `err.info`:
 *   - `has_students` (professor com alunos vinculados → UI mostra
 *     modal de bloqueio)
 *   - `unauthorized` (sessão expirou)
 *   - `unknown` (falha genérica do servidor)
 */
export function useDeleteMyAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string | null) => deleteMyAccount(reason),
    onSuccess: async () => {
      // Ordem importa: clear ANTES de signOut pra não refetch com
      // sessão zumbi enquanto a session ainda existe no estado local.
      qc.clear();
      try {
        await signOut();
      } catch {
        // signOut pode falhar se o token já foi invalidado server-side
        // pelo delete em auth.users — não é crítico.
      }
    },
  });
}

export type { DeleteMyAccountError };
