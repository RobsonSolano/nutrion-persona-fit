# Tasks — Avisos remotos + atualização pela loja

Branch: `feature/avisos-remotos` (a partir de `develop`).

- [x] **T1 — Comparação de versão (TDD).** `src/lib/appVersion.ts` + teste.
  Done when: `compareVersions` e `updateRequirement` cobrem [ATU]-01, -02, -04, -07 e o caso
  mínima > recomendada. Verify: `npx vitest run src/lib/appVersion.test.ts`.
- [x] **T2 — Banco (TDD SQL).** Teste `supabase/tests/announcements.test.sql` primeiro; depois a
  migration (`app_config`, `announcements`, `announcement_views`, 2 RPCs, RLS).
  Done when: [AVI]-01..04, -06 e leitura anônima do `app_config` passam. Verify: psql local.
- [x] **T3 — Services + hooks.** `src/services/appConfig.ts`, `src/services/announcements.ts`,
  `useUpdateRequirement`, `usePendingAnnouncements`, `useMarkAnnouncementSeen`.
- [x] **T4 — `UpdateGate`** na raiz + esconder o modal de OTA quando bloqueado.
- [x] **T5 — `AnnouncementGate`** nas duas áreas + ordem com os gates de vínculo ([MOD]).
- [x] **T6 — e2e** (`scripts/e2e/suites/announcements.mjs`): público, uma vez por usuário,
  período, isolamento entre usuários.
- [x] **T7 — Conferência em tela:** aviso por público, recomendada com "Depois", mínima bloqueando
  (no login também), botão do aviso.

## Estado final (2026-10-13)

Todas as tasks feitas. /simplify aplicou: `blocked` no `useAppUpdate`, hooks
`useHasPending{Student,Coach}LinkNotice`, aviso visto sai do cache sem refetch,
`src/lib/playStore.ts` (URLs da Play num lugar só), `PendingWorkoutModal` respeita o bloqueio,
e versão instalada que não parece versão (ex: hash de fingerprint) nunca bloqueia.

| O quê | Como |
|---|---|
| 404 testes unitários (10 de versão) | `npx vitest run` |
| 9 suítes SQL (`ANNOUNCEMENTS` nova) | psql contra Supabase local |
| 49 de 49 e-2-e (4 de avisos) | Supabase local + `functions serve` |
| Telas | Emulador contra produção: aviso por público com botão pra rota, aviso sem botão, recomendada com "Atualizar"/"Depois", mínima bloqueando o login (voltar não fecha), Play abre (web no emulador sem Play) |

Migration `20261013160000_avisos_remotos` já aplicada em produção (config vazia — nada aparece).
