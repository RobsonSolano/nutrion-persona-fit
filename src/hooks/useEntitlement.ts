import { useQuery } from '@tanstack/react-query';
import { fetchEntitlement } from '@/services/entitlement';
import { useAuth } from './useAuth';
import { queryKeys } from '@/lib/queryKeys';
import { showTemporaryFreeNotice } from '@/lib/aiFreeNotice';

/**
 * Entitlement do usuário logado (billing-core). Keyed por userId + enabled: !!userId
 * (mesmo padrão de useProfile) → logout desabilita e não vaza entre sessões.
 * staleTime alto: entitlement muda raramente dentro de uma sessão.
 */
export function useEntitlement() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: userId ? queryKeys.entitlement(userId) : ['entitlement', 'none'],
    queryFn: fetchEntitlement,
    enabled: !!userId,
    staleTime: 60_000,
  });
}

// Derivações de gating proativo (C6: enquanto o entitlement não resolveu, NÃO bloquear —
// o 402 do servidor é a autoridade). Por isso `data ? !data.x : false`, não `!data?.x`.

/** true quando o entitlement resolveu sem ai_personal (chat IA + sanity check). */
export function useAiPersonalLocked(): boolean {
  const { data } = useEntitlement();
  return data ? !data.ai_personal : false;
}

/** true quando o entitlement resolveu sem ai_coach (IA de professor). */
export function useAiCoachLocked(): boolean {
  const { data } = useEntitlement();
  return data ? !data.ai_coach : false;
}

/** true quando o aviso "IA temporariamente gratuita" deve aparecer (entitlement não resolvido → false). */
export function useAiFreeNotice(): boolean {
  const { data } = useEntitlement();
  return showTemporaryFreeNotice(data?.tier);
}
