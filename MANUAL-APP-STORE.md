# Manual — Publicar o Persona Fit na App Store (primeira vez)

> Do zero até o app no ar: conta de desenvolvedor Apple (US$ 99/ano), configuração do projeto
> Expo/EAS, TestFlight, revisão e lançamento. Escrito a partir da publicação real do
> **DOD Questões** (out/2026), com tudo o que deu errado lá, mais o que costuma derrubar apps
> parecidos com o Persona Fit (login Google, assinaturas, câmera, IA, notificações).
>
> **Escrito em:** 2026-10-18. As regras da Apple mudam; confira os links oficiais do §13 antes
> de cada etapa.

---

## 0. Visão geral e prazos realistas

| Etapa | Tempo típico | Quem |
|---|---|---|
| 1. Conta Apple Developer (inscrição + pagamento + aprovação) | de algumas horas a 2 dias (pessoa física) | você |
| 2. Contratos, impostos e banco (obrigatório para vender assinatura) | 1 a 3 dias (validação da Apple) | você |
| 3. Criar o app no App Store Connect + produtos de assinatura | 1 h | você |
| 4. Ajustar o projeto para iOS (Sign in with Apple, RevenueCat iOS, push, etc.) | 1 a 3 dias de código | você |
| 5. Build na EAS + envio ao App Store Connect | 30 a 60 min | EAS |
| 6. TestFlight + teste em iPhone real | 1 dia | você |
| 7. Página da loja (textos, capturas, privacidade, classificação etária) | 2 a 4 h | você |
| 8. Revisão da Apple | 24 a 48 h (cada rodada) | Apple |
| 9. Lançamento | imediato ou agendado | você |

**Comece pela conta e pelos contratos (§1 e §2) já:** são as etapas com espera, e sem o contrato
pago assinado **as assinaturas não aparecem nem no TestFlight**.

---

## 1. Conta de desenvolvedor Apple (Apple Developer Program)

### 1.1 Pessoa física ou organização?
| | **Individual (pessoa física)** | **Organização** |
|---|---|---|
| Nome que aparece na loja como vendedor | **seu nome legal** ("Robson Solano") | nome da empresa |
| Exige | Apple ID com 2FA, documento com foto | **número D-U-N-S** (gratuito, pode levar 1 a 2 semanas), CNPJ, site, poder legal de assinatura |
| Acesso de outras pessoas | dá para convidar usuários no App Store Connect, **mas só você (Titular) acessa Certificates/Keys** no developer.apple.com | vários Admins com acesso completo |

> **Lição do DOD Questões:** a conta era **Individual** (de outra pessoa). Ninguém além do
> Titular conseguia criar a chave de push (APNs) — a tela mostrava *"Access Unavailable"*.
> Como o Persona Fit é seu e você mesmo vai operar, **Individual resolve**. Se um dia o app for
> de uma empresa (CNPJ), migrar de Individual para Organização é possível, mas dá trabalho —
> decida antes se o nome do vendedor importa.

### 1.2 Antes de se inscrever
- **Apple ID com autenticação de dois fatores** ativa (use o Apple ID que vai ser o "dono" do app para sempre).
- **Nome legal** no Apple ID (nome e sobrenome reais). Apelido ou nome de empresa atrasa a aprovação.
- **Endereço real** (caixa postal não é aceita), telefone e e-mail válidos.
- Maioridade legal.
- Documento oficial com foto (RG/CNH/passaporte) à mão — a verificação de identidade pede.

### 1.3 Inscrição e pagamento (US$ 99 por ano)
**Caminho mais rápido para pessoa física: o app "Apple Developer" no iPhone.**
1. Instale o app **Apple Developer** (App Store) no iPhone e entre com o Apple ID.
2. **Conta → Inscrever-se agora** (Enroll Now). Siga: dados pessoais → verificação de identidade (foto do documento) → aceite dos termos.
3. Pague a anuidade **no próprio app** (cobrança na forma de pagamento do Apple ID). O valor é cobrado na moeda local equivalente a US$ 99.
4. Alternativa: pelo site https://developer.apple.com/programs/enroll/ (pagamento por cartão).

**Depois de pagar:** chega e-mail de confirmação. Para pessoa física costuma liberar no mesmo
dia ou em até 48 h. Se passar de 2 dias úteis, abra contato em
https://developer.apple.com/contact/ (*Membership and Account*).

**Dificuldades comuns na inscrição:**
- **"Unable to verify identity"** → nome do Apple ID diferente do documento. Corrija o nome no Apple ID e tente de novo.
- **Pagamento recusado** → cartão sem compras internacionais habilitadas; tente outro cartão ou o app no iPhone.
- **Inscrição "pendente" por dias** → a Apple às vezes liga ou pede documento. Responda rápido o e-mail.
- **Renovação anual:** se a assinatura vencer, **o app sai da loja**. Deixe a renovação automática ligada.

