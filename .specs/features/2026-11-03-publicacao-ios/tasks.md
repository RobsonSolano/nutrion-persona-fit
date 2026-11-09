# Tasks — Publicação iOS (App Store)

> **Spec de origem:** `.specs/features/2026-11-03-publicacao-ios/spec.md` (revisada em 2026-11-09) · decisões em `context.md`
> **Escopo:** [IOS]-01, -02, -03 (esconder o Google no iOS, **sem** Sign in with Apple), -05, -06, -07, -08, -09, -10, -12, -13, -14.
> **Fora:** [IOS]-04 e [IOS]-11 (adiados com o login social no iOS), passos de console (M5–M8), deploy, `eas build`/`submit`/`update`.
> **Data:** 2026-11-09 · **Branch:** `feature/publicacao-ios`

| Onda | Tarefas |
|---|---|
| 1 | T01 (config iOS + ícone + Podfile), T02 (loja por plataforma + RevenueCat), T03 (webhook reconhece a loja) |
| 2 | T04 (login iOS sem Google + consentimento IA), T05 (paywall 3.1.2), T06 (gerenciar assinatura), T07 (aviso de atualização + `ios_store_url`) |
| 3 | T08 (scripts de OTA + documentação + verificação final) |

## Regras que valem para todas as tarefas

- Testes: `npx vitest run` (só `src/lib/**/*.test.ts` e `supabase/functions/**/*.test.ts`, ambiente node: **lógica pura, sem importar `react-native`/`expo-*`**) e `npm run typecheck`. Lint tem baseline vermelha (4 erros, 41 warnings): **não** é gate.
- Banco: só o **Supabase local** (Docker `supabase_db_nutrion`, API em `http://127.0.0.1:55321`, DB em `55322`, Mailpit em `55324`; o `supabase status` mostra 5432x por engano, as portas reais são 5532x). SQL: `docker exec -i supabase_db_nutrion psql -U postgres -d postgres -v ON_ERROR_STOP=1 < arquivo`. Chaves locais: `npx supabase status` (Publishable = anon, Secret = service role). **NUNCA** `supabase ... --linked` nem `supabase db push`: o CLI está linkado à PRODUÇÃO.
- O `.env.local` aponta para a **produção**. Para teste visual com dados, subir o app contra o local: `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321 EXPO_PUBLIC_SUPABASE_ANON_KEY=<Publishable local> npx expo start --web` e criar a conta pela própria aba "Cadastre-se".
- Simulador iOS (depois da T01): `npx expo run:ios -d "iPhone 17 Pro"` na raiz gera `ios/` (ignorado pelo git). Conferir `git status` depois: se `package.json` mudar, reverter.
- Nada de deploy, `eas build`, `eas submit` ou `eas update`. Mudança em `supabase/functions` só fica registrada para deploy depois (T08 registra).
- PT-BR com acentos em código, textos e comentários.

---

