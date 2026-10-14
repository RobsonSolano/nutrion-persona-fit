# Play In-App Updates + .aab 1.5.0 — Especificação

## Problema

Desde a 1.21.0 o app sabe quando o binário está velho (`app_config`, item #2), mas o único
caminho é mandar o usuário pra página da Play — ele sai do app, procura o botão, volta. O Android
tem um fluxo nativo (In-App Updates) que baixa e instala a versão nova sem sair do app.

## Objetivos

- [ ] Quem toca "Atualizar" no aviso de versão atualiza pelo fluxo nativo da Play, sem sair do app.
- [ ] Gerar o `.aab` 1.5.0 (versionCode 7) com o módulo nativo, pronto pra subir na Play.

## Fora do Escopo

| Item | Motivo |
|---|---|
| Atualização **flexível** (download em segundo plano) | A lib (`expo-in-app-updates` 0.12.0) chama `completeUpdate()` sozinha ao terminar o download → reinicia o app de repente, no meio do uso. Evitar exigiria patch nativo. |
| Prioridade de update definida na Play | Só via API da Play; o `.aab` sobe à mão pelo Console. Quem decide é o `app_config`. |
| R8 / minify | Decisão de 2026-08-26: build isolado, depois. |
| iOS | Sem build iOS. |
| Upload na Play | Manual, pelo dev (sem service account de submit). |

---

## Glossário

| Termo | Definição canônica |
|---|---|
| Atualização nativa | Fluxo In-App Updates da Play no modo imediato: tela cheia da Play com download, instalação e reinício. |
| Link da loja | Abrir a página do app na Play (comportamento da 1.21.0). |

---

## User Stories

### P1: Atualizar sem sair do app ⭐ MVP

1. **[INA]-01** — QUANDO o usuário toca "Atualizar"/"Atualizar agora" no aviso de versão
   (recomendada ou mínima) E a Play informa atualização disponível com o modo imediato permitido
   ENTÃO o app DEVE iniciar a atualização nativa.
2. **[INA]-02** — QUANDO a atualização nativa não está disponível (app instalado fora da Play,
   Play ainda sem a versão nova, módulo ausente, erro) ENTÃO o app DEVE abrir o link da loja, como
   hoje.
3. **[INA]-03** — QUANDO o usuário cancela o fluxo nativo ENTÃO, na versão **mínima**, o bloqueio
   DEVE continuar; na **recomendada**, o aviso continua com "Depois".
4. **[INA]-04** — A ausência do módulo nativo (dev client antigo, Expo Go) NÃO DEVE derrubar o app.
5. **[INA]-05** — A decisão "nativa ou link" DEVE ser lógica pura testada.

### P1: .aab 1.5.0

1. **[AAB]-01** — `version` 1.4.0 → **1.5.0** (runtime 1.5.0: binários 1.4.0 param de receber OTA
   novo — por isso o aviso de versão do item #2 tinha que sair antes).
2. **[AAB]-02** — Build `production` no EAS → `.aab` versionCode 7.
3. **[AAB]-03** — Roteiro pós-upload no STATE: subir na Play → `recommended_version = 1.5.0` →
   (opcional, dias depois) `min_version = 1.5.0`.

---

## Como verificar

- **Lógica:** unitário da decisão nativa × link ([INA]-01, -02, -05).
- **Sem módulo:** dev client 1.3.0 do emulador abre normal ([INA]-04).
- **Fluxo nativo real:** só com o app instalado **pela Play** e uma versão mais nova publicada. A
  1.5.0 é a primeira com o módulo: o fluxo só pode ser visto quando sair a seguinte, ou antes
  disso via **Internal App Sharing** da Play (dois `.aab` de versionCode crescente). Fica
  registrado como verificação pendente, não como feito.