### 1.4 Primeiro acesso
- **developer.apple.com/account** → confira em *Membership details* o **Team ID** (10 caracteres, ex.: `F86SNS49G9`). Anote.
- **appstoreconnect.apple.com** → onde fica tudo de loja: apps, TestFlight, contratos, usuários.

> ⚠️ **Pegadinha que custou um envio no DOD Questões:** o número que aparece no **canto
> superior direito** do App Store Connect, ao lado do seu nome (ex.: *"… | 20446889…"*), **não é o
> ID do app nem o Team ID**. É um ID interno da equipe. Ver §5.3.

---

## 2. Contratos, impostos e dados bancários (obrigatório para assinaturas)

O Persona Fit vende assinatura (RevenueCat). Na Apple isso exige o **Contrato de Apps Pagos**
ativo. Sem ele:
- os produtos de assinatura **não carregam** (nem no TestFlight, nem na revisão) — a revisão recusa porque "a compra não funciona";
- você não recebe pagamentos.

### 2.1 Passo a passo
1. **App Store Connect → Negócios** (Business) **→ Contratos** (Agreements).
2. **Contrato de Apps Pagos** (Paid Apps Agreement) → **Visualizar e aceitar**. Só o Titular aceita.
3. **Impostos:** clique em **Adicionar informações fiscais**. Responda o questionário:
   - Você **não é** pessoa dos EUA → a Apple deve te levar ao formulário **W-8BEN** (pessoa física estrangeira).
   - Preencha nome, país (Brasil), endereço, **CPF** como "Foreign TIN".
   - Se aparecer só o **W-9** (formulário de americano) sem opção de estrangeiro, **não preencha**: há relatos de contas presas nisso. Abra contato em https://developer.apple.com/contact/ → *Tax Setup*.
   - A Apple também mostra páginas de impostos de outros países (ex.: Brasil, Austrália). Leia cada uma; para pessoa física no Brasil, em geral basta o W-8BEN, mas siga o que a tela pedir.
4. **Banco:** **Adicionar conta bancária**. Conta em nome do **mesmo titular** da conta Apple. Banco brasileiro funciona (a Apple pede código SWIFT/agência/conta). O pagamento chega em reais, convertido.
5. Status do contrato fica **"Ativo"** só depois de **impostos + banco validados** (pode levar alguns dias).

### 2.2 Small Business Program (comissão de 15% em vez de 30%)
- Quem fatura menos de US$ 1 milhão por ano na App Store paga **15%** em vez de 30% — **mas só se inscrever**: https://developer.apple.com/app-store/small-business-program/
- Faça logo após o contrato ficar ativo (a redução vale a partir da aprovação, não é retroativa).

### 2.3 Status de comerciante na UE (DSA)
- Para distribuir na **União Europeia**, a Apple exige declarar se você é **comerciante (trader)** (Lei de Serviços Digitais). Se for, seu **endereço, telefone e e-mail ficam públicos** na página do app nos países da UE.
- App que cobra assinatura normalmente é "comerciante". **Se não quiser expor seus dados**, a saída mais simples é **não distribuir na UE** (§7.5, Preços e disponibilidade).
- Sem essa declaração, a Apple não aceita o app na loja da UE.

---

## 3. Criar o app no App Store Connect

### 3.1 Registrar o Bundle ID
O Persona Fit hoje **não tem seção `ios` no `app.config.ts`**. Escolha o bundle id **definitivo**
(não muda nunca depois de publicar). Sugestão: igual ao Android, `br.com.nutrion`.

A EAS cria o Bundle ID e os certificados sozinha no primeiro build (§5). Se preferir criar à mão:
developer.apple.com → **Certificates, IDs & Profiles → Identifiers → "+" → App IDs** → marque
as *capabilities* que o app usa (**Push Notifications**, **Sign in with Apple**, **In-App Purchase**).

### 3.2 Criar o registro do app
1. **App Store Connect → Apps → "+" → Novo app**.
2. Plataforma **iOS**, nome **Persona Fit** (precisa estar livre na loja inteira; se estiver em uso, tente "Persona Fit — …"), idioma principal **Português (Brasil)**, Bundle ID, **SKU** (qualquer código interno, ex.: `personafit-ios`).
3. Depois de criado, abra o app e copie o **Apple ID do app** (o `ascAppId`): está na **URL**
   (`appstoreconnect.apple.com/apps/`**`1234567890`**`/...`) ou em *Informações do app → Apple ID*.

### 3.3 Produtos de assinatura (para o RevenueCat)
1. **App → Monetização → Assinaturas → "+" Grupo de assinaturas** (ex.: "Persona Fit Premium").
2. Crie cada plano (mensal, anual…) com **ID do produto** (ex.: `personafit_premium_mensal`) — use os **mesmos nomes de produto que o RevenueCat espera** (ou crie lá com os IDs da Apple).
3. Para cada produto: duração, preço (escolha a faixa), **nome e descrição de exibição** (localização pt-BR) e **captura de tela da tela de compra** + **nota de revisão** (exigidos para o produto ir junto na primeira revisão).
4. Status deve ficar **"Pronto para envio"**. **Na primeira versão, os produtos são revisados junto com o app:** na página da versão, seção *Compras dentro do app e assinaturas*, **selecione os produtos** antes de enviar. Esquecer isso = assinatura não funciona na revisão = recusa.

