-- =====================================================================
-- NutriOn — Corrige imagens incoerentes dos cárdios "ao ar livre"
--
-- Reportado em teste (2026-08-26): "Caminhada (ao ar livre)" exibia foto de
-- alguém numa ESTEIRA de academia. O mapeamento apontava para
-- `Walking_Treadmill` — literalmente "caminhada na esteira".
--
-- Mesmo erro em "Corrida (ao ar livre)" → `Running_Treadmill`.
--
-- O Free Exercise DB tem `Trail_Running_Walking` ("Trail Running/Walking",
-- sem equipamento), que é caminhada/corrida ao ar livre de fato.
--
-- NÃO mexemos em: 'Bicicleta (ao ar livre)' → 'Bicycling' (esse já está certo,
-- é bicicleta na rua), nem nas versões de máquina ('Esteira (corrida)' →
-- Running_Treadmill), que estão corretas por definição.
--
-- Fica registrado como incoerência menor e sem alternativa no dataset:
-- 'Subida de escada (ao ar livre)' → 'Stairmaster' (máquina). Não há imagem de
-- escada real no Free Exercise DB; a silhueta do movimento é próxima.
-- =====================================================================

update public.exercises
set image_urls = public.exercise_image_urls('Trail_Running_Walking')
where name in ('Caminhada (ao ar livre)', 'Corrida (ao ar livre)');