### T01 — Configuração nativa iOS, ícone sem alfa e plugin do Podfile
**Onda:** 1 · **Visual:** não · **Depende de:** — · **Status:** finalizado
**O quê:** `app.config.ts` ganha a seção `ios` e o plugin de notificações; nasce `assets/icon-ios.png` sem canal alfa; um config plugin versionado corrige o Podfile gerado para o Xcode 27. O prebuild iOS passa, o `pod install` passa e o build Release para o simulador termina sem erro. O Android não muda.
**Arquivos:** `app.config.ts`, `assets/icon-ios.png`, `plugins/withIosPodfileFixes.js`
**Da spec:**
- [IOS]-01: "QUANDO o app for buildado para iOS, ENTÃO deve ter `ios.bundleIdentifier` = `br.com.personafit` (Android segue `br.com.nutrion`), `supportsTablet: false`, `config.usesNonExemptEncryption: false`. ENTÃO o `infoPlist` deve ter `UIViewControllerBasedStatusBarAppearance: false`, `CFBundleDevelopmentRegion: 'pt-BR'`, `CFBundleLocalizations: ['pt-BR']` e `UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait']` (só iOS; Android intacto). ENTÃO `expo-notifications` deve estar declarado em `plugins` com `mode: 'production'`. ENTÃO o plugin `@react-native-google-signin/google-signin` não pode quebrar o prebuild iOS sem `iosUrlScheme` (o login com Google não existe no iOS nesta versão). O módulo nativo pode seguir linkado; só não é chamado. ENTÃO o Android (`package`, `adaptiveIcon`, `orientation`) não muda."
- [IOS]-02: "`ios.icon` aponta para `assets/icon-ios.png` 1024×1024 com `hasAlpha: no` (fundo `#000000`)."
- [IOS]-14: "um config plugin versionado (ex.: `plugins/withIosPodfileFixes`) garante no Podfile gerado: `pod 'GoogleUtilities', :modular_headers => true` e `pod 'RecaptchaInterop', :modular_headers => true` (exigidos pelo `AppCheckCore` do Google Sign-In) e, no `post_install`, `IPHONEOS_DEPLOYMENT_TARGET` mínimo **15.1** em todas as pods (o Xcode 27 recusa pods com alvo < 15). Verificação: `npx expo prebuild -p ios --clean` + `pod install` + `xcodebuild` Release para o simulador terminam sem erro. ENTÃO o Android não muda (`npx expo prebuild -p android` sem diferença no Gradle)."
- Critério de pronto: "`npx expo config --type public` mostra a seção `ios` correta; `sips -g hasAlpha assets/icon-ios.png` = `no`."
- Decisões (`context.md`): só iPhone (decisão sem volta, manual §14.1); retrato travado só no iOS (Android segue `orientation: 'default'` por exigência da Play).
**Ler antes:**
- `app.config.ts` (array `plugins`, o `push` condicional do google-signin fora do Expo Go, bloco `android` que não pode mudar, `orientation: 'default'`).
- `plugins/withUnlockedScannerOrientation.js` (padrão de plugin local em CommonJS com `require('expo/config-plugins')` e cuidado de idempotência no prebuild sem `--clean`).
- `MANUAL-APP-STORE.md` §7.1 (bloco `ios` de referência; **ignorar** `usesAppleSignIn`, que saiu da versão), §7.2 (como achatar o ícone com `sips`), §7.6 item 1 (`['expo-notifications', { mode: 'production' }]`).
- `node_modules/@react-native-google-signin/google-signin/plugin/build/withGoogleSignIn.js` (sem opções o plugin cai no ramo "Firebase", que no iOS só age se `ios.googleServicesFile` existir: por isso **não** passar opções nem `iosUrlScheme`).
- Se existir, `/private/tmp/claude-501/-Users-robsonsolano-www-pessoais-pessoal-personafit-app/434a2d15-8e87-4b73-8b6d-8f550bd38fdf/scratchpad/wt-ios/ios/Podfile` (worktree dos prints, com as correções feitas à mão: linhas `pod ...modular_headers` logo depois de `use_expo_modules!` e o laço no começo do `post_install`, antes do `react_native_post_install`).
**Pronto quando:**
- `npx expo config --type public` mostra `ios.bundleIdentifier: br.com.personafit`, `supportsTablet: false`, `icon: ./assets/icon-ios.png`, `config.usesNonExemptEncryption: false`, o `infoPlist` com as 4 chaves e o plugin `expo-notifications` com `mode: 'production'`; a seção `android` sai idêntica à de antes.
- `sips -g hasAlpha -g pixelWidth -g pixelHeight assets/icon-ios.png` → `hasAlpha: no`, 1024×1024.
- Numa cópia (worktree): `npx expo prebuild -p ios --clean` sem erro, `ios/Podfile` com as 2 linhas `modular_headers` e o laço de alvo 15.1; `cd ios && pod install` sem erro; `xcodebuild -workspace ios/PersonaFit.xcworkspace -scheme PersonaFit -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build` termina com `BUILD SUCCEEDED`.
- `ios/PersonaFit/Info.plist` gerado tem `UISupportedInterfaceOrientations` só com `UIInterfaceOrientationPortrait`.
- Rodar o prebuild duas vezes sem `--clean` não duplica as linhas no Podfile.
- Android: `npx expo prebuild -p android --clean` antes e depois da mudança (na cópia) sem diferença em `android/app/build.gradle`, `android/build.gradle`, `android/settings.gradle`, `android/gradle.properties` e `AndroidManifest.xml`.
**Verificar:**
```sh
npx expo config --type public | sed -n '/"ios"/,/}/p'
sips -g hasAlpha -g pixelWidth -g pixelHeight assets/icon-ios.png
# cópia: git worktree add <scratchpad>/wt-t01 HEAD && copiar os 3 arquivos da tarefa && ln -s <raiz>/node_modules <wt>/node_modules
npx expo prebuild -p ios --clean && (cd ios && pod install) && xcodebuild ... build
npm run typecheck
```
**Notas:**
- `ios.infoPlist.UISupportedInterfaceOrientations` vence o `orientation` global: o `withOrientation` do Expo pula a chave quando ela já vem no `infoPlist` (só avisa no log). Conferir no `Info.plist` gerado.
- Plugin com `withDangerousMod(config, ['ios', async (cfg) => { ... }])` editando `ios/Podfile` por texto, com marcador (ex.: comentário `# withIosPodfileFixes`) para não duplicar. Trecho alvo:
  ```ruby
  use_expo_modules!
  pod 'GoogleUtilities', :modular_headers => true
  pod 'RecaptchaInterop', :modular_headers => true
  ...
  post_install do |installer|
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1' if c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 15.1
      end
    end
    react_native_post_install(...)
  ```
  Registrar o plugin em `plugins` (`'./plugins/withIosPodfileFixes'`). Se o texto-âncora não existir, lançar erro claro (melhor quebrar o prebuild que gerar Podfile errado).
- **Não** usar `expo-build-properties` `ios.extraPods` para isto: tudo no plugin, um lugar só.
- Ícone: achatar `assets/icon.png` sobre preto (`sips -s format jpeg ... && sips -s format png ...`, manual §7.2) e conferir a imagem resultante; se sair com borda estranha, registrar para o dev.
- `npx expo prebuild` reescreve scripts do `package.json`: rodar **só na cópia** e descartar o que mudar lá. A pasta `ios/` é ignorada pelo git, mas a cópia evita sujar a raiz.
- Não mudar `version`, `runtimeVersion`, `eas.json` nem a seção `android`.

---