---

## 4. Ajustar o projeto para iOS (o que muda no código)

> Rodar o app no iOS **não é só buildar**: Persona Fit tem 5 pontos que a Apple trata de forma
> diferente da Google.

### 4.1 `app.config.ts` — seção `ios`
```ts
ios: {
  bundleIdentifier: 'br.com.nutrion',
  // ⚠️ Decisão PERMANENTE (ver §11.1). false = só iPhone (roda em iPad em modo compatibilidade).
  supportsTablet: false,
  config: { usesNonExemptEncryption: false }, // pula o questionário de criptografia do TestFlight
  infoPlist: {
    // O <StatusBar> do RN usa a API global; com true o app pode fechar ao abrir (lição DOD).
    UIViewControllerBasedStatusBarAppearance: false,
    CFBundleDevelopmentRegion: 'pt-BR',
    CFBundleLocalizations: ['pt-BR'],
  },
  usesAppleSignIn: true, // ver §4.2
},
```
- As frases de permissão de **câmera e fotos** já estão no plugin `expo-image-picker` — ótimo. A Apple recusa frase genérica ("precisamos da câmera"); as suas explicam o motivo, **mantenha assim** (diretriz 5.1.1).
- `userInterfaceStyle: 'dark'` está ok.

### 4.2 Login Google → precisa oferecer **Sign in with Apple** (diretriz 4.8)
- Regra: se o app usa login de terceiro (Google) para a conta principal, precisa oferecer **também** uma opção equivalente que só peça nome/e-mail e permita **esconder o e-mail** — na prática, **Sign in with Apple**.
- O Persona Fit tem login por e-mail **e** Google. A isenção da Apple só vale para app que usa **exclusivamente** o próprio login. Com Google presente, **inclua Sign in with Apple** para não arriscar recusa.
- Como fazer (Expo + Supabase):
  - `npx expo install expo-apple-authentication` e `usesAppleSignIn: true` no `ios`.
  - Botão "Continuar com Apple" (componente oficial `AppleAuthenticationButton`, **no mínimo do mesmo tamanho/destaque do botão Google**).
  - No Supabase: habilitar o provider **Apple** e usar `signInWithIdToken({ provider: 'apple', token })`.
  - O e-mail pode vir como `xxxx@privaterelay.appleid.com` (e-mail oculto) — seu backend precisa aceitar.
  - O nome do usuário **só vem no primeiro login** — salve na hora.
- **Google no iOS:** precisa de um **Client ID do tipo iOS** no Google Cloud e do **iosUrlScheme** (Client ID invertido) no plugin `@react-native-google-signin/google-signin` do `app.config.ts`. Sem isso o login Google fecha ou falha só no iPhone.

### 4.3 Exclusão de conta (diretriz 5.1.1(v)) — ✅ já existe
App que permite **criar conta** precisa permitir **excluir a conta dentro do app**. O Persona Fit
já tem (`DangerZone` → "Excluir conta"). Confirme que exclui de verdade (ou dispara a exclusão)
e mencione o caminho nas notas de revisão.

### 4.4 Assinaturas (RevenueCat) no iOS
- Hoje `src/services/billing.ts` usa só `EXPO_PUBLIC_RC_API_KEY_ANDROID`. **O iOS precisa da chave Apple do RevenueCat** (`appl_...`):
  ```ts
  const API_KEY = Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_RC_API_KEY_IOS
    : process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID;
  ```
  e cadastrar `EXPO_PUBLIC_RC_API_KEY_IOS` nas variáveis do ambiente `production` da EAS.
- No **RevenueCat**: adicionar o app iOS (bundle id), a **App Store Connect API Key de compras (In-App Purchase Key)** e/ou o **App-Specific Shared Secret**, importar os produtos e ligá-los às mesmas *entitlements* do Android.
- **Regras da Apple para a tela de assinatura (3.1.2) — causa clássica de recusa:**
  - mostrar **preço, período e o que está incluso** antes de comprar;
  - se houver teste grátis, dizer **quanto dura e quanto cobra depois**;
  - links visíveis para **Termos de Uso (EULA)** e **Política de Privacidade** na própria tela de compra;
  - botão **"Restaurar compras"** (o `restorePurchases` já existe — deixe visível);
  - na página da loja, colocar o link dos Termos no campo descrição ou usar o EULA padrão da Apple.
- **Nada de pagamento fora da Apple (3.1.1):** conteúdo digital/assinatura **só por compra dentro do app**. Não coloque link ou texto do tipo "assine pelo site mais barato" (lição DOD: até um texto "Renove no site" é risco).
- **Teste de compra:** **App Store Connect → Usuários e acesso → Sandbox → Testadores** → crie uma conta sandbox. No TestFlight, as compras já são sandbox (não cobram).

