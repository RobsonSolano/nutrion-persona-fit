-- =====================================================================
-- "Aluno desde" — profiles.coach_linked_at (2026-10-13)
--
-- Quando o aluno passou a ser do professor atual. Carimbado por trigger
-- sempre que o coach_id muda, então vale pros três caminhos sem tocar
-- nas edge functions: professor cadastra (coach-create-student), aluno
-- contrata (coach-respond-enrollment) e desvínculo (coach-unlink-student).
-- Troca de professor recomeça a contagem; desvínculo limpa.
--
-- O trigger se chama profiles_set_coach_linked_at pra rodar DEPOIS de
-- profiles_guard_role_changes (BEFORE triggers disparam em ordem
-- alfabética): o guard desfaz troca de coach_id vinda do app, e aqui a
-- data acompanha o coach_id já guardado. Escrever a coluna direto, sem
-- trocar de professor, é ignorado.
-- =====================================================================

alter table public.profiles
  add column if not exists coach_linked_at timestamptz;

comment on column public.profiles.coach_linked_at is
  'Quando o aluno se vinculou ao professor atual ("aluno desde"). Mantido por trigger; null sem professor.';

create or replace function public.set_coach_linked_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.coach_linked_at := case when new.coach_id is null then null else now() end;
  elsif new.coach_id is distinct from old.coach_id then
    new.coach_linked_at := case when new.coach_id is null then null else now() end;
  else
    new.coach_linked_at := old.coach_linked_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_coach_linked_at on public.profiles;
create trigger profiles_set_coach_linked_at
  before insert or update on public.profiles
  for each row execute function public.set_coach_linked_at();

-- Backfill dos alunos que já existem: o aceite da contratação com o
-- professor atual, se houver; senão a criação da conta (aluno cadastrado
-- pelo próprio professor nasce vinculado). Roda com o trigger já criado,
-- mas como o coach_id não muda ele manteria o valor antigo (null) — por
-- isso o trigger fica desligado só durante o backfill.
alter table public.profiles disable trigger profiles_set_coach_linked_at;

update public.profiles p
   set coach_linked_at = coalesce(
         (select max(r.responded_at)
            from public.coach_enrollment_requests r
           where r.student_id = p.id
             and r.coach_id = p.coach_id
             and r.status = 'efetuado'),
         p.created_at)
 where p.coach_id is not null
   and p.coach_linked_at is null;

alter table public.profiles enable trigger profiles_set_coach_linked_at;
