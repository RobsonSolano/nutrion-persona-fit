# Tasks — Aluno contrata professor

Branch única (`feature/aluno-contrata-professor`), commits divididos por camada.

## Commit 1 — CREF (hotfix embutido)
- [x] T1.1 `src/lib/cref.ts` + testes — normalizar, validar formato, rejeitar degenerados. `[CREF]-01,02`
- [x] T1.2 Espelho em `supabase/functions/_shared/cref.ts`, usado no `signup-professor`. `[CREF]-03`
- [x] T1.3 UI: `signup-professor.tsx` e `(coach)/perfil.tsx` validam antes de enviar. `[CREF]-03,04`

## Commit 2 — Banco
- [x] T2.1 Migration `coach_public_profile`: colunas em `coaches` + constraints. `[DESC]-01`
- [x] T2.2 Migration `coach_enrollment_requests` + `coach_blocks` + `coach_ratings` + RLS. `[SOLI]-01,02` `[BLOQ]-01` `[AVAL]-01`
- [x] T2.3 `_resolve_entitlement` v3 — `max(tier próprio, tier do coach)`. `[TRAN]-06`
- [x] T2.4 RPCs: `search_coaches`, `coach_public_profile`, `rate_coach`, `request_coach`, `cancel_my_enrollment_request`. `[DESC]-05` `[AVAL]-02` `[SOLI]-03,10`

## Commit 3 — Edge function
- [x] T3.1 `coach-respond-enrollment` — andamento/efetuado/cancelado + limite + push. `[SOLI]-05,06,07` `[TRAN]-01`

## Commit 4 — Dados estáticos + serviços do client
- [x] T4.1 Lista IBGE (UF + municípios) embarcada. `[DESC]-07`
- [x] T4.2 Especialidades do professor (vocabulário próprio, não reusar `Modality`).
- [x] T4.3 `services/coachDiscovery.ts` + `services/enrollment.ts` + hooks.

## Commit 5 — Telas do aluno
- [x] T5.1 Busca com filtros. `[DESC]-04`
- [x] T5.2 Perfil público do professor + avaliar. `[DESC]-06` `[AVAL]-03,04`
- [x] T5.3 Confirmação com transparência + aceite legal. `[TRAN]-04,05,07`
- [x] T5.4 Minhas solicitações + aviso de resposta na abertura. `[SOLI]-08,09`
- [x] T5.5 Fix `readOnly = isStudent`. `[TRAN]-03`

## Commit 6 — Área do professor
- [x] T6.1 `_layout` vira abas Home/Alunos/Perfil. `[ABAS]-01`
- [x] T6.2 Home com métricas. `[ABAS]-02`
- [x] T6.3 Aba Alunos. `[ABAS]-03`
- [x] T6.4 Aba Perfil + perfil público + bloqueados. `[ABAS]-04` `[BLOQ]-03`
- [x] T6.5 Fila de contratações. `[SOLI]-03,05,06,07`


---

## Estado final (2026-08-29)

Todas as tasks feitas. Além do planejado:

- **T7 — Telefone de contato** (achado do dev no teste de emulador): o professor
  não tinha como falar com quem solicitou. `coach_enrollment_requests.contact_phone`
  obrigatório + WhatsApp/Ligar na fila. `[SOLI]-11`
- **T8 — Fix do crash da aba Perfil**: `<Stack.Screen>` remanescente numa tela
  que virou aba.
- **T9 — /simplify**: `foldText` compartilhado, N+1 da lista do aluno virou RPC,
  `supabase/.branches` fora do git.

### Verificado

| O quê | Como |
|---|---|
| 337 testes unitários | `npx vitest run` |
| 3 suítes SQL | psql contra Supabase local — ALL PASS |
| 6 de 12 e-2-e | Supabase local (os 6 restantes dependem de edge function) |
| Fluxo do aluno | Emulador: busca → perfil → transparência → telefone → envio |
| Fluxo do professor | Emulador: abas, Home com métricas, fila com WhatsApp |
| Perfil público | Emulador: toggle, UF/cidade (645 municípios de SP), especialidades |

### NÃO verificado (precisa de deploy)

- `coach-respond-enrollment` ponta a ponta (aceitar/recusar/andamento) — o runtime
  local não sobe functions que importam de `_shared/`.
- Push de `enrollment_accepted` / `enrollment_declined`.
- `EnrollmentOutcomeGate` com desfecho real (depende do aceite).
