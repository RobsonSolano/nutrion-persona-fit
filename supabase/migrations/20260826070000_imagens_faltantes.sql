-- =====================================================================
-- Persona Fit — imagens para exercícios que estavam sem
--
-- O enriquecimento (20260826060000) trouxe 251 exercícios já com imagem,
-- mas os 12 antigos sem imagem continuaram sem. Destes, 4 têm
-- correspondência no free-exercise-db e ganham imagem agora.
--
-- `Foam roll glúteo` casa com `Piriformis-SMR`: é a liberação da região
-- glútea, o mesmo movimento com nome anatômico mais específico.
--
-- Ficam sem imagem (sem correspondência no dataset): Bird dog, Hollow body
-- rock, Wall slides, Mobilidade torácica em quatro apoios, Aero jump,
-- Tabata, Natação e Ergômetro de braço (handbike).
-- =====================================================================

do $$
declare
  m record;
  matches text[][] := array[
    ['Pallof press (cabo)',            'Pallof_Press'],
    ['Roll out / rolinho de coluna',   'Ab_Roller'],
    ['Foam roll glúteo',               'Piriformis-SMR'],
    ['Foam roll adutor',               'Adductor']
  ];
  i int;
begin
  for i in 1 .. array_length(matches, 1) loop
    update public.exercises
       set image_urls = public.exercise_image_urls(matches[i][2])
     where name = matches[i][1]
       and owner_id is null
       and (image_urls is null or array_length(image_urls, 1) is null);
  end loop;
end $$;