### T02 — Regras de loja por plataforma e RevenueCat no iOS
**Onda:** 1 · **Visual:** não · **Depende de:** — · **Status:** finalizado
**O quê:** nasce `src/lib/store.ts`, módulo puro com tudo que muda entre App Store e Play Store (nome da loja, URL de gerenciar assinatura, chave do RevenueCat, troca de plano). `billing.ts` passa a usar a chave da plataforma e, no iOS, compra a troca de plano sem opções de proração do Google. `findPackage` ganha teste para os IDs iOS (sem `:mensal`).
**Arquivos:** `src/lib/store.ts`, `src/lib/store.test.ts`, `src/services/billing.ts`, `src/lib/purchaseSelection.test.ts`, `.env.example`
**Da spec:**
- [IOS]-05: "QUANDO roda no iOS, ENTÃO o SDK é configurado com `EXPO_PUBLIC_RC_API_KEY_IOS`; no Android, com `EXPO_PUBLIC_RC_API_KEY_ANDROID`. Sem a chave da plataforma → `isBillingAvailable = false`. QUANDO roda no iOS e há troca de plano (pro → premium → elite; comum pro → premium), ENTÃO a compra é feita sem opções de proração do Google (a Apple faz a troca dentro do grupo de assinatura). ENTÃO o `findPackage` acha os produtos iOS pelos mesmos IDs da Play (`nutrion_prof_pro`, `nutrion_prof_premium`, `nutrion_prof_elite`, `nutrion_comum_pro`, `nutrion_comum_premium`), que no iOS vêm sem o sufixo `:mensal`."
- [IOS]-08 (consumido pela T06): Apple = `https://apps.apple.com/account/subscriptions`; Android = Play como hoje; textos com o nome da loja da plataforma.
**Ler antes:**
- `src/services/billing.ts` (constante `API_KEY`, `isBillingAvailable`, `purchasePackage` com `oldProductIdentifier` + `PRORATION_MODE`, lazy `require` do SDK).
- `src/lib/playStore.ts` (constantes da Play; `store.ts` importa daqui, não duplica).
- `src/lib/purchaseSelection.ts` (`findPackage`: igualdade **ou** prefixo `productId:`; já casa o ID iOS, falta o teste) e `src/lib/purchaseSelection.test.ts` (fixture `offerings` com `pkg('...:mensal')` e o `describe('findPackage')` a imitar).
- `src/lib/storeUpdate.test.ts` (estilo de teste puro com referência ao requisito no `describe`).
**Pronto quando:**
- `src/lib/store.ts` exporta, sem importar `react-native` (recebe `os: string`, o `Platform.OS` de quem chama; tudo que não é `'ios'` é Google):
  - `storeKind(os): 'apple' | 'google'`
  - `storeName(os): 'App Store' | 'Play Store'`
  - `APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions'` e `subscriptionsUrl(os)` (iOS → Apple; senão `PLAY_SUBSCRIPTIONS_URL`)
  - `rcApiKeyFor(os, { ios, android }): string | undefined` (`'ios'` → ios, `'android'` → android, qualquer outro, ex.: `'web'` → `undefined`; string vazia vira `undefined`)
  - `usesGoogleProductChange(os, oldProductId): boolean` (true só em `'android'` com `oldProductId` preenchido)
- **Estes nomes são contrato:** T05, T06 e T07 (onda 2) importam de `@/lib/store`. Não renomear.
- `billing.ts`: `API_KEY = rcApiKeyFor(Platform.OS, { ios: process.env.EXPO_PUBLIC_RC_API_KEY_IOS, android: process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID })`; `isBillingAvailable = !IS_EXPO_GO && !!API_KEY`; `purchasePackage` só passa `oldProductIdentifier`/`prorationMode` quando `usesGoogleProductChange(...)`; no iOS faz `Purchases.purchasePackage(pkg)` simples. Comentários atualizados (hoje dizem "Google").
- `store.test.ts` cobre cada função nos dois sistemas (e `'web'` para a chave); `purchaseSelection.test.ts` ganha caso "acha o ID iOS sem sufixo" para os 5 produtos.
- `.env.example` lista `EXPO_PUBLIC_RC_API_KEY_ANDROID=` e `EXPO_PUBLIC_RC_API_KEY_IOS=` (placeholders, sem chave real).
- `npx vitest run` e `npm run typecheck` verdes.
**Verificar:** `npx vitest run src/lib/store.test.ts src/lib/purchaseSelection.test.ts && npx vitest run && npm run typecheck`
**Notas:**
- **Armadilha do Expo:** variáveis `EXPO_PUBLIC_*` só são embutidas no bundle com acesso estático literal (`process.env.EXPO_PUBLIC_RC_API_KEY_IOS`). Nunca `process.env[nome]` nem passar o nome como string para o helper.
- A assinatura do método de compra muda por plataforma, mas o paywall (`app/paywall.tsx`) continua chamando `purchasePackage(pkg, { oldProductId })` igual: não mexer no paywall (é da T05).
- No iOS a troca só não cobra em dobro se os planos estiverem no mesmo grupo de assinatura no App Store Connect (pré-requisito M6, manual). Assinatura feita na Play e troca pedida no iPhone (lojas diferentes) é limitação conhecida: anotar no relatório, não resolver.
- Não alterar `src/lib/playStore.ts` (UpdateGate e outros usam).

---

### T03 — Webhook do RevenueCat grava a loja certa
**Onda:** 1 · **Visual:** não · **Depende de:** — · **Status:** finalizado
**O quê:** o mapeamento do evento passa a devolver também a origem (`store_apple` ou `store_play`) a partir de `event.store`, e o `index.ts` grava essa origem em `subscriptions.source` em vez do `'store_play'` fixo.
**Arquivos:** `supabase/functions/revenuecat-webhook/mapEvent.ts`, `supabase/functions/revenuecat-webhook/mapEvent.test.ts`, `supabase/functions/revenuecat-webhook/index.ts`
**Da spec:**
- [IOS]-06: "QUANDO chega evento do RevenueCat com `store: 'APP_STORE'` (ou `MAC_APP_STORE`), ENTÃO `subscriptions.source = 'store_apple'`. QUANDO `store: 'PLAY_STORE'`, ENTÃO `source = 'store_play'`. QUANDO `store` ausente/desconhecido, ENTÃO `source = 'store_play'` (comportamento atual preservado)."
- Achado 1 do `context.md`: "`revenuecat-webhook/index.ts` grava `source: 'store_play'` fixo — compra iOS viraria Play."
**Ler antes:**
- `supabase/functions/revenuecat-webhook/mapEvent.ts` (TS puro, sem imports Deno; retorno `{ userId, state }` ou `null`).
- `supabase/functions/revenuecat-webhook/mapEvent.test.ts` (helper `ev(type, extra)` para montar o payload; imitar).
- `supabase/functions/revenuecat-webhook/index.ts` linha ~39 (`source: 'store_play'` no upsert).
- `supabase/migrations/20261014180000_plano_pago_por_fora.sql` linha ~18 (check constraint de `subscriptions.source` já aceita `store_apple`: **não precisa de migration**).
**Pronto quando:**
- `mapEvent.ts` exporta `storeToSource(store: unknown): 'store_apple' | 'store_play'` e `mapRevenueCatEvent` devolve `{ userId, state, source }` em todos os tipos tratados (inclusive `EXPIRATION`).
- Testes: `APP_STORE` → `store_apple`; `MAC_APP_STORE` → `store_apple`; `PLAY_STORE` → `store_play`; sem `store`, `null`, número ou valor desconhecido (ex.: `STRIPE`, `PROMOTIONAL`) → `store_play`; `INITIAL_PURCHASE` com `store: 'APP_STORE'` traz `source: 'store_apple'`. Os testes antigos continuam passando.
- `index.ts` usa `source: mapped.source`.
- `npx vitest run` e `npm run typecheck` verdes.
**Verificar:** `npx vitest run supabase/functions/revenuecat-webhook && npx vitest run && npm run typecheck`
**Notas:**
- Seguir a spec à risca: `STRIPE` e qualquer outro valor caem em `store_play` (não inventar mapeamento para `stripe`).
- **Não fazer deploy.** A function precisa de `supabase functions deploy revenuecat-webhook --no-verify-jwt` depois, fora desta feature: a T08 registra no STATE.
- `index.ts` é Deno (imports `std/...`): não entra no vitest; manter a lógica no `mapEvent.ts`.

