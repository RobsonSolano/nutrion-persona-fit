-- =====================================================================
-- Persona Fit — Perfil público do professor (descoberta)
--
-- Até aqui o professor só existia pra quem ele mesmo cadastrou. Estas
-- colunas são o que permite ser ENCONTRADO por um usuário comum.
--
-- Cria:
--   coaches.is_public         — opt-in explícito (default false)
--   coaches.state_uf / city / city_ibge_code — região (lista IBGE no app)
--   coaches.specialties       — text[] (musculação, crossfit, powerlifting...)
--   coaches.service_mode      — online | presencial | hibrido
--   is_valid_credential(text) — mesma regra de src/lib/cref.ts, em SQL
--
-- A visibilidade REAL não é só is_public: a busca exige premium + CREF
-- válido também (ver a migration das RPCs). Ver .specs/features/
-- 2026-08-29-aluno-contrata-professor/spec.md [DESC]-01, [DESC]-03.
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas de perfil público
-- ---------------------------------------------------------------------
alter table public.coaches
  add column if not exists is_public boolean not null default false,
  add column if not exists state_uf text,
  add column if not exists city text,
  add column if not exists city_ibge_code text,
  add column if not exists specialties text[] not null default '{}',
  add column if not exists service_mode text;

comment on column public.coaches.is_public is
  'Opt-in do professor pra aparecer na busca. Não basta sozinho: a busca exige premium + CREF válido.';
comment on column public.coaches.city_ibge_code is
  'Código IBGE do município (lista embarcada no app). Fonte estável pra agrupar por cidade.';
comment on column public.coaches.specialties is
  'Especialidades do professor. Vocabulário PRÓPRIO — não confundir com exercises.modality (modalidade do exercício).';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'coaches_service_mode_check'
  ) then
    alter table public.coaches
      add constraint coaches_service_mode_check
      check (service_mode is null or service_mode in ('online','presencial','hibrido'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'coaches_state_uf_check'
  ) then
    alter table public.coaches
      add constraint coaches_state_uf_check
      check (state_uf is null or state_uf ~ '^[A-Z]{2}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'coaches_specialties_len_check'
  ) then
    -- Teto defensivo: campo é multi-seleção na UI, não texto livre.
    alter table public.coaches
      add constraint coaches_specialties_len_check
      check (array_length(specialties, 1) is null or array_length(specialties, 1) <= 12);
  end if;
end $$;

-- Índice da busca: só as linhas que podem aparecer.
create index if not exists coaches_public_search_idx
  on public.coaches (state_uf, city)
  where is_public;

-- ---------------------------------------------------------------------
-- 2. is_valid_credential — espelho SQL de src/lib/cref.ts
--
--    Necessário no banco (não só na escrita) porque professores
--    cadastrados ANTES desta feature têm CREF em texto livre e não podem
--    aparecer na busca até corrigir ([CREF]-05). A validação na edge
--    function não alcança essas linhas.
-- ---------------------------------------------------------------------
create or replace function public.is_valid_credential(p_raw text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_txt text;
  v_num text;
  v_regiao int;
  v_up boolean := true;
  v_down boolean := true;
  v_delta int;
  i int;
begin
  if p_raw is null then
    return false;
  end if;

  v_txt := upper(regexp_replace(p_raw, '\s', '', 'g'));

  -- CRN: CRN-<1..11>/<4-6 dígitos>[/P|/S]
  if v_txt like 'CRN%' then
    if v_txt !~ '^CRN-?([0-9]{1,2})/([0-9]{4,6})(/[PS])?$' then
      return false;
    end if;
    v_regiao := (regexp_match(v_txt, '^CRN-?([0-9]{1,2})/'))[1]::int;
    if v_regiao < 1 or v_regiao > 11 then
      return false;
    end if;
    v_num := (regexp_match(v_txt, '/([0-9]{4,6})'))[1];
  else
    -- CREF: NNNNNN-C/UF
    v_txt := regexp_replace(v_txt, '^CREF', '');
    if v_txt !~ '^[0-9]{6}-[GP]/[A-Z]{2}$' then
      return false;
    end if;
    if substring(v_txt from 10 for 2) not in (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
      'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
    ) then
      return false;
    end if;
    v_num := substring(v_txt from 1 for 6);
  end if;

  -- Dígitos todos iguais.
  if v_num ~ '^(.)\1*$' then
    return false;
  end if;

  -- Sequência estrita crescente ou decrescente.
  for i in 2..length(v_num) loop
    v_delta := ascii(substring(v_num from i for 1)) - ascii(substring(v_num from i - 1 for 1));
    if v_delta <> 1 then v_up := false; end if;
    if v_delta <> -1 then v_down := false; end if;
  end loop;
  if v_up or v_down then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.is_valid_credential(text) is
  'Validação estrutural de CREF/CRN. Espelho de src/lib/cref.ts — mudou lá, muda aqui. NÃO prova que o registro existe (não há API pública).';
