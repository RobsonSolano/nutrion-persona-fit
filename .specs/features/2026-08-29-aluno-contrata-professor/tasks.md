# Tasks — Aluno contrata professor

Branch única (`feature/aluno-contrata-professor`), commits divididos por camada.

## Commit 1 — CREF (hotfix embutido)
- [ ] T1.1 `src/lib/cref.ts` + testes — normalizar, validar formato, rejeitar degenerados. `[CREF]-01,02`
- [ ] T1.2 Espelho em `supabase/functions/_shared/cref.ts`, usado no `signup-professor`. `[CREF]-03`
- [ ] T1.3 UI: `signup-professor.tsx` e `(coach)/perfil.tsx` validam antes de enviar. `[CREF]-03,04`

## Commit 2 — Banco
- [ ] T2.1 Migration `coach_public_profile`: colunas em `coaches` + constraints. `[DESC]-01`
- [ ] T2.2 Migration `coach_enrollment_requests` + `coach_blocks` + `coach_ratings` + RLS. `[SOLI]-01,02` `[BLOQ]-01` `[AVAL]-01`
- [ ] T2.3 `_resolve_entitlement` v3 — `max(tier próprio, tier do coach)`. `[TRAN]-06`
- [ ] T2.4 RPCs: `search_coaches`, `coach_public_profile`, `rate_coach`, `request_coach`, `cancel_my_enrollment_request`. `[DESC]-05` `[AVAL]-02` `[SOLI]-03,10`

## Commit 3 — Edge function
- [ ] T3.1 `coach-respond-enrollment` — andamento/efetuado/cancelado + limite + push. `[SOLI]-05,06,07` `[TRAN]-01`

## Commit 4 — Dados estáticos + serviços do client
- [ ] T4.1 Lista IBGE (UF + municípios) embarcada. `[DESC]-07`
- [ ] T4.2 Especialidades do professor (vocabulário próprio, não reusar `Modality`).
- [ ] T4.3 `services/coachDiscovery.ts` + `services/enrollment.ts` + hooks.

## Commit 5 — Telas do aluno
- [ ] T5.1 Busca com filtros. `[DESC]-04`
- [ ] T5.2 Perfil público do professor + avaliar. `[DESC]-06` `[AVAL]-03,04`
- [ ] T5.3 Confirmação com transparência + aceite legal. `[TRAN]-04,05,07`
- [ ] T5.4 Minhas solicitações + aviso de resposta na abertura. `[SOLI]-08,09`
- [ ] T5.5 Fix `readOnly = isStudent`. `[TRAN]-03`

## Commit 6 — Área do professor
- [ ] T6.1 `_layout` vira abas Home/Alunos/Perfil. `[ABAS]-01`
- [ ] T6.2 Home com métricas. `[ABAS]-02`
- [ ] T6.3 Aba Alunos. `[ABAS]-03`
- [ ] T6.4 Aba Perfil + perfil público + bloqueados. `[ABAS]-04` `[BLOQ]-03`
- [ ] T6.5 Fila de contratações. `[SOLI]-03,05,06,07`