### 4.5 Notificações push no iOS (chave APNs) — passo a passo

**Como o push do Persona Fit funciona hoje** (conferido no código):
`src/services/pushNotifications.ts` pede a permissão, gera o **Expo Push Token**
(`getExpoPushTokenAsync`) e salva em `profiles.expo_push_token` no Supabase. As Edge Functions
enviam pela API da Expo (`supabase/functions/_shared/expoPush.ts` → `exp.host/--/api/v2/push/send`).
A Expo entrega no Android pelo FCM e **no iOS pela Apple (APNs)** — e para isso a Expo precisa
de uma **chave APNs da sua conta Apple**. Sem ela, o token iOS até é gerado, mas **nenhuma
notificação chega no iPhone**. Nada muda no backend: o mesmo token/envio serve para os dois.

**Passo 1 — Declarar o push no projeto** (`app.config.ts`, lista `plugins`):
```ts
['expo-notifications', { mode: 'production' }],
```
O Expo já aplica esse plugin sozinho por estar instalado, mas deixar explícito com
`mode: 'production'` garante a permissão `aps-environment: production` no build de loja
(o DOD Questões usa `ios.entitlements: { 'aps-environment': 'production' }`, que tem o mesmo efeito).

**Passo 2 — Gerar a chave APNs (a EAS faz por você).** Escolha um caminho:

*Caminho A (recomendado), no primeiro build:* ao rodar `npx eas-cli build -p ios --profile production`,
a EAS pergunta algo como *"Would you like to set up Push Notifications for your project?"* →
responda **Yes** → ela entra com seu Apple ID, **cria a chave APNs** na sua conta e guarda.

*Caminho B, a qualquer momento:*
```bash
npx eas-cli credentials -p ios
```
→ perfil **production** → **Push Notifications: Manage your Apple Push Notifications Key** →
**Set up / Generate a new key** (a EAS cria) **ou** **Add a new key** (se você criou à mão, Passo 3).

**Passo 3 — (só se quiser criar à mão) a chave no site da Apple:**
1. https://developer.apple.com/account/resources/authkeys/list → **"+"**.
2. Nome: `APNs Persona Fit` → marque **Apple Push Notifications service (APNs)** → **Configure**:
   ambiente **Sandbox & Production**, escopo **Team Scoped (All Topics)** → Continue → **Register**.
3. **Download** do `AuthKey_XXXXXXXXXX.p8` — **só baixa uma vez**; guarde num cofre de senhas.
   Anote o **Key ID** (10 caracteres) e o **Team ID** (developer.apple.com → Membership).
4. Suba na EAS pelo Caminho B (**Add a new key**), informando o `.p8`, o Key ID e o Team ID.
- A Apple permite **no máximo 2 chaves APNs por equipe**. Antes de criar, veja na lista se já existe.
- Uma chave serve para **todos os seus apps** (escopo Team).
- Na conta Individual, só você (Titular) acessa essa tela, e como a conta é sua isso não atrapalha.

**Passo 4 — Conferir:** `npx eas-cli credentials -p ios` → perfil production deve mostrar
**Push Key** configurada (além de Distribution Certificate e Provisioning Profile). Em
developer.apple.com → Identifiers → `br.com.nutrion`, a capability **Push Notifications** fica marcada
(a EAS marca sozinha).

**Passo 5 — Testar no iPhone (pelo TestFlight):**
1. Instale o build pelo TestFlight, faça login e **aceite** o pedido de notificação.
2. Confirme no Supabase que `profiles.expo_push_token` do seu usuário foi preenchido (começa com `ExponentPushToken[...]`).
3. Envie um teste em https://expo.dev/notifications colando o token (ou dispare pela sua Edge Function).
4. Teste com o app **aberto**, **em segundo plano** e **fechado**.
- Build do TestFlight/App Store usa o **APNs de produção** — por isso o `mode: 'production'`.
- **Simulador:** o push remoto não serve para validar de verdade. Teste no iPhone.

**Passo 6 — Se não chegar:**
- Resposta da Expo com erro **`InvalidCredentials`** → chave APNs ausente ou errada na EAS (volte ao Passo 2/4).
- **`DeviceNotRegistered`** → token velho (app reinstalado); o app precisa salvar o token novo.
- Token não é gerado → permissão negada; no iOS o pedido aparece **uma vez só**. Depois de negar,
  só pelos **Ajustes → Persona Fit → Notificações**. Reinstalar o app para testar de novo.

**Boas práticas para a revisão e para o usuário:**
- Peça a permissão **no momento certo** (ex.: ao ativar lembretes), com uma tela explicando o
  benefício antes do pedido do sistema. Hoje o app pede ao registrar — confira em que tela isso ocorre.
- **Não use push para propaganda** sem o usuário optar por isso (diretriz 4.5.4); se mandar
  promoções, ofereça como desligar dentro do app.