---

### T04 — Login no iOS sem Google, dica de senha e consentimento de IA de terceiros
**Onda:** 2 · **Visual:** sim · **Depende de:** T01 · **Status:** finalizado (conferido no Simulador iPhone 17 Pro Max em 2026-11-09)
**O quê:** no iOS a tela de login não mostra "Continuar com Google" nem o divisor "ou", e nenhum caminho chama `GoogleSignin`; aparece uma dica para quem criou a conta com Google no Android. No Android nada muda. O consentimento de dados de saúde (cadastro, cadastro de professor e tela de reconsentimento) passa a dizer que os dados vão para um provedor de IA de terceiros.
**Arquivos:** `app/(auth)/login.tsx`, `src/services/auth.ts`, `src/lib/socialLogin.ts`, `src/lib/socialLogin.test.ts`, `src/components/HealthDataConsent.tsx`, `.specs/project/STATE.md`
**Da spec:**
- [IOS]-03: "QUANDO o app roda no iOS, ENTÃO a tela de login **não mostra** "Continuar com Google" (nem o divisor "ou"), e nenhum caminho chama `GoogleSignin` — sem login social, a 4.8 não exige Sign in with Apple. QUANDO roda no Android, ENTÃO o login com Google segue exatamente como hoje. QUANDO o usuário está no iOS, ENTÃO a tela de login mostra uma dica curta para quem criou a conta com Google no Android: usar "Esqueci a senha" para criar uma senha (verificar no Supabase local que o `resetPasswordForEmail` + troca de senha funciona para conta só-Google; se não funcionar, registrar no STATE e não exibir a dica). Sign in with Apple fica para uma versão futura."
- [IOS]-10: "QUANDO o usuário vê o consentimento de dados de saúde, ENTÃO o texto diz explicitamente que fotos, registros e conversas são enviados a um **provedor de IA de terceiros** para gerar as análises, com link para a Política de Privacidade."
- Manual §7.7: 5.1.2(i) exige dizer "where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission".
**Ler antes:**
- `app/(auth)/login.tsx`: bloco `{!IS_EXPO_GO && (...)}` (linha ~181, botão Google + divisor "ou"), `handleGoogle` (~105), link "Esqueci a senha" (~302, só no modo `login`), dica do Expo Go `{IS_EXPO_GO && (...)}` (~308, estilo `rounded-2xl bg-violet/10 border border-violet/30` a reaproveitar na dica nova).
- `src/services/auth.ts`: `loadGoogleSignin`, `configureGoogleSignin`, `signInWithGoogle` (mensagens "Play Services"), `signOut` (só chama `GoogleSignin.signOut` se `configured`), `requestPasswordReset` e `confirmPasswordReset` (fluxo OTP de 6 dígitos usado pela dica).
- `src/lib/platform.ts` (`IS_EXPO_GO`; importa `expo-constants`, então **não** importar no módulo puro).
- `src/components/HealthDataConsent.tsx` (texto atual e o link `byType('privacidade')`); usado em `app/(auth)/login.tsx`, `app/(auth)/signup-professor.tsx` e `app/consent.tsx` (não precisam mudar).
- `src/lib/passwordReset.test.ts` (estilo de teste puro curto).
**Pronto quando:**
- `src/lib/socialLogin.ts` (puro) exporta `loginOptions(os: string, isExpoGo: boolean)` → `{ showGoogle, showExpoGoGoogleTip, showIosPasswordHint }`: `showGoogle = os !== 'ios' && !isExpoGo` (Android e demais, como hoje); `showExpoGoGoogleTip = os !== 'ios' && isExpoGo`; `showIosPasswordHint = os === 'ios' && IOS_PASSWORD_HINT_ENABLED` (constante exportada, `true` se a verificação abaixo passar, `false` se falhar). Testes nos 4 cenários (ios/android × Expo Go sim/não).
- `login.tsx` usa `loginOptions(Platform.OS, IS_EXPO_GO)`; no iOS o bloco do Google e o divisor "ou" não renderizam e a dica aparece no modo "Entrar", perto de "Esqueci a senha". Texto sugerido: **"Criou a conta com o Google no Android? Toque em “Esqueci a senha” e use o mesmo e-mail para criar uma senha."**
- `signInWithGoogle` lança logo no início, antes de carregar o módulo, quando `Platform.OS === 'ios'` (ex.: `'Login com Google indisponível no iPhone. Entre com e-mail e senha.'`). Defesa extra: nenhum caminho chega ao `GoogleSignin` no iOS.
- Verificação no Supabase local feita (passos nas notas) e o resultado escrito no `STATE.md` (seção nova "Publicação iOS (2026-11-09)", 2–4 linhas: deu certo ou não, como foi testado).
- `HealthDataConsent` diz explicitamente que fotos, registros e conversas vão para um provedor de IA de terceiros para gerar as análises, mantendo o link "Política de Privacidade". Texto sugerido: **"Autorizo o tratamento dos meus dados de saúde (medidas, registros de alimentação e treino, fotos e conversas com a IA) para gerar metas, planos e recomendações personalizadas. Para gerar as análises, minhas fotos, registros e conversas são enviados a um provedor de IA de terceiros, conforme a Política de Privacidade."**
- `npx vitest run` e `npm run typecheck` verdes.
**Verificar:**
- `npx vitest run src/lib/socialLogin.test.ts && npx vitest run && npm run typecheck`
- Tester, web (variante Android, sem banco): `npx expo start --web` → tela de login mostra "Continuar com Google" e o divisor "ou" como antes, **sem** a dica de senha; aba "Cadastre-se" mostra o consentimento com "provedor de IA de terceiros" e o link "Política de Privacidade" sublinhado/colorido.
- Tester, simulador iOS (`npx expo run:ios -d "iPhone 17 Pro"`, exige a T01): login **sem** botão Google e **sem** "ou"; dica visível no modo "Entrar"; "Esqueci a senha" abre o modal; aba "Cadastre-se" com o texto novo do consentimento. Print das duas abas no iOS e no web.
**Notas:**
- Verificação do reset para conta só-Google (Supabase local, nunca produção), num script descartável no scratchpad:
  1. Criar o usuário só-Google via psql no local: linha em `auth.users` (email confirmado, `encrypted_password` vazio, `raw_app_meta_data` `{"provider":"google","providers":["google"]}`) e em `auth.identities` com `provider = 'google'` (`provider_id`/`identity_data.sub` fictícios, `identity_data.email`).
  2. `POST http://127.0.0.1:55321/auth/v1/admin/generate_link` com a chave Secret, `{"type":"recovery","email":...}` → pega `email_otp` (ou: `POST /auth/v1/recover` e ler o código no Mailpit em `http://127.0.0.1:55324`).
  3. `verifyOtp({ email, token, type: 'recovery' })` → `updateUser({ password })` → `signOut` → `signInWithPassword` com a senha nova deve funcionar e devolver **o mesmo `user.id`**.
  4. Apagar o usuário de teste.
  Se falhar: `IOS_PASSWORD_HINT_ENABLED = false`, registrar no STATE o motivo e seguir (a dica não aparece).
