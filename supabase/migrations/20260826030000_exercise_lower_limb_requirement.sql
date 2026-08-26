-- =====================================================================
-- Persona Fit — marca quais exercícios exigem função de membro inferior
--
-- Serve o bloqueio determinístico do gerador de plano: quando o usuário
-- declara paraplegia / cadeira de rodas / amputação de membro inferior,
-- `fetchCatalog` filtra por esta coluna ANTES de montar o prompt. O modelo
-- não recebe agachamento pra escolher, e `sanitizePlan` — que já descarta
-- qualquer exercício ausente do catálogo — fecha a segunda ponta de graça.
--
-- SOBRE A CLASSIFICAÇÃO: é uma primeira passada revisada por nome, não uma
-- classificação clínica. A linha traçada é "assume função de perna pra ser
-- EXECUTADO" (agachamento, esteira, burpee, prancha, alongamento em pé).
-- Mobilidade de solo e foam roll de perna ficam liberados — pra quem usa
-- cadeira de rodas são, no pior caso, inúteis, não perigosos.
-- Mora numa coluna justamente pra ser corrigível sem deploy de código.
--
-- Ver .specs/features/2026-08-26-pcd-restricoes-corporais/spec.md
-- =====================================================================

alter table public.exercises
  add column if not exists requires_lower_limbs boolean not null default false;

comment on column public.exercises.requires_lower_limbs is
  'Exige função de membro inferior pra ser executado. Filtra o catálogo enviado à IA quando o usuário declara paraplegia/amputação de membro inferior. Classificação curada por nome, corrigível — não é laudo clínico.';

-- ---------------------------------------------------------------------
-- 1. Grupo legs: inequívoco
-- ---------------------------------------------------------------------
update public.exercises e
   set requires_lower_limbs = true
 where requires_lower_limbs = false
   and exists (
     select 1 from public.exercise_groups g
      where g.id = e.group_id and g.slug = 'legs'
   );

-- ---------------------------------------------------------------------
-- 2. Modalidade corrida: toda ela é corrida (Fartlek, Longão, Tiros...)
-- ---------------------------------------------------------------------
update public.exercises
   set requires_lower_limbs = true
 where requires_lower_limbs = false
   and modality = 'corrida';

-- ---------------------------------------------------------------------
-- 3. Movimentos de perna que NÃO moram no grupo legs — vale pro catálogo
--    inteiro. `Levantamento terra (barra)` e `Deadlift (CrossFit)` estão em
--    'back'; `Push press` (que é acionamento de perna por definição) e
--    `Handstand push-up` estão em 'shoulders'. Sem esta passada eles
--    escapariam do filtro.
-- ---------------------------------------------------------------------
update public.exercises
   set requires_lower_limbs = true
 where requires_lower_limbs = false
   and name ilike any (array[
     '%levantamento terra%', '%deadlift%', '%push press%',
     '%remada curvada%', '%cavalinho%',
     '%handstand%', '%pike push-up%', '%barra australiana%'
   ]);

-- ---------------------------------------------------------------------
-- 4. Lista curada em cardio / full_body / core
--    Padrões acentuados como os nomes do seed (ilike não normaliza acento).
--    '%assault bike%' e não '%bike%': 'bike' pegaria o handbike adaptado.
-- ---------------------------------------------------------------------
update public.exercises e
   set requires_lower_limbs = true
 where requires_lower_limbs = false
   and exists (
     select 1 from public.exercise_groups g
      where g.id = e.group_id
        and g.slug in ('cardio', 'full_body', 'core')
   )
   and e.name ilike any (array[
     -- cardio de perna
     '%esteira%', '%corrida%', '%caminhada%', '%bicicleta%', '%assault bike%',
     '%elíptico%', '%crosstrainer%', '%versaclimber%', '%escada%', '%stair%',
     '%spinning%', '%trekking%', '%trote%', '%sprint%', '%ski erg%',
     '%remo ergômetro%', '%row %', '%pular corda%', '%double under%',
     '%single under%', '%step (aeróbico)%', '%aero jump%',
     -- full body com acionamento de perna
     '%burpee%', '%box jump%', '%bear crawl%', '%clean%', '%snatch%',
     '%thruster%', '%kettlebell swing%', '%farmer walk%', '%sled push%',
     '%wall ball%', '%turkish get-up%', '%subida na corda%',
     '%mountain climber%', '%world%',
     -- alongamento/mobilidade que exige ficar de pé
     '%em pé%', '%standing%', '%downward dog%',
     -- core que usa a perna como alavanca ou apoio
     '%prancha%', '%elevação de perna%', '%elevação de joelho%',
     '%leg raise%', '%elevação pélvica%', '%flutter kick%', '%hollow body%',
     '%toes to bar%', '%knees to elbow%', '%canivete%', '%v-up%',
     '%bird dog%', '%dead bug%', '%sit-up%', '%heel touch%', '%remador%',
     '%l-sit%', '%ab wheel%', '%abdominal infra%'
   ]);

-- ---------------------------------------------------------------------
-- 5. Sem isto não sobra UM cardio pra quem usa cadeira de rodas.
--    Máquina real de academia, válida pra qualquer pessoa (usada também
--    em reabilitação de membro inferior), então entra pro catálogo geral.
-- ---------------------------------------------------------------------
do $$
declare
  g_cardio uuid;
begin
  select id into g_cardio from public.exercise_groups where slug = 'cardio';
  if g_cardio is null then
    return;
  end if;

  insert into public.exercises (group_id, name, equipment, is_compound, modality, requires_lower_limbs)
  values
    (g_cardio, 'Ergômetro de braço (handbike)', 'máquina', false, 'musculacao', false)
  on conflict (group_id, name) do nothing;
end $$;
