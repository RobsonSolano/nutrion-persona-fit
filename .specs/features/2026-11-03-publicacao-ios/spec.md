# Spec — Publicação iOS (App Store)

> Feature `publicacao-ios` · 2026-11-03 · Escopo **Large** · Decisões em `context.md`.
> Referência operacional: `MANUAL-APP-STORE.md`.
> **Revisada em 2026-11-09:** primeira versão iOS **sem login com Google e sem Sign in with Apple** (decisão do dev, ver `context.md`); planos Elite e Pessoal Premium (release 1.28.0) entram nos grupos de assinatura; correções de build do Podfile viram requisito ([IOS]-14).

## User stories

- Como **usuário de iPhone**, quero instalar o Persona Fit pela App Store, entrar com e-mail e senha e usar o app como no Android.
- Como **assinante no iPhone**, quero comprar, restaurar e gerenciar a assinatura pela Apple.
- Como **dono do app**, quero que o envio passe na revisão da Apple sem recusas evitáveis e que
  o backend reconheça compras da App Store.

## Requisitos

### [IOS]-01 Configuração nativa iOS (`app.config.ts`)
- QUANDO o app for buildado para iOS, ENTÃO deve ter `ios.bundleIdentifier` = `br.com.personafit` (Android segue `br.com.nutrion`),
  `supportsTablet: false`, `config.usesNonExemptEncryption: false`.
- ENTÃO o `infoPlist` deve ter `UIViewControllerBasedStatusBarAppearance: false`,
  `CFBundleDevelopmentRegion: 'pt-BR'`, `CFBundleLocalizations: ['pt-BR']` e
  `UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait']` (só iOS; Android intacto).
- ENTÃO `expo-notifications` deve estar declarado em `plugins` com `mode: 'production'`.
- ENTÃO o plugin `@react-native-google-signin/google-signin` não pode quebrar o prebuild iOS sem `iosUrlScheme`
  (o login com Google não existe no iOS nesta versão — ver [IOS]-03). O módulo nativo pode seguir linkado; só não é chamado.
- ENTÃO o Android (`package`, `adaptiveIcon`, `orientation`) não muda.

### [IOS]-02 Ícone iOS sem canal alfa
- QUANDO a build iOS for gerada, ENTÃO `ios.icon` aponta para `assets/icon-ios.png`
  1024×1024 com `hasAlpha: no` (fundo `#000000`).

### [IOS]-03 Login com Google só no Android (diretriz 4.8)
- QUANDO o app roda no iOS, ENTÃO a tela de login **não mostra** "Continuar com Google" (nem o divisor "ou"),
  e nenhum caminho chama `GoogleSignin` — sem login social, a 4.8 não exige Sign in with Apple.
- QUANDO roda no Android, ENTÃO o login com Google segue exatamente como hoje.
- QUANDO o usuário está no iOS, ENTÃO a tela de login mostra uma dica curta para quem criou a conta com
  Google no Android: usar "Esqueci a senha" para criar uma senha (verificar no Supabase local que o
  `resetPasswordForEmail` + troca de senha funciona para conta só-Google; se não funcionar, registrar
  no STATE e não exibir a dica).
- Sign in with Apple fica para uma versão futura (ver "Fora do escopo").

### [IOS]-04 ~~Google Sign-In no iOS~~ — adiado
- Sai desta versão junto com o login com Google no iOS. Volta com o Sign in with Apple.

### [IOS]-05 RevenueCat por plataforma
- QUANDO roda no iOS, ENTÃO o SDK é configurado com `EXPO_PUBLIC_RC_API_KEY_IOS`; no Android,
  com `EXPO_PUBLIC_RC_API_KEY_ANDROID`. Sem a chave da plataforma → `isBillingAvailable = false`.
- QUANDO roda no iOS e há troca de plano (pro → premium → elite; comum pro → premium), ENTÃO a compra é
  feita sem opções de proração do Google (a Apple faz a troca dentro do grupo de assinatura).