- Se um dia trocar a Expo por **Firebase (FCM) direto** no iOS, a chave APNs precisa ser enviada
  também ao Firebase (lição DOD Questões: estava vazio lá e o push não entregava no iOS).

### 4.6 IA e dados pessoais (diretriz 5.1.2 / 1.4.1)
- O app manda **fotos de refeições e dados para IA de terceiros** (`chat-ai`, análise de pratos). A Apple exige **informar claramente** que dados vão para serviços de IA de terceiros e **pedir permissão explícita** antes. Faça uma tela de consentimento antes do primeiro uso da IA e cite isso na Política de Privacidade.
- **Saúde/nutrição:** evite promessas médicas ("cura", "trata", "diagnóstico"). Inclua aviso de que o conteúdo não substitui nutricionista/médico. Apps com orientação de saúde sem base passam a ser tratados como "médicos" (1.4.1) e a revisão fica mais rígida.
- Conteúdo gerado por IA: se houver chat aberto, a Apple pode pedir mecanismo de denúncia/filtro de conteúdo impróprio.

### 4.7 Manifesto de privacidade
- O iOS exige que app e SDKs declarem o uso de certas APIs (`PrivacyInfo.xcprivacy`). O Expo SDK 54 e as bibliotecas atuais já trazem os manifestos; se o App Store Connect mandar e-mail de **"Missing API declaration"** depois do upload, adicione em `ios.privacyManifests` do `app.config.ts` o que o e-mail listar.

### 4.8 Versão mínima do Xcode/SDK
- Desde **28/04/2026**, todo app enviado precisa ser compilado com **Xcode 26+ (SDK iOS 26)**. A EAS usa uma imagem compatível com o Expo 54 — não precisa de nada, mas **não force imagem antiga** no `eas.json`.
- ⚠️ **Lição DOD (Xcode 27):** compilado com o **SDK do iOS 27**, um app Expo/RN que ainda não adotou o ciclo de vida *UIScene* **fecha ao abrir no iOS 27**. Hoje a EAS compila com Xcode 26 e não acontece. Quando a Apple passar a exigir o SDK 27 (provavelmente abril/2027), atualize o Expo para uma versão que suporte UIScene **antes** de buildar.

---

## 5. Build e envio com a EAS

### 5.1 Conta da EAS
`npx eas-cli whoami` → precisa ser a conta **dona do projeto** (o `projectId` do Persona Fit).
Lição DOD: com a conta errada logada, tudo falha com *"Entity not authorized"*.

### 5.2 `eas.json` — adicionar o submit do iOS
```jsonc
"submit": {
  "production": {
    "android": { "...": "como já está" },
    "ios": {
      "ascAppId": "1234567890"   // o Apple ID do APP (§3.2), NÃO o número do canto da tela
    }
  }
}
```
O `ascAppId` não é segredo — pode commitar.

### 5.3 ⚠️ `ascAppId` errado = envio "ERRORED"
No DOD Questões usamos o número `20446889670` (que aparece ao lado do nome da conta, no topo do
App Store Connect). **Esse é o ID da equipe, não do app.** O `eas submit` terminou em
**ERRORED** e nada chegou ao TestFlight. O certo é o número da **URL do app**.

### 5.4 Primeiro build (credenciais)
```bash
npx eas-cli build -p ios --profile production
```
- Na primeira vez pede **login com o Apple ID** (o da conta de desenvolvedor) e oferece **gerar tudo**: Distribution Certificate, Provisioning Profile, Bundle ID, chave de push. **Aceite que a EAS gere e guarde.**
- **Não gere certificados novos** se já existirem válidos (invalida os anteriores).
- Leva 15 a 30 min na nuvem. **Não precisa de Mac.**
- O build number sobe sozinho (`appVersionSource: remote` + `autoIncrement` — já configurado).

### 5.5 Enviar ao App Store Connect
```bash
npx eas-cli submit -p ios --profile production --latest
```
- Na primeira vez, aceite que a EAS **gere uma App Store Connect API Key** (precisa ser Admin/Titular). Depois disso **o submit nunca mais pede login**.
- ⚠️ **O arquivo do build fica na EAS só 30 dias.** Depois vira *Expired* e não dá mais para enviar — precisa buildar de novo. Envie logo depois do build.
- A Apple processa o binário em 5 a 30 min e manda e-mail.

---

## 6. TestFlight (teste antes da loja)

TestFlight é o app da Apple que instala **o mesmo binário que vai para a loja**, em iPhone real.

1. **App Store Connect → seu app → TestFlight → Testes internos → "+"** → crie um grupo (ex.: "Equipe") e se adicione. Testadores internos precisam ser **usuários do App Store Connect** (você já é).
2. Instale o app **TestFlight** no iPhone com o mesmo Apple ID → instale o Persona Fit.
3. Preencha **"O que testar"** na compilação.
4. Testadores **externos** (amigos, até 10 mil, por e-mail ou link público) passam por uma revisão rápida da Apple (*Beta App Review*, até ~1 dia).

