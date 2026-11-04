# Spec — Publicação iOS (App Store)

> Feature `publicacao-ios` · 2026-11-03 · Escopo **Large** · Decisões em `context.md`.
> Referência operacional: `MANUAL-APP-STORE.md`.

## User stories

- Como **usuário de iPhone**, quero instalar o Persona Fit pela App Store, entrar com e-mail,
  Google ou Apple e usar o app como no Android.
- Como **assinante no iPhone**, quero comprar, restaurar e gerenciar a assinatura pela Apple.
- Como **dono do app**, quero que o envio passe na revisão da Apple sem recusas evitáveis e que
  o backend reconheça compras da App Store.

## Requisitos

### [IOS]-01 Configuração nativa iOS (`app.config.ts`)
- QUANDO o app for buildado para iOS, ENTÃO deve ter `ios.bundleIdentifier` = `br.com.personafit` (Android segue `br.com.nutrion`),
  `supportsTablet: false`, `config.usesNonExemptEncryption: false`, `usesAppleSignIn: true`.
- ENTÃO o `infoPlist` deve ter `UIViewControllerBasedStatusBarAppearance: false`,
  `CFBundleDevelopmentRegion: 'pt-BR'`, `CFBundleLocalizations: ['pt-BR']` e
  `UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait']` (só iOS; Android intacto).
- ENTÃO `expo-notifications` deve estar declarado em `plugins` com `mode: 'production'`.
- ENTÃO o plugin `@react-native-google-signin/google-signin` deve receber `iosUrlScheme`
  vindo de variável de ambiente de build (sem valor no código).
- ENTÃO o Android (`package`, `adaptiveIcon`, `orientation`) não muda.

### [IOS]-02 Ícone iOS sem canal alfa
- QUANDO a build iOS for gerada, ENTÃO `ios.icon` aponta para `assets/icon-ios.png`
  1024×1024 com `hasAlpha: no` (fundo `#000000`).

### [IOS]-03 Sign in with Apple
- QUANDO o app roda no iOS (fora do Expo Go), ENTÃO a tela de login mostra o botão oficial
  `AppleAuthenticationButton` com tamanho e destaque iguais aos do "Continuar com Google".
- QUANDO roda no Android, ENTÃO o botão Apple não aparece.
- QUANDO o usuário está na aba **Cadastre-se** sem os dois aceites, ENTÃO o login Apple é
  bloqueado com o mesmo aviso do Google; com aceites, grava `recordLegalAcceptance` após entrar.
- QUANDO o usuário conclui o login Apple, ENTÃO o app chama
  `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })`, usando nonce aleatório
  (hash SHA-256 enviado à Apple, nonce cru ao Supabase).
- QUANDO a Apple devolve `fullName` (só no 1º login), ENTÃO o nome é salvo nos metadados do
  usuário (`full_name`/`name`) para o perfil não ficar sem nome.
- QUANDO o usuário cancela a folha da Apple, ENTÃO nada é exibido como erro (`AuthCancelled`).
- QUANDO o e-mail vier como `@privaterelay.appleid.com`, ENTÃO o fluxo segue normal.

### [IOS]-04 Google Sign-In no iOS
- QUANDO roda no iOS, ENTÃO `GoogleSignin.configure` recebe `iosClientId`
  (`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`) além do `webClientId`.
- QUANDO falha no iOS, ENTÃO nenhuma mensagem menciona "Play Services".

### [IOS]-05 RevenueCat por plataforma
- QUANDO roda no iOS, ENTÃO o SDK é configurado com `EXPO_PUBLIC_RC_API_KEY_IOS`; no Android,
  com `EXPO_PUBLIC_RC_API_KEY_ANDROID`. Sem a chave da plataforma → `isBillingAvailable = false`.
- QUANDO roda no iOS e há troca de plano, ENTÃO a compra é feita sem opções de proração do Google
  (a Apple faz a troca dentro do grupo de assinatura).

### [IOS]-06 Webhook reconhece a loja
- QUANDO chega evento do RevenueCat com `store: 'APP_STORE'` (ou `MAC_APP_STORE`), ENTÃO
  `subscriptions.source = 'store_apple'`.
- QUANDO `store: 'PLAY_STORE'`, ENTÃO `source = 'store_play'`.
- QUANDO `store` ausente/desconhecido, ENTÃO `source = 'store_play'` (comportamento atual preservado).

### [IOS]-07 Paywall conforme 3.1.2
- QUANDO o paywall lista planos, ENTÃO mostra, além de preço e "/ mês", um texto de renovação
  automática adequado à plataforma (iOS: cobrança na conta Apple, renova salvo cancelamento até
  24 h antes do fim do período, gerenciar em Ajustes; Android: equivalente Google Play).
- ENTÃO o paywall exibe links tocáveis para **Termos de Uso** e **Política de Privacidade**
  (URLs de `useLegalDocs`).
- ENTÃO "Restaurar compras" continua visível.