- ENTÃO o `findPackage` acha os produtos iOS pelos mesmos IDs da Play (`nutrion_prof_pro`, `nutrion_prof_premium`,
  `nutrion_prof_elite`, `nutrion_comum_pro`, `nutrion_comum_premium`), que no iOS vêm sem o sufixo `:mensal`.

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

### [IOS]-11 ~~Revogação do token Apple na exclusão de conta~~ — adiado
- Só é exigida (5.1.1(v)) quando o app tem Sign in with Apple. Volta junto com ele.

### [IOS]-12 Build, envio e OTA
- ENTÃO `npm run update:production` (e `update:preview`) passam `--environment production`
  (`preview` para o preview).
- ENTÃO `eas.json` ganha `submit.production.ios` com `ascAppId` **somente quando o app existir
  no App Store Connect** (fica como tarefa manual registrada; sem placeholder inválido).

### [IOS]-14 Build iOS passa no Xcode atual (Podfile)
- ENTÃO um config plugin versionado (ex.: `plugins/withIosPodfileFixes`) garante no Podfile gerado:
  `pod 'GoogleUtilities', :modular_headers => true` e `pod 'RecaptchaInterop', :modular_headers => true`
  (exigidos pelo `AppCheckCore` do Google Sign-In) e, no `post_install`, `IPHONEOS_DEPLOYMENT_TARGET`
  mínimo **15.1** em todas as pods (o Xcode 27 recusa pods com alvo < 15).
- Verificação: `npx expo prebuild -p ios --clean` + `pod install` + `xcodebuild` Release para o simulador
  terminam sem erro (achado de 2026-11-09, ao gerar os prints).
- ENTÃO o Android não muda (`npx expo prebuild -p android` sem diferença no Gradle).

### [IOS]-13 Documentação
- ENTÃO `MANUAL-APP-STORE.md` §0.2 reflete o que foi implementado, `PROJECT.md` tira iOS do
  "Fora do escopo" e `STATE.md` registra decisões e pendências manuais.

## Fora do escopo (desta feature)

- Passos de console: conta Apple, contratos, App Store Connect, produtos, capturas, TestFlight,
  revisão (manual §2–§6, §8–§11).
- Campo `ios_store_url` no painel admin (repo `nutrion-painel`) — registrar em backlog.
- **Login com Google no iOS e Sign in with Apple** — próxima versão iOS (melhoria registrada no backlog).
  Inclui os antigos [IOS]-03 (botão Apple), [IOS]-04 (`iosClientId`) e [IOS]-11 (revogação do token).
- Suporte a iPad, localização em outros idiomas, ícone *Liquid Glass*.
- Atualizar política de privacidade do hotsite para citar Apple (login/pagamentos) — backlog.

## Pré-requisitos manuais (o código depende deles para funcionar em produção)

| # | Onde | O quê |
|---|---|---|
| ~~M1–M4~~ | — | Adiados com o login social no iOS (Client ID iOS do Google, provider Apple no Supabase, chave Sign in with Apple) |
| M5 | RevenueCat | App iOS + In-App Purchase Key + produtos ligados às entitlements `pro`/`premium`/`elite` (comum premium em `premium`, como no Android) + pacotes na offering `default` → `EXPO_PUBLIC_RC_API_KEY_IOS` (EAS, production) |
| M6 | App Store Connect | Grupo **Professor**: `nutrion_prof_pro` (R$ 15,90), `nutrion_prof_premium` (R$ 29,90), `nutrion_prof_elite` (R$ 49,90). Grupo **Pessoal**: `nutrion_comum_pro` (R$ 15,90), `nutrion_comum_premium` (R$ 29,90). Mensais |
| M7 | EAS | Chave APNs (manual §7.6) e `ascAppId` no `eas.json` após criar o app |
| M8 | Supabase | `app_config.ios_store_url` preenchido após o app estar na loja |

## Critério de pronto

- Todos os `[IOS]-XX` com teste (lógica pura) ou verificação manual registrada.
- `npm test` e `npm run typecheck` verdes; `npx expo config --type public` mostra a seção `ios`
  correta; `sips -g hasAlpha assets/icon-ios.png` = `no`.
- Validação real (TestFlight, manual §9.4) fica para depois dos pré-requisitos M1–M7.
