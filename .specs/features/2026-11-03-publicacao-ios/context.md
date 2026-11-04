# Contexto — Publicação iOS (App Store)

> Criado em 2026-11-03. Base: `MANUAL-APP-STORE.md` (§7, §13) + auditoria do código na `develop`
> (commit `83fb350`). Baseline: vitest 415/415, `tsc --noEmit` limpo.

## Objetivo

Deixar o código do Persona Fit pronto para o primeiro envio à App Store: build iOS que abre,
loga (e-mail, Google, Apple), compra assinatura pela Apple, recebe push e passa nas diretrizes
que mais recusam (4.8, 3.1.1, 3.1.2, 5.1.1(v), 5.1.2(i)). Os passos de console (conta Apple,
contratos, App Store Connect, capturas, TestFlight) ficam no manual. Aqui entra só o que é
código/config versionado, mais a lista de pré-requisitos manuais que o código depende.

## Decisões do dev (2026-11-03)

| Decisão | Escolha | Por quê |
|---|---|---|
| iPad | **Só iPhone** (`supportsTablet: false`) | Decidido em 2026-10-18 (manual §14.1). Adicionar iPad depois é permitido; remover, não |
| Orientação no iOS | **Retrato travado só no iOS** (infoPlist) | Android segue destravado por exigência da Play (telas grandes). No iPhone, paisagem sem teste = layout quebrado = recusa por bug |
| Revogação Apple na exclusão de conta | **Sim — re-login Apple na hora de excluir** | Diretriz 5.1.1(v): app com Sign in with Apple deve revogar o token via REST da Apple. O `authorizationCode` dura 5 min, então pegar um novo na exclusão evita guardar refresh token |
| Bundle ID | `br.com.personafit` (**confirmado 2026-11-03**) | Escolha do dev pela marca. Android segue `br.com.nutrion` (IDs independentes por plataforma). Bundle ID não limita países — disponibilidade é escolhida no App Store Connect e pode ser ampliada depois |

## Achados da auditoria que o manual não cobria

1. `revenuecat-webhook/index.ts` grava `source: 'store_play'` fixo — compra iOS viraria Play.
2. Paywall sem links de Termos/Privacidade e sem texto de renovação automática (3.1.2).
3. "Gerenciar assinatura" e textos apontam para a Google Play (`SubscriptionCard`, `encontrar-professor/[id]`).
4. `UpdateGate` abre a Play e diz "Play Store"; `app_config` só tem `android_store_url`.
5. `HealthDataConsent` não diz que dados vão para IA de terceiros (5.1.2(i) exige isso explícito).
   A política no hotsite já cita o Groq.
6. Google Sign-In sem `iosClientId`; mensagens de erro falam em "Play Services".
7. `npm run update:production` sem `--environment production` (incidente DOD Cast, manual §14.14).
8. Troca pro→premium: no iOS só é troca (sem cobrança dupla) se os dois planos de professor
   estiverem **no mesmo grupo de assinatura** no App Store Connect. Opções de proração do
   Google são ignoradas no iOS.

## Não é problema (registrado para as notas de revisão)

- Pagamento do professor "combinado direto com ele": serviço pessoa-a-pessoa fora do app
  (3.1.3(d)) — citar nas notas de revisão.
- Exclusão de conta já existe (`DangerZone` → `delete-my-account`).
- Cadastro de professor (`signup-professor`) é só e-mail — não exige Apple.
- Login usa `KeyboardAvoidingView behavior="padding"` + `automaticallyAdjustKeyboardInsets` — ok no iOS;
  demais formulários validados no roteiro TestFlight.

## Lacuna de processo

`.specs/codebase/` só tem `STRUCTURE.md` e não há `ROADMAP.md`. Não bloqueia esta feature
(projeto segue assim há 30+ features); fica como sugestão de brownfield-mapping futuro.
