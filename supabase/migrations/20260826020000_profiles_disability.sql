-- =====================================================================
-- Persona Fit — condição de PCD no perfil
--
-- Problema: um usuário declarou paraplegia em texto livre ("Conta um pouco
-- sobre você") e a IA gerou treino de pernas. Texto livre num prompt é
-- best-effort; restrição corporal precisa ser dado estruturado pra virar
-- bloqueio determinístico no gerador de plano.
--
-- LGPD: dado sensível de saúde (art. 11, I), já coberto pelo consentimento
-- 'consentimento_saude' (20260721000000) — mesmo guarda-chuva da anamnese,
-- alergias e limitações físicas. Nenhum consentimento novo necessário.
--
-- Ver .specs/features/2026-08-26-pcd-restricoes-corporais/spec.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas
--    has_disability: null = não respondeu (grandfather dos existentes),
--    false = respondeu que não, true = respondeu que sim.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists has_disability boolean,
  add column if not exists disability_types text[] not null default '{}',
  add column if not exists disability_notes text;

comment on column public.profiles.has_disability is
  'Pessoa com deficiência? null = não respondeu, false = não, true = sim. Dado sensível de saúde (LGPD art. 11, I).';
comment on column public.profiles.disability_types is
  'Tipos declarados. Alimenta o bloqueio determinístico de exercícios em _shared/bodyRestrictions.ts.';
comment on column public.profiles.disability_notes is
  'Descrição livre (obrigatória quando o tipo é "other"). Vai pro prompt como restrição de prioridade máxima.';

-- ---------------------------------------------------------------------
-- 2. Constraints (idempotentes — drop + add)
-- ---------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_disability_types_valid;
alter table public.profiles
  add constraint profiles_disability_types_valid
  check (
    disability_types <@ array[
      'wheelchair_paraplegia',
      'amputation_lower',
      'amputation_upper',
      'visual',
      'hearing',
      'other'
    ]::text[]
  );

alter table public.profiles
  drop constraint if exists profiles_disability_notes_len;
alter table public.profiles
  add constraint profiles_disability_notes_len
  check (disability_notes is null or char_length(disability_notes) <= 500);
