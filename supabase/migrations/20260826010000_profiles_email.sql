-- =====================================================================
-- Persona Fit — e-mail do aluno visível pro professor
--
-- Problema: o professor cadastra o aluno, avisa "vai chegar um e-mail" e
-- depois não tem onde consultar QUAL e-mail foi. `public.profiles` não
-- tinha a coluna, e `auth.users` não é legível pelo client.
--
-- Solução: espelhar `auth.users.email` em `profiles.email`, mantido em
-- sincronia por trigger. A policy `profiles_select_own` já libera
-- `coach_id = auth.uid()`, então o professor passa a ler sem mudança de RLS.
--
-- Ver .specs/features/2026-08-26-aluno-email-visivel/spec.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Coluna
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists email text;

comment on column public.profiles.email is
  'Espelho de auth.users.email, mantido por trigger. Existe pra que o professor consiga ver o e-mail do aluno (auth.users não é legível pelo client). Nunca escrever direto: a fonte de verdade é auth.users.';

-- ---------------------------------------------------------------------
-- 2. Backfill dos profiles existentes
-- ---------------------------------------------------------------------
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is distinct from u.email;

-- ---------------------------------------------------------------------
-- 3. Novos signups já nascem com e-mail
--    (mantém o comportamento original de full_name/avatar_url)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Troca de e-mail propaga pro profile
--    O Supabase Auth confirma troca de e-mail atualizando auth.users.email,
--    então o profile ficaria desatualizado sem isto.
-- ---------------------------------------------------------------------
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set email = new.email
   where id = new.id
     and email is distinct from new.email;
  return new;
end;
$$;

comment on function public.sync_profile_email() is
  'Mantém profiles.email em sincronia com auth.users.email quando o usuário troca de e-mail.';

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();
