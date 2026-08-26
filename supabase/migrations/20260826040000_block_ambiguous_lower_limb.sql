-- =====================================================================
-- Persona Fit — bloqueia dois exercícios ambíguos de membro inferior
--
-- Apareceram no primeiro plano gerado de verdade pra um aluno com amputação
-- de membro inferior (aluno3, 2026-08-26). A classificação original
-- (20260826030000) deixou os dois passarem de propósito, e o dev decidiu
-- bloquear:
--
--   'Tabata'             — nome de PROTOCOLO, não de movimento. Pode ser
--                          executado com corda naval ou handbike, mas
--                          prescrito sem especificar o quê é vago demais
--                          pra quem não tem função de perna.
--   'Abdominal na bola'  — na prática ancora os pés no chão.
--
-- 'HIIT' é o mesmo caso do Tabata e segue LIBERADO por decisão do dev.
--
-- Ver .specs/features/2026-08-26-pcd-restricoes-corporais/spec.md
-- =====================================================================

update public.exercises
   set requires_lower_limbs = true
 where requires_lower_limbs = false
   and name in ('Tabata', 'Abdominal na bola');