- Não remover o código do Google: Android segue igual. O plugin nativo continua linkado no iOS (T01), só não é chamado.
- Não alterar `legal_documents` nem versão do consentimento (só o texto do componente). Se achar que precisa de nova versão, anotar no relatório.
- No iOS em Expo Go a dica do Expo Go (que fala de Google) também some (`showExpoGoGoogleTip`).

---

### T05 — Paywall conforme a diretriz 3.1.2
**Onda:** 2 · **Visual:** sim · **Depende de:** T01, T02 · **Status:** finalizado (conferido no Simulador iPhone 17 Pro Max em 2026-11-09)
**O quê:** o paywall mostra, junto dos planos, o texto de renovação automática da loja da plataforma e links tocáveis para Termos de Uso e Política de Privacidade; "Restaurar compras" segue visível.
**Arquivos:** `app/paywall.tsx`, `src/lib/paywallContent.ts`, `src/lib/paywallContent.test.ts`
**Da spec:**
- [IOS]-07: "QUANDO o paywall lista planos, ENTÃO mostra, além de preço e "/ mês", um texto de renovação automática adequado à plataforma (iOS: cobrança na conta Apple, renova salvo cancelamento até 24 h antes do fim do período, gerenciar em Ajustes; Android: equivalente Google Play). ENTÃO o paywall exibe links tocáveis para **Termos de Uso** e **Política de Privacidade** (URLs de `useLegalDocs`). ENTÃO "Restaurar compras" continua visível."
- Manual §7.5: "preço, período e o que está incluso visíveis antes de comprar; links para Termos de Uso (EULA) e Política de Privacidade na própria tela; botão "Restaurar compras" visível."
**Ler antes:**
- `app/paywall.tsx`: ramo final com `plans.map` (~247), preço `priceString` + "/ mês" (~251, só aparece com offering carregada), botões "Já assinei · Restaurar compras" (~297) e "Agora não" (~305).
- `src/lib/paywallContent.ts` (`paywallContent`, `planContent`: onde entra a função nova) e `src/lib/paywallContent.test.ts` (estilo).
- `src/lib/store.ts` (da T02): `storeKind(os)` / `storeName(os)`.
- `src/hooks/useLegalDocs.ts` (`byType(doc_type)?.url`) e `src/components/TermsAcceptance.tsx` (padrão de link: `<Text className="text-violet-soft font-semibold" onPress=...>` + `Linking.openURL`).
- `src/types/legal.ts` (doc types: `'termos_uso'` e `'privacidade'`).
**Pronto quando:**
- `paywallContent.ts` exporta `renewalNotice(os: string): string`, sem importar `react-native`. Textos sugeridos:
  - iOS: **"Assinatura mensal com renovação automática. A cobrança é feita na sua conta Apple ao confirmar a compra, e a assinatura renova sozinha, salvo se for cancelada até 24 horas antes do fim do período. Gerencie ou cancele em Ajustes > seu nome > Assinaturas."**
  - Android/demais: **"Assinatura mensal com renovação automática. A cobrança é feita na sua conta Google Play, e a assinatura renova sozinha até você cancelar. Gerencie ou cancele na Play Store, em Pagamentos e assinaturas."**
  Testes: iOS cita "conta Apple", "24 horas" e "Ajustes"; Android cita "Google Play"; `'web'` cai no texto Google.
