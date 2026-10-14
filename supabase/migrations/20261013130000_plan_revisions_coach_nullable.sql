-- =====================================================================
-- student_plan_revisions.coach_id passa a aceitar null (2026-10-13)
--
-- O desvínculo (coach-unlink-student desde 2026-07, e agora o
-- student-leave-coach) faz `coach_id = null` nas revisões do ex-aluno pra
-- tirá-las do alcance do ex-professor — a RLS de leitura é
-- `auth.uid() = coach_id or auth.uid() = student_id`. Mas a coluna nasceu
-- NOT NULL: o update falhava em todo desvínculo, só ia pro log (passo
-- best-effort), e o ex-professor continuava lendo o histórico de planos do
-- ex-aluno. Achado pelo e2e do ciclo de vida do vínculo.
-- =====================================================================

alter table public.student_plan_revisions
  alter column coach_id drop not null;

-- Reparo: revisões de quem já não é aluno daquele professor saem do
-- alcance dele. O aluno continua lendo pelas próprias (student_id).
update public.student_plan_revisions r
   set coach_id = null
 where r.coach_id is not null
   and not exists (
     select 1 from public.profiles p
      where p.id = r.student_id and p.coach_id = r.coach_id
   );