### [IOS]-08 Gerenciar assinatura por plataforma
- QUANDO o usuário toca "Gerenciar assinatura" no iOS, ENTÃO abre o gerenciamento de assinaturas
  da Apple (`https://apps.apple.com/account/subscriptions`); no Android, a Play como hoje.
- ENTÃO os textos "cancele na Play Store"/"feitos na Google Play" viram o nome da loja da
  plataforma (`SubscriptionCard`, `encontrar-professor/[id]`).

### [IOS]-09 Aviso de atualização por plataforma
- QUANDO há atualização do binário no iOS, ENTÃO o `UpdateGate` abre `app_config.ios_store_url`
  (ou, sem ele, a App Store), nunca a Play; o fluxo nativo da Play segue só no Android.
- ENTÃO os textos padrão dizem "App Store" no iOS e "Play Store" no Android.
- ENTÃO existe migration idempotente adicionando `app_config.ios_store_url text`.

### [IOS]-10 Consentimento explícito para IA de terceiros (5.1.2(i))
- QUANDO o usuário vê o consentimento de dados de saúde, ENTÃO o texto diz explicitamente que
  fotos, registros e conversas são enviados a um **provedor de IA de terceiros** para gerar as
  análises, com link para a Política de Privacidade.

### [IOS]-11 Revogação do token Apple na exclusão de conta (5.1.1(v))
- QUANDO um usuário cuja conta tem identidade `apple` confirma a exclusão no iOS, ENTÃO o app pede
  re-login Apple (`signInAsync`) e envia o `authorizationCode` junto ao `delete-my-account`.
- QUANDO o `delete-my-account` recebe `apple_authorization_code`, ENTÃO gera o client secret
  (JWT ES256 com `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, client_id = bundle id),
  troca o código por token em `https://appleid.apple.com/auth/token` e revoga em
  `https://appleid.apple.com/auth/revoke`, antes de apagar o usuário.
- QUANDO a revogação falha (rede/segredo ausente), ENTÃO a exclusão segue (best-effort) e o erro
  vai para log — a exclusão nunca fica refém da Apple.
- QUANDO o usuário cancela o re-login Apple, ENTÃO a exclusão é abortada com aviso
  ("Confirme com a Apple para excluir").
- QUANDO a conta não tem identidade Apple, ENTÃO o fluxo é idêntico ao atual.

### [IOS]-12 Build, envio e OTA
- ENTÃO `npm run update:production` (e `update:preview`) passam `--environment production`
  (`preview` para o preview).
- ENTÃO `eas.json` ganha `submit.production.ios` com `ascAppId` **somente quando o app existir
  no App Store Connect** (fica como tarefa manual registrada; sem placeholder inválido).

### [IOS]-13 Documentação
- ENTÃO `MANUAL-APP-STORE.md` §0.2 reflete o que foi implementado, `PROJECT.md` tira iOS do
  "Fora do escopo" e `STATE.md` registra decisões e pendências manuais.

## Fora do escopo (desta feature)

- Passos de console: conta Apple, contratos, App Store Connect, produtos, capturas, TestFlight,
  revisão (manual §2–§6, §8–§11).
- Campo `ios_store_url` no painel admin (repo `nutrion-painel`) — registrar em backlog.
- Suporte a iPad, localização em outros idiomas, ícone *Liquid Glass*.
- Atualizar política de privacidade do hotsite para citar Apple (login/pagamentos) — backlog.

## Pré-requisitos manuais (o código depende deles para funcionar em produção)

| # | Onde | O quê |
|---|---|---|
| M1 | Google Cloud | Criar OAuth Client ID **iOS** (bundle `br.com.personafit`) → `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` + `GOOGLE_IOS_URL_SCHEME` (EAS, production) |
| M2 | Supabase → Auth → Google | Adicionar o Client ID iOS em *Authorized Client IDs*; se o login iOS falhar por nonce, ligar *Skip nonce check* |
| M3 | Supabase → Auth → Apple | Habilitar provider Apple, Client ID `br.com.personafit` |
| M4 | Apple Developer → Keys | Chave **Sign in with Apple** (.p8) → secrets `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` no Supabase |
| M5 | RevenueCat | App iOS + In-App Purchase Key + produtos ligados às entitlements `pro`/`premium` → `EXPO_PUBLIC_RC_API_KEY_IOS` (EAS, production) |
| M6 | App Store Connect | Planos de professor (pro, premium) **no mesmo grupo de assinatura**; comum_pro em grupo próprio |
| M7 | EAS | Chave APNs (manual §7.6) e `ascAppId` no `eas.json` após criar o app |
| M8 | Supabase | `app_config.ios_store_url` preenchido após o app estar na loja |

## Critério de pronto

- Todos os `[IOS]-XX` com teste (lógica pura) ou verificação manual registrada.
- `npm test` e `npm run typecheck` verdes; `npx expo config --type public` mostra a seção `ios`
  correta; `sips -g hasAlpha assets/icon-ios.png` = `no`.
- Validação real (TestFlight, manual §9.4) fica para depois dos pré-requisitos M1–M7.