- No ramo com planos listados, abaixo dos cards (antes de "Restaurar compras"): o texto `renewalNotice(Platform.OS)` e a linha "Termos de Uso · Política de Privacidade" com os dois links tocáveis. As URLs vêm de `useLegalDocs().byType('termos_uso' | 'privacidade')`; enquanto a consulta não volta (ou offline), usar fallback `https://apppersonafit.vercel.app/legal/termos-de-uso` e `https://apppersonafit.vercel.app/legal/privacidade`, para os links nunca ficarem mortos.
- "Já assinei · Restaurar compras" continua visível; preço + "/ mês" continuam como estão.
- `npx vitest run` e `npm run typecheck` verdes.
**Verificar:**
- `npx vitest run src/lib/paywallContent.test.ts && npx vitest run && npm run typecheck`
- Tester, web contra o Supabase local (ver "Regras que valem para todas"): criar conta comum em "Cadastre-se", abrir `/paywall?feature=chat` → cards Pro e Premium, texto de renovação citando Google Play, links "Termos de Uso" e "Política de Privacidade" que abrem as páginas do hotsite, "Já assinei · Restaurar compras" visível. No web o preço não aparece (sem billing): esperado.
- Tester, simulador iOS (exige T01; pode rodar contra o local com as mesmas variáveis): mesmo roteiro, texto citando conta Apple, 24 horas e Ajustes.
**Notas:**
- Não mexer em `purchasePackage`/`billing.ts` (T02) nem na lógica de troca de plano.
- Proibido qualquer texto ou link de "assine pelo site" (3.1.1, manual §7.5/§14.11).
- O paywall é modal com `ScrollView`: texto pequeno (`text-text-muted text-[11px] leading-relaxed`, como o rodapé do `SubscriptionCard`), centralizado.

---

### T06 — Gerenciar assinatura e textos com a loja da plataforma
**Onda:** 2 · **Visual:** sim · **Depende de:** T01, T02 · **Status:** finalizado (conferido no Simulador iPhone 17 Pro Max em 2026-11-09)
**O quê:** "Gerenciar assinatura" abre o gerenciamento de assinaturas da Apple no iOS e o da Play no Android; os textos que hoje citam Google Play/Play Store passam a citar a loja da plataforma, no cartão "Minha assinatura" e no perfil do professor.
**Arquivos:** `src/components/SubscriptionCard.tsx`, `app/encontrar-professor/[id].tsx`
**Da spec:**
- [IOS]-08: "QUANDO o usuário toca "Gerenciar assinatura" no iOS, ENTÃO abre o gerenciamento de assinaturas da Apple (`https://apps.apple.com/account/subscriptions`); no Android, a Play como hoje. ENTÃO os textos "cancele na Play Store"/"feitos na Google Play" viram o nome da loja da plataforma (`SubscriptionCard`, `encontrar-professor/[id]`)."
**Ler antes:**
- `src/components/SubscriptionCard.tsx`: import `PLAY_SUBSCRIPTIONS_URL` (~15), comentário do topo (~22), botão "Gerenciar assinatura" (~129, só com `hasStoreSub`), rodapé "Cancelamento e troca de plano são feitos na Google Play." (~148).
- `app/encontrar-professor/[id].tsx`: import `PLAY_SUBSCRIPTIONS_URL` (~33), `temAssinaturaPropria = tierAtLeast(entQ.data?.tier, 'pro')` (~75), aviso "Você tem uma assinatura ativa" com "cancele na Play Store." e "Gerenciar assinatura na Play Store" (~281–300).
- `src/lib/store.ts` (da T02): `subscriptionsUrl(os)`, `storeName(os)`.
**Pronto quando:**
- Os dois arquivos usam `subscriptionsUrl(Platform.OS)` e `storeName(Platform.OS)`; nenhum import de `PLAY_SUBSCRIPTIONS_URL` sobra neles.
- Textos: "Cancelamento e troca de plano são feitos na {App Store | Play Store}."; "...se não quiser mais pagar, cancele na {loja}."; "Gerenciar assinatura na {loja}". Comentário do topo do `SubscriptionCard` fala das duas lojas.
- `grep -n "Google Play\|Play Store" src/components/SubscriptionCard.tsx "app/encontrar-professor/[id].tsx"` não acha texto fixo de loja.
- `npm run typecheck` verde.
**Verificar:**
- `npm run typecheck && npx vitest run`
- Tester, web contra o Supabase local: criar conta comum; no psql local dar assinatura de loja (`insert into public.subscriptions (user_id, source, tier, status, period_end) values ('<id>', 'store_play', 'pro', 'active', now() + interval '30 days') on conflict (user_id) do update set source = excluded.source, tier = excluded.tier, status = excluded.status, period_end = excluded.period_end;`) → Perfil > "Minha assinatura" mostra "Gerenciar assinatura" e o rodapé "...feitos na Play Store."; tocar abre a página de assinaturas da Play.
- Tester, simulador iOS (exige T01): mesmo cartão com "App Store" e o botão abrindo `apps.apple.com/account/subscriptions`. O aviso do perfil do professor (`/encontrar-professor/<id>`, precisa de professor público no local e tier `premium` para passar no gate da busca) é conferido se o dado existir; senão, conferir pelo código/typecheck e registrar.
- Limpar o dado de teste no local ao final.
**Notas:**
- Seguir a spec: a URL é escolhida pela **plataforma**, não pela loja onde a assinatura foi feita (`ent.source`). Assinante da Play abrindo no iPhone cai na Apple: limitação conhecida, anotar no relatório, não resolver.
- `Platform` vem de `react-native` (já importado nos dois arquivos? conferir; o `[id].tsx` importa `Linking` do mesmo pacote).

---

