# Tasks — Play In-App Updates + .aab 1.5.0

Branch: `feature/play-in-app-updates`.

- [x] **T1 — Decisão nativa × link (TDD).** `src/lib/storeUpdate.ts` + teste (4 casos). `[INA]-01,02,05`
- [x] **T2 — `expo-in-app-updates` 0.12.0** (versão fixa) + adaptador no `UpdateGate`, com
  `requireOptionalNativeModule` antes do import. `[INA]-01..04`
- [x] **T3 — `version` 1.5.0.** `[AAB]-01`
- [x] **T4 — Conferência no dev client sem o módulo:** sem crash, módulo devolvido como ausente. `[INA]-04`
- [x] **T5 — Build `production` no EAS** (versionCode 7) e envio por `eas submit` como rascunho na faixa de produção (2026-10-14). `[AAB]-02`
- [x] **T6 — Lançar o rascunho no Play Console** (dev) e `recommended_version = 1.5.0` (dev). `[AAB]-03` — 1.5.0 (8) em produção 100% e `recommended_version = 1.5.0` em 2026-10-14. Validado pelo dev num aparelho real na 1.4.0: aviso "Nova versão disponível" → Atualizar → Play Store → atualizou → abriu normal.

| O quê | Como |
|---|---|
| 408 testes unitários | `npx vitest run` |
| expo-doctor 18/18 | `npx expo-doctor` |
| [INA]-04 | Log temporário no dev client 1.3.0: antes da correção "Uncaught Error"; depois, null e app segue |
