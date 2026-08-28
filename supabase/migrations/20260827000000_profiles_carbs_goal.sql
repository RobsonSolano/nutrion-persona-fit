-- =====================================================================
-- Persona Fit — meta de carboidrato no perfil
--
-- O app tinha meta de calorias, proteína e água, mas NÃO de carboidrato
-- (carbs só existia por refeição em food_logs). O professor pediu poder
-- definir a meta de carbo do aluno junto das outras.
--
-- Nullable e sem default de propósito: sem meta de gordura não dá pra
-- derivar um carbo padrão sensato. Aluno existente fica com carbo null até
-- um professor pro/premium definir. O display trata null como 0.
-- =====================================================================

alter table public.profiles
  add column if not exists carbs_goal_g integer;

comment on column public.profiles.carbs_goal_g is
  'Meta diária de carboidrato em gramas. Null = não definida. Editável só por professor pro/premium (gate em coach-update-student).';
