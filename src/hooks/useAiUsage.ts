import { useQuery } from '@tanstack/react-query';
import {
  countTodayAiUsage,
  DAILY_ONBOARDING_LIMIT,
  type AiFeature,
} from '@/services/aiUsage';
import { queryKeys, todayKey } from '@/lib/queryKeys';
import { dailyAiQuota, quotaState, type AiQuota } from '@/lib/aiQuota';
import { useAuth } from './useAuth';
import { useEntitlement } from './useEntitlement';

function useDailyUsage(feature: AiFeature) {
  const { user } = useAuth();
  const userId = user?.id;
  const day = todayKey();
  return useQuery({
    queryKey: userId
      ? queryKeys.aiUsage(userId, feature, day)
      : ['ai-usage', 'none'],
    queryFn: () => countTodayAiUsage(userId!, feature),
    enabled: !!userId,
    staleTime: 5_000,
  });
}

/** Cota diária do usuário para a feature + estado (limite, restante, bloqueio). */
export function useAiQuotaState(feature: keyof AiQuota, used: number) {
  const { data: ent } = useEntitlement();
  return quotaState(used, dailyAiQuota(ent?.own_tier)[feature], !!ent);
}

export function useDailySanityUsage() {
  const q = useDailyUsage('sanity_check');
  const used = q.data ?? 0;
  return { ...q, used, ...useAiQuotaState('sanity', used) };
}

export function useDailyOnboardingUsage() {
  const q = useDailyUsage('onboarding_plan');
  const used = q.data ?? 0;
  return { ...q, used, ...quotaState(used, DAILY_ONBOARDING_LIMIT, true) };
}