**O Simulador do Mac não substitui o TestFlight:** ele roda outro tipo de build, sem push, sem
compras reais e sem a assinatura da loja. Use para ver telas; valide no iPhone.

### 6.1 Roteiro mínimo (no iPhone, pelo TestFlight)
- [ ] Abre sem fechar sozinho (StatusBar, §4.1)
- [ ] Login por e-mail, **Google** e **Apple** — e volta para o app
- [ ] Fechar à força e reabrir → continua logado
- [ ] Câmera e galeria: o pedido de permissão aparece com o texto certo
- [ ] Análise de refeição por IA funciona (tela de consentimento antes, §4.6)
- [ ] **Paywall:** preços carregam, compra em **sandbox** conclui, "Restaurar compras" funciona
- [ ] Notificação: pedido de permissão + recebimento de um push de teste
- [ ] Excluir conta funciona
- [ ] (se `supportsTablet: true`) iPad em retrato e paisagem, teclado aparece nos campos

---

## 7. Página da loja (Distribuição → versão iOS)

### 7.1 Textos
- **Nome** (até 30 caracteres), **Subtítulo** (30), **Palavras-chave** (100, separadas por vírgula, sem repetir o nome), **Descrição**, **O que há de novo** (obrigatório a partir da 2ª versão), **URL de suporte** (obrigatória — pode ser uma página do site), **URL de marketing** (opcional), **Copyright** (ex.: `2026 Robson Solano`).

### 7.2 Capturas de tela
- **iPhone 6,9"** (ex.: iPhone 17 Pro Max, 1320×2868) — obrigatório; a Apple reduz para os tamanhos menores.
- **iPad 13"** — **obrigatório só se `supportsTablet: true`**. Sem elas, o envio é bloqueado.
- Até 10 por tamanho. Podem ter moldura e texto de marketing, mas **precisam mostrar o app de verdade** (nada de tela que não existe).
- Gere no Simulador (`xcrun simctl io <device> screenshot`) ou no iPhone.

### 7.3 Privacidade do app ("rótulo nutricional")
Em **Privacidade do app**, declare **tudo** que o app e os SDKs coletam. Para o Persona Fit,
provavelmente:

| Tipo | Por quê | Vinculado ao usuário? |
|---|---|---|
| Nome, e-mail | conta | Sim |
| ID do usuário | conta/Supabase/RevenueCat | Sim |
| Fotos | análise de refeição | Sim |
| Saúde e condicionamento físico | peso, medidas, treinos, dieta | Sim |
| Compras | RevenueCat | Sim |
| Outro conteúdo do usuário | registros, chat | Sim |
| Interação com o produto / Dados de falhas | analytics, Sentry | conforme o SDK |

Nenhum é "rastreamento" se você não cruza dados com outros apps para anúncio. **Política de
privacidade** pública obrigatória (o app já tem: `apppersonafit.vercel.app/legal/privacidade`).
Lição DOD: a declaração estava 3 anos desatualizada — revise quando adicionar SDK novo.

### 7.4 Classificação etária
- **Informações do app → Classificação etária → Editar.** Responda com sinceridade. A Apple acrescenta perguntas novas de tempos em tempos — em 2026 apareceu a de **caixas de itens (loot boxes)**, e enquanto não respondida aparecia um **aviso amarelo** que pode bloquear o envio.
- Para Persona Fit, atenção a: **informações médicas/de saúde** (marque o que se aplica), conteúdo gerado por usuário (se houver chat/comunidade), e **acesso irrestrito à web** (Não, salvo se tiver navegador embutido).
- Existe a opção de **forçar uma classificação maior** ("Substituir por uma classificação etária mais alta") — no DOD estava em +18 por um ajuste antigo. Use só se seus termos exigirem idade mínima.

### 7.5 Preços e disponibilidade
- App gratuito (a receita vem da assinatura).
- **Países:** desmarque a **UE** se não quiser expor dados de comerciante (§2.3).
- Opção "Apps para iPhone e iPad em Macs com Apple Silicon": pode deixar ativa (o app roda em Mac M1+), mas desative se não for testar.

### 7.6 Informações para a revisão (o ponto que mais recusa)
- **Login necessário:** marque e **forneça uma conta de teste que funcione**, com a **assinatura premium ativa** e conteúdo de exemplo (o revisor precisa ver o app funcionando, não telas vazias).
- ⚠️ **Lição DOD (recusa real):** a conta de revisão estava com o **premium vencido desde 2022**. O revisor logava e não via nada → recusa por "App incompleto" (2.1). **Logue com a conta de revisão um dia antes de enviar e confira o premium.**
- **Notas** (em inglês): passo a passo do login (inclusive o Google/Apple), onde fica a assinatura, como excluir a conta, o que a IA faz. Exemplo:
  > Sign in with the demo account above (email + password). The account has an active Premium subscription. To analyze a meal, tap "+" and take or choose a photo; the image is sent to our AI provider after the user consents. In-app purchases are in Profile > Premium (sandbox). Account deletion: Profile > Danger zone > Delete account.
