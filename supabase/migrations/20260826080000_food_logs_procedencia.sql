-- =====================================================================
-- Persona Fit — procedência dos macros em food_logs (item #1, onda 1)
--
-- `food_logs` guardava só o valor FINAL: nada dizia se os macros vieram da IA
-- ou foram digitados. Consequência prática: quando o sanity check itemizado
-- (2026-08-26) derrubou a estimativa de 417 para 367 kcal na mesma foto, não
-- havia como provar quanto disso foi o código.
--
-- O sinal mais valioso estava sendo jogado no lixo: o formulário preenche o
-- campo com a estimativa da IA e o campo segue EDITÁVEL. Quando o usuário
-- corrige 500 para 350 antes de salvar, essa diferença é o erro da IA medido
-- de graça, em produção real.
--
-- É a baseline que decide se vale pagar por um modelo melhor (item #6 do
-- backlog). Sem ela, trocar de provedor é fé, não medição.
--
-- Ver .specs/features/2026-08-26-sanity-instrumentacao/spec.md
-- =====================================================================

alter table public.food_logs
  add column if not exists ai_kcal_original integer,
  add column if not exists macros_source text,
  add column if not exists scale_weight_g integer;

comment on column public.food_logs.ai_kcal_original is
  'kcal como a IA estimou, antes de qualquer edição. A diferença contra `calories` é o erro da IA medido em produção. Null = refeição sem análise.';
comment on column public.food_logs.macros_source is
  'manual = digitado; ai = estimativa aceita como veio; ai_edited = analisou e corrigiu. Derivado no app, não escolhido pelo usuário.';
comment on column public.food_logs.scale_weight_g is
  'Peso informado na balança, quando houve. Alimenta o teto de densidade calórica e permite avaliar precisão por grama.';

-- ---------------------------------------------------------------------
-- Constraints permissivas de propósito (INS-06): instrumentação NUNCA
-- pode impedir alguém de registrar uma refeição. Tudo nullable, e os
-- checks só barram valor absurdo — não exigem preenchimento.
-- ---------------------------------------------------------------------
alter table public.food_logs
  drop constraint if exists food_logs_macros_source_valid;
alter table public.food_logs
  add constraint food_logs_macros_source_valid
  check (macros_source is null or macros_source in ('manual', 'ai', 'ai_edited'));

alter table public.food_logs
  drop constraint if exists food_logs_ai_kcal_original_nonneg;
alter table public.food_logs
  add constraint food_logs_ai_kcal_original_nonneg
  check (ai_kcal_original is null or ai_kcal_original >= 0);

alter table public.food_logs
  drop constraint if exists food_logs_scale_weight_nonneg;
alter table public.food_logs
  add constraint food_logs_scale_weight_nonneg
  check (scale_weight_g is null or scale_weight_g >= 0);

-- Índice parcial: as consultas de análise só olham refeição que passou pela
-- IA, que é a minoria das linhas.
create index if not exists food_logs_macros_source_idx
  on public.food_logs (macros_source, created_at desc)
  where macros_source is not null;
