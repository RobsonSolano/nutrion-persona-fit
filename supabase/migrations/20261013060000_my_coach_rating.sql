-- =====================================================================
-- Persona Fit — O professor lê a própria média de estrelas
--
-- A RLS de coach_ratings só deixa o ALUNO ler a linha dele
-- (coach_ratings_select_own). Isso é proposital: ninguém lê a nota
-- individual de outra pessoa, nem o professor avaliado — saber quem deu
-- 1 estrela envenena a relação e desincentiva avaliação honesta.
--
-- Mas o professor precisa ver o AGREGADO na Home dele. Esta RPC devolve
-- só média e total, sem quem deu o quê.
--
-- Ver spec.md [ABAS]-02, [AVAL]-04. Idempotente.
-- =====================================================================

create or replace function public.my_coach_rating()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
           'avg', round(coalesce(avg(stars), 0)::numeric, 1),
           'count', count(*)
         )
    from public.coach_ratings
   where coach_id = auth.uid();
$$;

comment on function public.my_coach_rating() is
  'Média e total de estrelas do professor autenticado. Agregado apenas — notas individuais seguem privadas de quem avaliou.';

grant execute on function public.my_coach_rating() to authenticated;