### T07 — Aviso de atualização por plataforma e `app_config.ios_store_url`
**Onda:** 2 · **Visual:** sim · **Depende de:** T01, T02 · **Status:** finalizado
**O quê:** `app_config` ganha a coluna `ios_store_url` (migration idempotente + teste SQL); o app passa a lê-la; no iOS o `UpdateGate` abre `ios_store_url` (ou a App Store) e nunca a Play, e os textos padrão dizem "App Store"; no Android tudo segue como hoje (fluxo nativo da Play + "Play Store").
**Arquivos:** `supabase/migrations/20261109120000_app_config_ios_store_url.sql`, `supabase/tests/app_config_ios_store_url.test.sql`, `src/services/appConfig.ts`, `src/components/UpdateGate.tsx`, `src/lib/storeUpdate.ts`, `src/lib/storeUpdate.test.ts`
**Da spec:**
- [IOS]-09: "QUANDO há atualização do binário no iOS, ENTÃO o `UpdateGate` abre `app_config.ios_store_url` (ou, sem ele, a App Store), nunca a Play; o fluxo nativo da Play segue só no Android. ENTÃO os textos padrão dizem "App Store" no iOS e "Play Store" no Android. ENTÃO existe migration idempotente adicionando `app_config.ios_store_url text`."
- Fora do escopo: campo `ios_store_url` no painel admin (repo `nutrion-painel`) — vai para o backlog (T08). Pré-requisito M8: preencher `ios_store_url` depois que o app estiver na loja.
**Ler antes:**
- `supabase/migrations/20261013160000_avisos_remotos.sql` (criação de `app_config`, linha única, `comment on table`, policy `app_config_read` para anon/authenticated).
- `supabase/tests/plano_elite.test.sql` (cabeçalho, `begin;`…`rollback;`, `do $$ ... assert ... $$`, NOTICE final "...: ALL PASS") e `supabase/tests/announcements.test.sql` ~linha 75 (como lê `app_config` como anon).
- `src/services/appConfig.ts` (tipo `AppConfig` e o `select` com a lista de colunas).
- `src/components/UpdateGate.tsx` (`abrirLoja` com `PLAY_APP_URL`/`PLAY_WEB_URL`, `atualizar` com fluxo nativo só em Android, `onAtualizar` com `android_store_url`, textos padrão ~80–81).
- `src/lib/storeUpdate.ts` + `src/lib/storeUpdate.test.ts` (`chooseUpdatePath`, estilo dos testes com o requisito no `describe`).
- `src/lib/store.ts` (da T02): `storeKind(os)`, `storeName(os)`. `src/lib/playStore.ts` (constantes da Play).
**Pronto quando:**
- Migration: `alter table public.app_config add column if not exists ios_store_url text;` + `comment on column` (URL da página do app na App Store, preenchida depois da publicação). Aplicada **duas vezes** no local sem erro.
- Teste SQL (transacional, `rollback`): a coluna existe com tipo `text`; anon lê `ios_store_url` da linha única; termina com NOTICE `APP_CONFIG_IOS: ALL PASS`.
- `appConfig.ts`: `ios_store_url: string | null` no tipo e no `select`.
- `storeUpdate.ts` ganha, puros:
  - `storeUpdateTarget(os, { android_store_url, ios_store_url })` → `{ url, fallback }`: iOS → `url = ios_store_url || 'itms-apps://apps.apple.com/'`, `fallback = 'https://apps.apple.com/'` (nunca URL da Play); Android/demais → `url = android_store_url || PLAY_APP_URL`, `fallback = PLAY_WEB_URL` (como hoje).
  - `defaultUpdateMessage(os, blocked)` → os dois textos atuais com `storeName(os)` no lugar de "Play Store".
  - Testes: iOS com e sem `ios_store_url`, iOS ignorando `android_store_url`, Android igual a hoje, mensagens com "App Store"/"Play Store".
- `UpdateGate.tsx` usa os dois helpers com `Platform.OS`; o módulo nativo da Play (`moduloInApp`) continua só em Android; `config.update_message`/`update_title` do banco continuam tendo prioridade.
- `npx vitest run` e `npm run typecheck` verdes; teste SQL passa.
**Verificar:**
```sh
docker exec -i supabase_db_nutrion psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261109120000_app_config_ios_store_url.sql   # 2x
docker exec -i supabase_db_nutrion psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/app_config_ios_store_url.test.sql
docker exec -i supabase_db_nutrion psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/announcements.test.sql
npx vitest run src/lib/storeUpdate.test.ts && npx vitest run && npm run typecheck
```
- Tester, web contra o Supabase local: `update public.app_config set min_version = '99.0.0';` → abrir o app (até deslogado) → modal "Nova versão disponível" sem "Depois", texto "...Atualize na Play Store pra continuar."; com `min_version = null, recommended_version = '99.0.0'` → modal com "Depois" e "...na Play Store, com melhorias...". **Ao final:** `update public.app_config set min_version = null, recommended_version = null;`
- Tester, simulador iOS (exige T01, app contra o local): mesmo roteiro, textos com "App Store"; "Atualizar" abre a App Store, não a Play.
**Notas:**
- **Não** rodar `supabase db push` nem `migration up --linked`: só psql no Docker local. Deploy da migration é depois (T08 registra).
- **Ordem de deploy (registrar no relatório para a T08):** a migration precisa ir para produção **antes** de qualquer OTA com este `select`; sem a coluna o PostgREST devolve erro, o `useAppUpdate` cai em `'none'` e o aviso de atualização some em silêncio para todos.
- Nome do arquivo de migration fixo como acima (timestamp depois de `20261104000000_plano_elite.sql`).

---

