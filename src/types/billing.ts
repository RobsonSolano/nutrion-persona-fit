// Tipos de billing no cliente — fonte única que espelha o contrato do billing-core (#1):
// RPC resolve_entitlement + 402 { error:'needs_upgrade', feature }.
// Ver .specs/features/2026-06-22-billing-core/spec.md (contrato) e
//     .specs/features/2026-06-22-paywall-ui/ (consumo).

export type Tier = 'free' | 'pro' | 'premium';

export type EntitlementSource =
  | 'store_play'
  | 'store_apple'
  | 'stripe'
  | 'server_trial'
  | 'grandfather'
  | 'partner' // parceria concedida pelo painel admin
  | 'none';

export type Entitlement = {
  tier: Tier;
  source: EntitlementSource;
  ai_personal: boolean; // chat IA + sanity check
  ai_coach: boolean; // coach-generate-plan + coach-import-workout-ai (só professor)
  student_limit: number | null; // null = ilimitado (só professor)
  trial_end: string | null;
};

// Chaves de feature emitidas pelo servidor no 402 needs_upgrade.
export type FeatureKey =
  | 'chat'
  | 'sanity_check'
  | 'coach_generate_plan'
  | 'coach_import_workout'
  | 'student_limit';
