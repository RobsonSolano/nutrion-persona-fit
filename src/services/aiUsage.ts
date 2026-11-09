import { supabase } from './supabase';

export type AiFeature = 'sanity_check' | 'onboarding_plan';

// 2 = onboarding inicial + 1 refazer no mesmo dia. Limite acumulado por dia.
export const DAILY_ONBOARDING_LIMIT = 2;

export async function countTodayAiUsage(
  userId: string,
  feature: AiFeature,
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from('ai_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('day', today)
    .eq('feature', feature);
  if (error) throw error;
  return count ?? 0;
}