- Contato (nome, telefone, e-mail) que **atenda** se a Apple ligar.

### 7.7 Lançamento
- **"Lançar esta versão manualmente"** na primeira vez: você aprova e escolhe a hora.
- **Liberação em etapas (7 dias)** só se aplica a **atualizações** (não à primeira versão).

---

## 8. Enviar para revisão
1. Página da versão → **Adicionar compilação** → escolha o build.
2. Selecione os **produtos de assinatura** (§3.3).
3. **Salvar → Adicionar para revisão → Enviar para revisão.**
4. Status: **Aguardando revisão → Em revisão → Pronto para distribuição** (aprovado) ou **Rejeitado**.

### 8.1 Se recusar (vai acontecer pelo menos uma vez — normal)
1. Leia a mensagem em **Revisão de apps → envio → Mensagens**. Ela cita a diretriz (ex.: *2.1(a)*), o **aparelho e a versão do iOS** usados.
2. **Reproduza no mesmo aparelho/iOS.** Se não tiver o aparelho, use o Simulador com o runtime do iOS da revisão (`xcodebuild -downloadPlatform iOS`) e um build da EAS para simulador (perfil com `"ios": { "simulator": true }`).
3. Corrija. Se for só **dado/conta/texto da loja**, não precisa de build novo. Se for código, build novo (o número sobe sozinho).
4. **Responda** em "Responda à equipe de revisão de apps" explicando o que foi feito.
5. Na versão: troque a compilação (se houver nova) → **Atualizar revisão** → **Reenviar para Revisão do app**.
- ⚠️ **Não clique no ⊖ vermelho** ao lado do item na tela do envio: ele **remove a versão do envio**.
- Discordou? Dá para recorrer ao **App Review Board**, mas quase sempre é mais rápido ajustar.

---

## 9. Depois de aprovado
1. **Lançar esta versão** (se manual). Leva até 24 h para aparecer em todos os países.
2. **Monitore o Sentry todos os dias na primeira semana** (crashes, erros de login e de compra). Complementos: App Store Connect → TestFlight → Falhas; Xcode → Organizer → Crashes.
3. **Atualizações só de JS** → `eas update` (OTA), sem passar pela loja. **Sempre** com o ambiente de produção (`--environment production`): sem o flag, o CLI empacota o `.env` local e publica em produção (incidente real no DOD Cast).
4. Mudança nativa (plugin, permissão, SDK) → build novo + revisão.
5. A Apple pode revisar **atualizações OTA que mudem a natureza do app** — use OTA para correções, não para features grandes escondidas da revisão.

---

## 10. Checklist final antes do primeiro envio

**Conta e contratos**
- [ ] Apple Developer ativo (renovação automática ligada)
- [ ] Contrato de Apps Pagos **Ativo** (impostos W-8BEN + banco validados)
- [ ] Small Business Program solicitado
- [ ] Decisão sobre UE/DSA tomada

**Projeto**
- [ ] `ios.bundleIdentifier` definitivo e **`supportsTablet` decidido** (§11.1)
- [ ] `usesNonExemptEncryption: false`, `UIViewControllerBasedStatusBarAppearance: false`
- [ ] Sign in with Apple implementado (por causa do Google)
- [ ] Google Sign-In com Client ID **iOS** + `iosUrlScheme`
- [ ] RevenueCat com chave **iOS** + produtos da Apple ligados às entitlements
- [ ] Paywall com preço, período, Termos, Privacidade e Restaurar compras
- [ ] Consentimento antes de enviar dados para IA
- [ ] Excluir conta funcionando
- [ ] Chave APNs configurada na EAS (§4.5) e push testado no iPhone
- [ ] `eas.json` com `submit.production.ios.ascAppId` (ID do **app**)

**Loja**
- [ ] Assinaturas "Prontas para envio" e selecionadas na versão
- [ ] Capturas iPhone 6,9" (+ iPad 13" se tablet)
- [ ] Privacidade do app completa
- [ ] Classificação etária sem aviso amarelo
- [ ] **Conta de revisão testada no dia, com premium ativo**
- [ ] Notas de revisão explicando login, assinatura, IA e exclusão de conta
- [ ] Teste completo no iPhone pelo TestFlight (§6.1)

---

## 11. Desafios que já enfrentamos (e como evitar)

