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

### Retomada (2026-10-13)

- **T10 — Merge da develop:** conflito nos 4 arquivos do painel em abas (saiu
  separado na 1.18); versão da feature mantida por ser superset.
- **T11 — Migrations renomeadas** `20260829*` → `20261013*` (produção já tinha
  migrations posteriores aplicadas).
- **T12 — `coach-respond-enrollment/deno.json`** que faltava. Era ele, e não o
  `_shared/`, que impedia a function de subir local.
- **T13 — e2e:** `signInAs`/`callFn`/`promoteToCoach`/`TEST_CREF` centralizados
  em `scripts/e2e/lib/clients.mjs`; 9 testes antigos quebrados voltaram.

| O quê | Como |
|---|---|
| 371 testes unitários | `npx vitest run` |
| 4 suítes SQL | psql contra Supabase local — ALL PASS |
| **34 de 34 e-2-e** (12 da contratação) | Supabase local + `functions serve` |

### Achados do teste no emulador (2026-10-13, tarde)

- **T14** — Máscara de telefone (`maskPhoneBR`) + `whatsappUrl` com 55.
- **T15** — "Aluno desde" (`coach_linked_at` + trigger). `[TRAN]-12`
- **T16** — Aviso velho de aceite e aviso de desvínculo. `[TRAN]-08` `[TRAN]-09`
- **T17** — Limite de 5 solicitações abertas. `[SOLI]-12`
- **T18** — Aluno encerra o acompanhamento, professor avisado com o motivo. `[TRAN]-10` `[TRAN]-11`
- **T19** — Revisões de plano com `coach_id` nullable + desvínculo atômico (bug de privacidade antigo).
- **T20** — `ConfirmModal` sobe com o teclado.
- **T21** — Avaliação com comentário + tela Avaliações do professor. `[AVAL]-02,05,06,07,08`

| O quê | Como |
|---|---|
| 394 testes unitários | `npx vitest run` |
| 8 suítes SQL | psql contra Supabase local — ALL PASS |
| **45 de 45 e-2-e** | Supabase local + `functions serve` |
| Telas | Emulador contra produção: solicitar, aceitar, sair com motivo, aviso do professor, desvincular, "Vínculo encerrado", avaliar com comentário, Avaliações do professor |

### NÃO verificado

- Push de `enrollment_accepted` / `enrollment_declined` / `student_left_coach` (exige device real).