### T08 — Scripts de OTA, documentação e verificação final
**Onda:** 3 · **Visual:** não · **Depende de:** T01, T02, T03, T04, T05, T06, T07 · **Status:** pendente
**O quê:** os scripts de OTA passam o ambiente da EAS; o manual, o PROJECT e o STATE refletem o que foi implementado, as decisões, as pendências manuais e a ordem de deploy; o backlog ganha os itens deixados de fora. Fecha com a verificação completa do critério de pronto.
**Arquivos:** `package.json`, `MANUAL-APP-STORE.md`, `.specs/project/PROJECT.md`, `.specs/project/STATE.md`, `.specs/backlog/melhorias.md`
**Da spec:**
- [IOS]-12: "ENTÃO `npm run update:production` (e `update:preview`) passam `--environment production` (`preview` para o preview). ENTÃO `eas.json` ganha `submit.production.ios` com `ascAppId` **somente quando o app existir no App Store Connect** (fica como tarefa manual registrada; sem placeholder inválido)."
- [IOS]-13: "ENTÃO `MANUAL-APP-STORE.md` §0.2 reflete o que foi implementado, `PROJECT.md` tira iOS do "Fora do escopo" e `STATE.md` registra decisões e pendências manuais."
- Fora do escopo a registrar em backlog: "Campo `ios_store_url` no painel admin (repo `nutrion-painel`)"; "Atualizar política de privacidade do hotsite para citar Apple (login/pagamentos)". O item "Login com Apple e com Google no iPhone" **já existe** em `.specs/backlog/melhorias.md` (não duplicar).
- Pré-requisitos manuais: M5 (RevenueCat iOS + `EXPO_PUBLIC_RC_API_KEY_IOS` na EAS production), M6 (grupos Professor: `nutrion_prof_pro` R$ 15,90, `nutrion_prof_premium` R$ 29,90, `nutrion_prof_elite` R$ 49,90; Pessoal: `nutrion_comum_pro` R$ 15,90, `nutrion_comum_premium` R$ 29,90; mensais), M7 (chave APNs e `ascAppId` no `eas.json` depois de criar o app), M8 (`app_config.ios_store_url` depois do app na loja).
- Critério de pronto: "Todos os `[IOS]-XX` com teste (lógica pura) ou verificação manual registrada. `npm test` e `npm run typecheck` verdes; `npx expo config --type public` mostra a seção `ios` correta; `sips -g hasAlpha assets/icon-ios.png` = `no`."
**Ler antes:**
- `package.json` scripts `update:preview` e `update:production` (o `--message` fica por último porque o texto é passado depois pelo dev).
- `MANUAL-APP-STORE.md` §0.2 (tabela de situação, conferida em 2026-11-03), §7.1 (snippet ainda com `usesAppleSignIn: true`), §7.3 (ainda descreve Apple + Google no iOS), §7.5, §14.14 (incidente do `--environment`).
- `.specs/project/PROJECT.md` seção "Scope" (linha "**Fora (por enquanto):** iOS, ...").
- `.specs/project/STATE.md`: seção "Plano Elite e Pessoal Premium (2026-11-04)" (formato: decisões, ordem de deploy obrigatória, pendências) e a seção "Publicação iOS (2026-11-09)" que a T04 criou com o resultado da verificação do reset de senha (completar, não duplicar).
- `.specs/backlog/melhorias.md` item "Login com Apple e com Google no iPhone" (formato **Origem / O que é**).
- `.specs/features/2026-11-03-publicacao-ios/context.md` (tabelas de decisões de 2026-11-03 e 2026-11-09).
- Relatórios das tarefas T01–T07 (limitações anotadas: troca de plano entre lojas diferentes, gerenciar assinatura pela plataforma e não pela loja de origem; resultado da verificação do reset).
**Pronto quando:**
- `package.json`: `"update:preview": "eas update --branch preview --environment preview --message"` e `"update:production": "eas update --branch production --environment production --message"`. `eas.json` **não** muda.
- Manual §0.2: data de conferência 2026-11-09 e tabela atualizada (seção `ios` ✅, ícone iOS sem alfa ✅, login social no iOS: fora da 1ª versão por decisão, Google escondido no iOS ✅, RevenueCat por plataforma ✅ com chave iOS pendente (M5), webhook `store_apple` ✅ com deploy pendente, paywall 3.1.2 ✅, gerenciar assinatura por plataforma ✅, `UpdateGate` + `ios_store_url` ✅ (migration pendente de deploy), consentimento IA de terceiros ✅, Podfile via plugin ✅, push: falta APNs (M7), `ascAppId`: falta (M7)). §7.1 e §7.3 alinhados à decisão (sem `usesAppleSignIn`, retrato no `infoPlist`, Google só no Android).
- `PROJECT.md`: iOS (App Store, só iPhone) sai do "Fora" e entra no "Dentro".
- `STATE.md` "Publicação iOS (2026-11-09)": decisões (sem login social no iOS / opção B, bundle `br.com.personafit`, só iPhone, retrato só no iOS, 5 produtos em 2 grupos, plugin do Podfile); pendências manuais M5–M8; **ordem de deploy**: 1) migration `20261109120000_app_config_ios_store_url` em produção → 2) `supabase functions deploy revenuecat-webhook --no-verify-jwt` → 3) OTA para o Android (só depois da migration; o `select` de `app_config` passa a pedir `ios_store_url`) → 4) primeiro build iOS (`eas build -p ios`, nativo, não OTA) depois de M5–M7; limitações conhecidas vindas dos relatórios.
- `melhorias.md`: itens "Campo `ios_store_url` no painel admin (nutrion-painel)" e "Política de privacidade do hotsite citando Apple (pagamentos)", com Origem = spec `2026-11-03-publicacao-ios`.
- Verificação final, com saída anexada ao relatório: `npx vitest run` verde, `npm run typecheck` verde, `npx expo config --type public` com a seção `ios` correta, `sips -g hasAlpha assets/icon-ios.png` = `hasAlpha: no`, todos os testes SQL de `supabase/tests/` que tocam `app_config` passando no local.
**Verificar:**
```sh
grep -n '"update:' package.json
npx vitest run && npm run typecheck
npx expo config --type public | sed -n '/"ios"/,/}/p'
sips -g hasAlpha assets/icon-ios.png
docker exec -i supabase_db_nutrion psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/app_config_ios_store_url.test.sql
git diff --stat main...HEAD
```
**Notas:**
- **Não** rodar `npm run update:*`, `eas build`, `eas submit` nem deploy de function/migration: só documentar.
- Não pôr `ascAppId` placeholder no `eas.json` (manual §8.3/§14.6: ID errado = envio "ERRORED").
- STATE e manual em PT-BR, frases curtas, sem travessão decorativo; seguir o tom das seções existentes.
- Se algum teste falhar na verificação final, não corrigir código de outra tarefa: registrar no relatório qual tarefa e qual comando.