### 11.1 iPad: decisão sem volta (erro 90101)
Uma vez publicado com suporte a iPad, **a Apple não deixa remover** (*"This bundle does not support
one or more of the devices supported by the previous app version"*). O DOD Questões teve que
voltar a suportar iPad por causa disso.
- `supportsTablet: false` → só iPhone; no iPad roda "em modo iPhone". Menos trabalho, sem capturas de iPad.
- `supportsTablet: true` → exige capturas de iPad, layout decente em tela grande e **teste em iPad** (a revisão do DOD foi feita **num iPad**, mesmo sendo app de celular).
- O Persona Fit usa `orientation: 'default'` (destravado pela Play). Se ligar o iPad, teste paisagem.
- **Decisão para o Persona Fit (2026-10-18): começar só com iPhone (`supportsTablet: false`).**
  - **Adicionar** iPad depois é permitido a qualquer momento (só **remover** que não é).
  - App só de iPhone **continua aparecendo para quem procura no iPad** e roda ampliado, em modo
    compatibilidade. A Apple **pode revisar nesse modo** (diretriz 2.4.1): o app precisa abrir e
    funcionar no iPad mesmo assim, só não precisa de layout próprio.
  - Teste rápido antes do envio: rodar o build no Simulador de um iPad e conferir que abre,
    loga e não corta nada essencial.

### 11.2 App fecha ao abrir (StatusBar)
`UIViewControllerBasedStatusBarAppearance: true` + `<StatusBar>` do RN = app fecha no iOS.
Use `false`.

### 11.3 Build "Expired"
Arquivo do build some da EAS em 30 dias. Envie logo.

### 11.4 Conta de revisão quebrada
Premium vencido → revisor não vê conteúdo → recusa 2.1. Teste a conta no dia do envio.

### 11.5 "Teclado não apareceu" / login não abre
A revisão do DOD relatou que o teclado do login não apareceu (iPadOS 27). Não reproduzimos, mas
adicionamos um **plano B**: se a tela de login do sistema não abrir, abrir no navegador e mandar
o erro ao Sentry. Vale para qualquer login via navegador (OAuth). Teste o login no **mesmo
aparelho/iOS** da revisão (§8.1).

### 11.6 ID errado no `ascAppId`
Número do canto da tela = ID da equipe. Use o da URL do app.

### 11.7 Conta Individual: só o Titular acessa chaves
Na conta Individual, usuários convidados **não acessam** Certificates/Keys. No Persona Fit você é o
Titular — sem esse bloqueio. Só não convide alguém esperando que ele resolva certificados.

### 11.8 Texto que manda pagar fora da Apple
Qualquer "assine/renove pelo site" é risco (3.1.1/3.1.3). Mantenha a compra **só pela loja**.

### 11.9 Privacidade e classificação desatualizadas
Perguntas novas (loot boxes) e SDKs novos exigem revisar **Privacidade do app** e
**Classificação etária** antes de cada versão importante.

### 11.10 Mac / Xcode local (se um dia buildar no Mac)
- `git` para de funcionar após atualizar o Xcode → `sudo xcodebuild -license accept`.
- Xcode novo pode tornar **erro** o alvo mínimo antigo de bibliotecas (pods abaixo do iOS 15) e exigir patches no `Podfile`.
- O Xcode 27 instalado aqui veio **sem a janela do Simulador**; contornamos com `xcrun simctl` + Maestro.
- **Recomendação:** use **só a EAS** para builds de loja. Mac local só para depurar.

### 11.11 OTA de produção sem o ambiente certo
`eas update` sem `--environment production` publicou o `.env` local em produção no DOD Cast →
tela "Configuração inválida" para todos. Use sempre o ambiente de produção.

---

## 12. Comandos de referência
```bash
npx eas-cli whoami
npx eas-cli build  -p ios --profile production          # build de loja
npx eas-cli submit -p ios --profile production --latest # envio ao App Store Connect
npx eas-cli credentials -p ios                          # ver/gerir certificados, push, API key
npx eas-cli build:version:set -p ios                    # ajustar build number (raro)
npx eas-cli update --branch production --environment production --message "..."  # OTA
```

---

## 13. Links oficiais
- Inscrição no programa: https://developer.apple.com/programs/enroll/
- Suporte de inscrição: https://developer.apple.com/support/enrollment/
- Diretrizes de revisão: https://developer.apple.com/app-store/review/guidelines/
- Requisitos de SDK (Xcode 26 desde 28/04/2026): https://developer.apple.com/news/upcoming-requirements/
- Small Business Program: https://developer.apple.com/app-store/small-business-program/
- Impostos (App Store Connect): https://developer.apple.com/help/app-store-connect/provide-tax-information/tax-forms-overview
- Contato Apple Developer: https://developer.apple.com/contact/
- Expo — Sign in with Apple: https://docs.expo.dev/versions/latest/sdk/apple-authentication/
- Expo — Submit iOS: https://docs.expo.dev/submit/ios/
- RevenueCat — App Store Connect: https://www.revenuecat.com/docs/getting-started/entitlements
- Guia de recusas (RevenueCat): https://www.revenuecat.com/blog/growth/the-ultimate-guide-to-app-store-rejections/

**Fontes usadas na pesquisa (out/2026):** Apple Developer (enrollment, upcoming requirements, tax
forms, forums sobre W-8BEN), Expo blog (*App Store Connect minimum SDK 26*), RevenueCat
(*ultimate guide to App Store rejections*), reportagens sobre a exigência de status de
comerciante da UE (TechRepublic, SD Times), além da experiência direta com o DOD Questões.
