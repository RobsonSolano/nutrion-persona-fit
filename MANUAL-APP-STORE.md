# Manual — Publicar o Persona Fit na App Store (primeira vez)

> Do zero até o app no ar: conta de desenvolvedor Apple (US$ 99/ano), acessos, configuração do
> projeto Expo/EAS, TestFlight, página da loja (com todos os formatos de imagem e vídeo), revisão e
> lançamento. Escrito a partir das publicações reais do **DOD Questões** e do **DOD Estudos**
> (out/2026), com tudo o que deu errado lá, mais o que costuma derrubar apps parecidos com o
> Persona Fit (login Google, assinaturas, câmera, IA, saúde, notificações).
>
> **Escrito em:** 2026-10-18 · **Atualizado em:** 2026-11-03 (especificações e links conferidos nas
> páginas oficiais da Apple nesta data). As regras mudam: antes de cada etapa, confira o link
> oficial indicado na própria seção e o §16.

---

## 0. Visão geral

### 0.1 Etapas e prazos realistas

| Etapa | Tempo típico | Quem |
|---|---|---|
| 1. Conta Apple Developer (inscrição + pagamento + aprovação) | de algumas horas a 2 dias (pessoa física) | você |
| 2. Contratos, impostos e banco (obrigatório para vender assinatura) | 1 a 3 dias (validação da Apple) | você |
| 3. Criar o app no App Store Connect + informações do app + assinaturas | 1 a 2 h | você |
| 4. Ajustar o projeto para iOS (Sign in with Apple, RevenueCat iOS, push, ícone, etc.) | 1 a 3 dias de código | você |
| 5. Credenciais + build na EAS + envio ao App Store Connect | 30 a 60 min | EAS |
| 6. TestFlight + teste em iPhone real | 1 dia | você |
| 7. Página da loja (textos, capturas, privacidade, classificação etária) | 2 a 4 h | você |
| 8. Revisão da Apple | 24 a 48 h (cada rodada) | Apple |
| 9. Lançamento | imediato ou agendado | você |

**Comece pela conta e pelos contratos (§2 e §3) já:** são as etapas com espera, e sem o contrato
pago assinado **as assinaturas não aparecem nem no TestFlight**.

### 0.2 Situação do Persona Fit hoje (conferido em 2026-11-03, branch `develop`)

| Item | Situação |
|---|---|
| Seção `ios` no `app.config.ts` (bundle id, tablet, criptografia) | ❌ não existe (§7.1) |
| Ícone `assets/icon.png` 1024×1024 | ⚠️ tem canal alfa (transparência) — a Apple recusa no iOS (§7.2) |
| Sign in with Apple | ❌ não existe (§7.3) |
| Google Sign-In no iOS (Client ID iOS + `iosUrlScheme`) | ❌ plugin sem configuração iOS (§7.3) |
| RevenueCat no iOS | ❌ `billing.ts` só lê `EXPO_PUBLIC_RC_API_KEY_ANDROID` (§7.5) |
| Push (`expo-notifications`) | ✅ instalado · ❌ falta chave APNs na EAS (§7.6) |
| Exclusão de conta no app | ✅ `DangerZone` → "Excluir conta" (§7.4) |
| Política de privacidade / Termos | ✅ `apppersonafit.vercel.app/legal/privacidade` e `/legal/termos-de-uso` |
| `submit.production.ios.ascAppId` no `eas.json` | ❌ falta (só depois de criar o app, §4.2) |
| `appVersionSource: remote` + `autoIncrement` | ✅ já configurado |

---

## 1. Acessos: quem pode o quê, e onde fica cada coisa

### 1.1 Você será o Titular (Account Holder)
Na conta **Individual**, quem se inscreve é o **Titular** e tem acesso a **tudo**: App Store
Connect, Certificates/Identifiers/Profiles/Keys no developer.apple.com, contratos, impostos, banco
e API do App Store Connect. Nenhuma das travas que tivemos no DOD (conta de outra pessoa) se aplica.

> **Lição DOD:** lá a conta Individual era de outra pessoa. Usuários convidados viam
> *"Access Unavailable"* em Certificates/Keys, e uma chave de API com papel **Developer** não
> conseguiu criar o certificado de distribuição (erro 403 da Apple). Só destravou com uma chave
> **Admin** gerada pela pessoa com acesso à conta.

### 1.2 Se um dia convidar alguém
Em conta **Individual**, quem você convida no App Store Connect **só acessa o App Store Connect**:
não entra no time do Apple Developer Program e **nunca** acessa Certificates/Identifiers/Keys
(isso só existe para contas de Organização). Resumo dos papéis
([tabela oficial](https://developer.apple.com/help/app-store-connect/reference/account-management/role-permissions)):

| O que | Titular | Admin | App Manager | Developer | Marketing |
|---|---|---|---|---|---|
| Aceitar contratos, renovar anuidade, **ativar a API do App Store Connect** (1ª vez) | ✅ só ele | — | — | — | — |
| Certificados, Bundle IDs, perfis, chaves APNs (developer.apple.com) | ✅ | só em conta Organização | — | — | — |
| Gerar chaves de API do App Store Connect | ✅ | ✅ | — | — | — |
| Usuários e acessos, testadores sandbox | ✅ | ✅ | sandbox ✅ | — | — |
| Criar app, preço, página da loja, enviar para revisão | ✅ | ✅ | ✅ | — | página ✅ |
| Subir build, TestFlight | ✅ | ✅ | ✅ | ✅ | — |

**Papel da chave de API usada pela EAS:** para **criar certificados/perfis** precisa ser
**Admin**; para só **enviar builds** (submit) basta **App Manager**. Como Titular, use **Admin**.

### 1.3 Links diretos (com você logado)

**App Store Connect** — https://appstoreconnect.apple.com
| O que | Onde |
|---|---|
| Apps (criar app, versões, TestFlight) | https://appstoreconnect.apple.com/apps |
| Contratos, impostos e banco | **Negócios** (Business): https://appstoreconnect.apple.com/business |
| Usuários e acessos | https://appstoreconnect.apple.com/access/users |
| Testadores sandbox (compras de teste) | **Usuários e acesso → Sandbox** |
| Chaves de API (Integrações) | **Usuários e acesso → Integrações → App Store Connect API** |
| Small Business Program (15%) | https://developer.apple.com/app-store/small-business-program/ |

**Apple Developer** — https://developer.apple.com/account
| O que | Onde |
|---|---|
| Team ID e dados da inscrição | https://developer.apple.com/account → *Membership details* |
| Certificados | https://developer.apple.com/account/resources/certificates/list |
| Identifiers (Bundle IDs + capabilities) | https://developer.apple.com/account/resources/identifiers/list |
| Perfis de provisionamento | https://developer.apple.com/account/resources/profiles/list |
| Chaves (APNs, Sign in with Apple) | https://developer.apple.com/account/resources/authkeys/list |

**Expo (EAS)** — projeto `nutrion` (`projectId 6aed6bd3-…`)
| O que | Onde |
|---|---|
| Credenciais iOS (certificado, perfil, push, chave de API) | expo.dev → projeto → **Credentials → iOS → `<bundle id>`** |
| Variáveis de ambiente (`production`) | expo.dev → projeto → **Environment variables** |
| Builds e envios | expo.dev → projeto → **Builds** / **Submissions** |

> Os caminhos do App Store Connect mudam de vez em quando. Se um link direto não abrir, entre pela
> página inicial e siga o nome da seção (em negrito).

---

## 2. Conta de desenvolvedor Apple (Apple Developer Program)

### 2.1 Pessoa física ou organização?
| | **Individual (pessoa física)** | **Organização** |
|---|---|---|
| Nome que aparece na loja como vendedor | **seu nome legal** ("Robson Solano") | nome da empresa |
| Exige | Apple ID com 2FA, documento com foto | **número D-U-N-S** (gratuito, 1 a 2 semanas), CNPJ, site, poder legal de assinatura |
| Acesso de outras pessoas | convidados só no App Store Connect (§1.2) | vários Admins com acesso completo |

Como o Persona Fit é seu e você mesmo vai operar, **Individual resolve**. Migrar de Individual para
Organização depois é possível, mas dá trabalho — decida antes se o nome do vendedor importa.

### 2.2 Antes de se inscrever
- **Apple ID com autenticação de dois fatores** ativa (o Apple ID que vai ser o "dono" do app para sempre).
- **Nome legal** no Apple ID (nome e sobrenome reais). Apelido ou nome de empresa atrasa a aprovação.
- **Endereço real** (caixa postal não é aceita), telefone e e-mail válidos.
- Maioridade legal e documento oficial com foto (RG/CNH/passaporte) à mão.

### 2.3 Inscrição e pagamento (US$ 99 por ano)
**Caminho mais rápido para pessoa física: o app "Apple Developer" no iPhone.**
1. Instale o app **Apple Developer** (App Store) no iPhone e entre com o Apple ID.
2. **Conta → Inscrever-se agora** (Enroll Now): dados pessoais → verificação de identidade (foto do documento) → aceite dos termos.
3. Pague a anuidade **no próprio app** (cobrança na forma de pagamento do Apple ID, em moeda local).
   Inscrito pelo app, a anuidade **renova sozinha** como assinatura.
4. Alternativa: pelo site https://developer.apple.com/programs/enroll/ (cartão).

**Depois de pagar:** chega e-mail de confirmação. Pessoa física costuma liberar no mesmo dia ou em
até 48 h. Passou de 2 dias úteis → https://developer.apple.com/contact/ (*Membership and Account*).

**Dificuldades comuns na inscrição:**
- **"Unable to verify identity"** → nome do Apple ID diferente do documento. Corrija e tente de novo.
- **Pagamento recusado** → cartão sem compras internacionais; tente outro cartão ou o app no iPhone.
- **Inscrição "pendente" por dias** → a Apple às vezes liga ou pede documento. Responda rápido.
- **Renovação anual:** se vencer, **o app sai da loja**. Deixe a renovação automática ligada.

### 2.4 Primeiro acesso
- https://developer.apple.com/account → *Membership details* → anote o **Team ID** (10 caracteres).
- https://appstoreconnect.apple.com → aceite os termos que aparecerem no topo (faixa amarela).
  **Enquanto houver contrato/termo pendente, a Apple bloqueia envios de todos os apps da conta**
  (aconteceu no DOD: nada subia até o Titular aceitar o contrato atualizado).

> ⚠️ **Pegadinha do DOD Questões:** o número no **canto superior direito** do App Store Connect, ao
> lado do seu nome, **não é o ID do app nem o Team ID** (ver §8.3).

---

## 3. Contratos, impostos e dados bancários (obrigatório para assinaturas)

O Persona Fit vende assinatura (RevenueCat). Na Apple isso exige o **Contrato de Apps Pagos**
(*Paid Apps Agreement*) ativo. Sem ele os produtos de assinatura **não carregam** (nem no
TestFlight, nem na revisão) — a revisão recusa porque "a compra não funciona" — e você não recebe.

### 3.1 Passo a passo
1. **App Store Connect → Negócios** (https://appstoreconnect.apple.com/business).
2. **Contrato de Apps Pagos → Visualizar e aceitar**. Só o Titular aceita.
3. **Impostos → Adicionar informações fiscais**
   ([ajuda oficial](https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information)):
   - Você **não é** pessoa dos EUA → formulário **W-8BEN** (pessoa física estrangeira).
   - Nome, país (Brasil), endereço, **CPF** como *Foreign TIN*.
   - Se aparecer só o **W-9** (formulário de americano), **não preencha**: abra contato em https://developer.apple.com/contact/ → *Tax Setup*.
   - Podem aparecer páginas de impostos de outros países; para pessoa física no Brasil, em geral basta o W-8BEN, mas siga o que a tela pedir.
4. **Banco → Adicionar conta bancária**, em nome do **mesmo titular** da conta Apple. Banco brasileiro funciona (SWIFT, agência, conta). O pagamento chega em reais.
5. O contrato fica **"Ativo"** só depois de **impostos + banco validados** (alguns dias).

### 3.2 Small Business Program (comissão de 15% em vez de 30%)
- Quem fatura menos de US$ 1 milhão/ano paga **15%** — **mas só depois de se inscrever**:
  https://developer.apple.com/app-store/small-business-program/
- Faça logo após o contrato ficar ativo (vale a partir da aprovação, não é retroativo).

### 3.3 Status de comerciante na UE (DSA)
- Para distribuir na **União Europeia** é obrigatório declarar se você é **comerciante (trader)**
  ([ajuda oficial](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements)).
  Comerciante tem **endereço, telefone e e-mail públicos** na página do app nos países da UE.
- App que cobra assinatura normalmente é "comerciante". **Se não quiser expor seus dados**, a saída
  mais simples é **não distribuir na UE** (§10.6).
- Sem a declaração, a Apple não aceita o app na loja da UE.

---

## 4. Criar o app no App Store Connect

### 4.1 Bundle ID
Escolha o **definitivo** (não muda nunca depois de publicar). Sugestão: igual ao Android,
`br.com.nutrion`. A EAS registra o Bundle ID e as *capabilities* sozinha no primeiro build (§8.4).
Se preferir à mão: [Identifiers](https://developer.apple.com/account/resources/identifiers/list)
→ **"+" → App IDs → App** → *Explicit* `br.com.nutrion` → marque **Push Notifications**,
**Sign in with Apple** (In-App Purchase já vem ligado).

### 4.2 Criar o registro do app
1. https://appstoreconnect.apple.com/apps → **"+" → Novo app**.
2. Plataforma **iOS** · Nome **Persona Fit** (2 a 30 caracteres, precisa estar livre na loja inteira) ·
   Idioma principal **Português (Brasil)** · Bundle ID · **SKU** (código interno, ex.: `personafit-ios`;
   letras, números, `-`, `.`, `_`, sem começar com símbolo; não muda depois) · Acesso de usuários: **Acesso total**.
3. Copie o **Apple ID do app** (o `ascAppId`): está na **URL**
   (`appstoreconnect.apple.com/apps/`**`1234567890`**`/...`) ou em *Informações do app → Apple ID*.

### 4.3 Informações do app (menu lateral → Geral → Informações do app)
Vale para todas as versões. Preencha tudo antes do primeiro envio:

| Campo | O que colocar |
|---|---|
| Nome / Subtítulo | Nome até 30 caracteres; subtítulo até 30 (ex.: "Dieta e treino com IA") |
| Categoria | Principal **Saúde e fitness**; secundária opcional (ex.: Estilo de vida) |
| Direitos de conteúdo | "Não contém, mostra ou acessa conteúdo de terceiros" — a menos que use conteúdo licenciado |
| Classificação etária | Questionário (§10.4) |
| URL da política de privacidade | `https://apppersonafit.vercel.app/legal/privacidade` (em **Privacidade do app**) |
| Contrato de licença (EULA) | Padrão da Apple, ou personalizado com os Termos (§7.5) |
| Bens e serviços digitais (*Digital Goods and Services*) | Se o questionário aparecer: responda que há assinatura vendida **por compra dentro do app** ([ajuda](https://developer.apple.com/help/app-store-connect/manage-app-information/complete-the-digital-goods-and-services-questionnaire)) |
| Dispositivo médico regulamentado | **Não** — o app não é dispositivo médico ([ajuda](https://developer.apple.com/help/app-store-connect/manage-app-information/declare-regulated-medical-device-status)) |
| Rótulos de acessibilidade (*Accessibility Nutrition Labels*) | Opcional; declare só o que testou de verdade (VoiceOver, texto maior, modo escuro…) ([ajuda](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels)) |

---

## 5. Produtos de assinatura (para o RevenueCat)
1. **App → Monetização → Assinaturas → "+" Grupo de assinaturas** (ex.: "Persona Fit Premium").
   O nome de exibição do grupo não aceita emoji nem caracteres especiais.
2. Crie cada plano (mensal, anual…) com **ID do produto** (ex.: `personafit_premium_mensal`) —
   **o ID nunca pode ser reutilizado**, mesmo apagando o produto. Use os IDs que o RevenueCat espera.
3. Em cada produto: duração, preço (faixa), **nome e descrição de exibição** (pt-BR) e, em
   **Informações para revisão**:
   - **captura de tela da tela de compra** (o paywall rodando). Se der *"tamanho incorreto"*, há
     relatos de que **640×920 px** é aceito ([fórum Apple](https://developer.apple.com/forums/thread/813399));
   - **nota de revisão** curta (onde fica o paywall).
4. Status **"Pronto para envio"**. **Na primeira versão, os produtos vão junto com o app:** na
   página da versão, seção *Compras dentro do app e assinaturas*, **selecione os produtos**.
   Esquecer = assinatura não funciona na revisão = recusa.

---

## 6. Ícone, capturas e vídeos — formatos exatos

> Conferido em 2026-11-03 em
> [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
> e [App preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications).
> A Apple trocou os nomes em polegadas por "tela grande/média" — abaixo estão os dois.

### 6.1 Ícone do app
- **Não se envia ícone no App Store Connect.** Ele vem **de dentro da build**: no Expo, do
  `icon` / `ios.icon` do `app.config.ts`
  ([ajuda oficial](https://developer.apple.com/help/app-store-connect/manage-app-information/add-an-app-icon)).
- Enquanto a versão não tem build associada, a página mostra um **ícone cinza genérico** — é
  normal. Ele aparece ao **associar a build** (§11). Trocar o ícone depois = nova versão + revisão.
- Formato: **PNG 1024×1024, quadrado, sem transparência/canal alfa**, sem cantos arredondados
  (o sistema arredonda). Guia de design: [HIG — App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons).
- Opcional: ícone em camadas (efeito *Liquid Glass* do iOS 26) feito no **Icon Composer** e
  apontado em `ios.icon` (arquivo `.icon`). O PNG simples continua aceito.

### 6.2 Capturas de tela (obrigatórias)
Formatos **.png, .jpg ou .jpeg**, **sem transparência**, **1 a 10 por tamanho**, retrato ou
paisagem. Se a interface é igual em todos os tamanhos, mande só o **maior** de cada grupo e a Apple
reduz para os menores.

| Grupo (nome atual na Apple) | Aparelhos (simulador sugerido) | Retrato (px) | Obrigatório? |
|---|---|---|---|
| **iPhone com Dynamic Island — tela média** (~6,3") | iPhone 17 / 17 Pro, 16, 15 | **1206×2622** ou 1179×2556 | ✅ **Sim, sempre** (mín. 1) |
| iPhone com Dynamic Island — tela grande (~6,9") | iPhone 17 Pro Max, 16 Pro Max, Air | **1320×2868**, 1290×2796 ou 1260×2736 | Recomendado (senão usa reduzida) |
| iPhone com Face ID — tela grande (6,5") | iPhone 11 Pro Max, XS Max | 1284×2778 ou 1242×2688 | Só se não enviar a "tela grande" acima |
| iPhone com Face ID — tela média | iPhone 16e, 14, 13 | 1170×2532, 1125×2436, 1080×2340 | Não |
| iPhone com botão Home (5,5" / 4,7") | iPhone 8 Plus / SE | 1242×2208 / 750×1334 | Não |
| **iPad 13"** | iPad Pro 13" (M5/M4), iPad Air 13" | **2064×2752** ou 2048×2732 | ✅ **Só se o app rodar em iPad** (`supportsTablet: true`) |
| iPad 11" / 12,9" / 10,5" / 9,7" | — | vários | Não (reduzidas do 13") |
| iPhone Duo (dobrável) | — | externa 1398×2034 · interna 2007×2853 | Não hoje; **obrigatório a partir de abr/2027** para apps compilados com SDK iOS 27.1+ |

**Recomendação para o Persona Fit (só iPhone):** 4 a 6 capturas em **1320×2868** (iPhone 17 Pro
Max) **e** as mesmas em **1206×2622** (iPhone 17 Pro). Paisagem: troque largura × altura.

**Como gerar:** Simulador do Xcode com o aparelho certo → `xcrun simctl io booted screenshot tela.png`
(sai no tamanho exato), ou print no iPhone real do mesmo tamanho. Podem ter moldura e texto de
marketing, mas **precisam mostrar o app de verdade** (nada de tela que não existe — diretriz 2.3.3).

### 6.3 Vídeos de prévia (*App Preview*, opcionais)
| Item | Especificação |
|---|---|
| Quantidade | até **3 por tamanho de tela e idioma** |
| Duração | **15 a 30 s** |
| Arquivo | **.mov, .m4v ou .mp4** (H.264) ou .mov (ProRes 422 HQ) · **até 500 MB** |
| Vídeo | H.264 10–12 Mbps · **máx. 30 fps** · progressivo |
| Áudio | estéreo AAC 256 kbps, 44,1 ou 48 kHz (trilhas todas habilitadas) |
| Resolução iPhone (todas as telas com notch/Dynamic Island) | **886×1920** retrato · 1920×886 paisagem |
| Resolução iPhone com botão Home (5,5") | 1080×1920 retrato |
| Resolução iPad 13" / 12,9" | **1200×1600** retrato · 1600×1200 paisagem |
| Capa (*poster frame*) | padrão no segundo 5; dá para escolher |
| Processamento | até 24 h depois do envio |

Os vídeos aparecem **antes** das capturas. Gravação: `xcrun simctl io booted recordVideo prev.mov`
ou gravação de tela do iPhone, depois ajuste no iMovie/Final Cut para a resolução da tabela.

---

## 7. Ajustar o projeto para iOS (o que muda no código)

> Rodar o app no iOS **não é só buildar**: o Persona Fit tem vários pontos que a Apple trata de
> forma diferente do Google.

### 7.1 `app.config.ts` — seção `ios`
```ts
ios: {
  bundleIdentifier: 'br.com.nutrion',
  // ⚠️ Decisão PERMANENTE (ver §14.1). false = só iPhone (roda no iPad em modo compatibilidade).
  supportsTablet: false,
  icon: './assets/icon-ios.png', // 1024×1024 SEM transparência (ver §7.2)
  config: { usesNonExemptEncryption: false }, // pula o questionário de criptografia do TestFlight
  infoPlist: {
    // O <StatusBar> do RN usa a API global; com true o app pode fechar ao abrir (lição DOD).
    UIViewControllerBasedStatusBarAppearance: false,
    CFBundleDevelopmentRegion: 'pt-BR',
    CFBundleLocalizations: ['pt-BR'],
  },
  usesAppleSignIn: true, // ver §7.3
},
```
- As frases de permissão de **câmera e fotos** já estão no plugin `expo-image-picker` e explicam o
  motivo — **mantenha assim**. A Apple recusa frase genérica ("precisamos da câmera") (5.1.1).
- `userInterfaceStyle: 'dark'` está ok.

### 7.2 Ícone sem transparência
`assets/icon.png` tem **canal alfa**. No Android não importa; no iOS o envio é recusado
(*"The large app icon … can't be transparent or contain an alpha channel"*). Gere uma cópia
achatada sobre o fundo preto e aponte em `ios.icon`:
```bash
# macOS, sem instalar nada: JPEG não tem alfa; depois volta para PNG
sips -s format jpeg assets/icon.png --out /tmp/icon.jpg && \
sips -s format png /tmp/icon.jpg --out assets/icon-ios.png
sips -g hasAlpha assets/icon-ios.png   # deve mostrar: hasAlpha: no
```
(Se partes do ícone forem transparentes, confira o resultado: o fundo vira a cor da área
transparente. Melhor exportar do arquivo de design com fundo preto `#000000`.)

### 7.3 Login: Sign in with Apple + Google no iOS (diretriz 4.8)
- **Regra:** app que usa login de terceiro (Google) para a conta principal precisa oferecer
  **também** uma opção equivalente que só peça nome/e-mail, permita **esconder o e-mail** e não
  rastreie para anúncio. Na prática: **Sign in with Apple**. A isenção vale só para app que usa
  **exclusivamente** login próprio — com Google presente, inclua Apple.
- **Sign in with Apple (Expo + Supabase):**
  - `npx expo install expo-apple-authentication` e `usesAppleSignIn: true` no `ios`
    ([doc Expo](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)).
  - Botão oficial `AppleAuthenticationButton`, **no mínimo do mesmo tamanho/destaque do Google**.
  - Supabase: habilitar o provider **Apple** (Client ID = bundle id `br.com.nutrion`) e usar
    `signInWithIdToken({ provider: 'apple', token })`
    ([doc Supabase](https://supabase.com/docs/guides/auth/social-login/auth-apple)).
  - O e-mail pode vir como `xxxx@privaterelay.appleid.com` — o backend precisa aceitar.
  - O **nome só vem no primeiro login** — salve na hora.
- **Google no iOS:** criar um **Client ID do tipo iOS** no Google Cloud (bundle `br.com.nutrion`) e
  passar o **`iosUrlScheme`** (Client ID invertido, `com.googleusercontent.apps.…`) no plugin:
  ```ts
  ['@react-native-google-signin/google-signin', { iosUrlScheme: 'com.googleusercontent.apps.XXXX' }]
  ```
  ([doc](https://react-native-google-signin.github.io/docs/setting-up/expo)). Sem isso o login
  Google fecha ou falha só no iPhone.

### 7.4 Exclusão de conta (diretriz 5.1.1(v)) — ✅ já existe
App que permite **criar conta** precisa permitir **excluir a conta dentro do app**. O Persona Fit já
tem (`DangerZone` → "Excluir conta"). Confirme que exclui de verdade e cite o caminho nas notas de
revisão. (No DOD Estudos, a falta desse botão era item obrigatório antes da loja pública.)

### 7.5 Assinaturas (RevenueCat) no iOS
- `src/services/billing.ts` usa só a chave Android. O iOS precisa da chave Apple (`appl_...`):
  ```ts
  const API_KEY = Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_RC_API_KEY_IOS
    : process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID;
  ```
  e cadastrar `EXPO_PUBLIC_RC_API_KEY_IOS` no ambiente **production** da EAS.
- No **RevenueCat**: adicionar o app iOS (bundle id), configurar a **In-App Purchase Key**
  ([doc](https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/in-app-purchase-key-configuration)),
  importar os produtos e ligá-los às mesmas *entitlements* do Android
  ([doc](https://www.revenuecat.com/docs/getting-started/entitlements)).
- **Tela de assinatura (3.1.2) — causa clássica de recusa:**
  - **preço, período e o que está incluso** visíveis antes de comprar;
  - teste grátis: **quanto dura e quanto cobra depois**;
  - links para **Termos de Uso (EULA)** e **Política de Privacidade** na própria tela;
  - botão **"Restaurar compras"** visível (`restorePurchases` já existe);
  - na página da loja: link dos Termos na descrição, ou EULA personalizado em *Informações do app*.
- **Nada de pagamento fora da Apple (3.1.1):** conteúdo digital só por compra dentro do app. Nenhum
  link/texto do tipo "assine pelo site" — no DOD, até botões "Conhecer/Renovar assinatura" que
  abriam o site viraram ajuste obrigatório.
- **Teste de compra:** **Usuários e acesso → Sandbox → Testadores** → conta sandbox. No TestFlight
  as compras já são sandbox (não cobram).

### 7.6 Notificações push no iOS (chave APNs)

**Como o push funciona hoje:** `src/services/pushNotifications.ts` gera o **Expo Push Token** e
salva em `profiles.expo_push_token`; as Edge Functions enviam pela API da Expo
(`supabase/functions/_shared/expoPush.ts`). A Expo entrega no Android pelo FCM e **no iOS pela
Apple (APNs)** — para isso precisa de uma **chave APNs da sua conta**. Sem ela, o token iOS até é
gerado, mas **nenhuma notificação chega no iPhone**. O backend não muda.

1. **Declarar** em `plugins`: `['expo-notifications', { mode: 'production' }]` (garante
   `aps-environment: production` na build de loja).
2. **Gerar a chave (a EAS faz):** no primeiro `eas build -p ios` responda **Yes** em *"set up Push
   Notifications"*, ou depois: `npx eas-cli credentials -p ios` → production → **Push
   Notifications → Set up / Generate a new key**.
3. **Ou à mão:** [Keys](https://developer.apple.com/account/resources/authkeys/list) → **"+"** →
   `APNs Persona Fit` → **Apple Push Notifications service (APNs)** → *Sandbox & Production*,
   *Team Scoped* → **Register** → **Download** do `.p8` (**só baixa uma vez**; guarde no cofre) →
   suba na EAS (**Add a new key**) com Key ID e Team ID. Máximo **2 chaves APNs por time**; uma
   serve para todos os seus apps.
4. **Conferir:** `npx eas-cli credentials -p ios` → production mostra **Push Key**, além de
   Distribution Certificate e Provisioning Profile.
5. **Testar no iPhone (TestFlight):** aceitar a permissão → conferir o token no Supabase
   (`ExponentPushToken[...]`) → enviar em https://expo.dev/notifications → testar app aberto,
   em segundo plano e fechado. Simulador não serve para validar push.
6. **Se não chegar:** `InvalidCredentials` → chave ausente/errada; `DeviceNotRegistered` → token
   velho; sem token → permissão negada (no iOS o pedido aparece **uma vez só**).

Boas práticas: peça a permissão **no momento certo** (ex.: ao ativar lembretes), com uma tela
explicando antes; **o app não pode exigir push para funcionar** (5.1.2); nada de propaganda por
push sem opt-in (4.5.4).

### 7.7 IA e dados de saúde (diretrizes 5.1.2(i) e 1.4.1)
- Texto atual da 5.1.2(i): *"You must clearly disclose where personal data will be shared with
  third parties, **including with third-party AI**, and obtain explicit permission before doing
  so."* O app manda **fotos de refeições e dados para IA de terceiros** → **tela de consentimento
  explícito antes do primeiro uso da IA**, dizendo qual dado vai e para quem, e o mesmo na Política
  de Privacidade.
- **Saúde/nutrição:** sem promessas médicas ("cura", "trata", "diagnóstico"); aviso de que não
  substitui nutricionista/médico. Orientação de saúde sem base vira "app médico" (1.4.1) e a
  revisão endurece.
- Chat de IA aberto: a Apple pode pedir mecanismo de denúncia/filtro de conteúdo impróprio.

### 7.8 Manifesto de privacidade
O iOS exige que app e SDKs declarem certas APIs (`PrivacyInfo.xcprivacy`). Expo SDK 54 e as
bibliotecas atuais já trazem. Se chegar e-mail de **"Missing API declaration"** depois do upload,
adicione em `ios.privacyManifests` o que o e-mail listar.

### 7.9 Requisitos mínimos de build (fonte: [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/))
- Desde **28/04/2026**: build com **Xcode 26+ (SDK iOS 26)**. A EAS já usa imagem compatível com o
  Expo 54 — **não force imagem antiga** no `eas.json`.
- Desde **09/09/2026**: o app precisa ter **alvo mínimo iOS 13+** (o Expo 54 já é 15.1+).
- ⚠️ **Lição DOD (Xcode 27):** com o **SDK do iOS 27**, app Expo/RN sem ciclo de vida *UIScene*
  **fecha ao abrir no iOS 27**. Quando a Apple exigir o SDK 27 (provavelmente abr/2027), atualize
  o Expo para uma versão com UIScene **antes** de buildar. Nessa mesma época entram as capturas de
  **iPhone Duo** obrigatórias para quem compilar com SDK 27.1+ (§6.2).

---

## 8. Credenciais, build e envio com a EAS

### 8.1 Conta da EAS
`npx eas-cli whoami` → precisa ser a conta **dona do projeto** (`projectId 6aed6bd3-…`). Com a
conta errada, tudo falha com *"Entity not authorized"* (lição DOD).

### 8.2 `eas.json` — envio do iOS
```jsonc
"submit": {
  "production": {
    "android": { "...": "como já está" },
    "ios": {
      "ascAppId": "1234567890"   // Apple ID do APP (§4.2), NÃO o número do canto da tela
    }
  }
}
```
O `ascAppId` não é segredo — pode commitar.

### 8.3 ⚠️ `ascAppId` errado = envio "ERRORED"
No DOD Questões usamos o número do topo do App Store Connect (ao lado do nome da conta). **É o ID
da equipe, não do app.** O `eas submit` terminou em **ERRORED**. O certo é o número da **URL do app**.

### 8.4 Primeiro build (credenciais)
```bash
npx eas-cli build -p ios --profile production
```
- Pede **login com o Apple ID** e oferece **gerar tudo**: Bundle ID + capabilities, **Distribution
  Certificate**, **Provisioning Profile**, chave de push. **Aceite que a EAS gere e guarde**
  ([doc](https://docs.expo.dev/app-signing/app-credentials/)).
- **Não gere certificados novos** se já existirem válidos. O limite é baixo (poucos certificados de
  distribuição por conta) e **revogar um certificado quebra as builds que dependem dele**.
- 15 a 30 min na nuvem. **Não precisa de Mac.** O build number sobe sozinho (`autoIncrement`).

### 8.5 Enviar ao App Store Connect (sem pedir login toda vez)
```bash
npx eas-cli submit -p ios --profile production --latest
```
Na primeira vez a EAS oferece **gerar uma chave de API do App Store Connect** — aceite (precisa
ser Titular/Admin). Depois, **confira o vínculo** (lição DOD Estudos):
- expo.dev → projeto → **Credentials → iOS → `br.com.nutrion`** → seção
  **"App Store Connect API Key for EAS Submit"** precisa mostrar a chave.
- Se estiver vazio, o `submit` cai em *"Only user authentication is supported"* e pede Apple ID
  toda vez. Resolva em **Add an App Store Connect API key** nessa mesma tela, escolhendo a chave
  que já está na conta.

Ou num comando só: `npx eas-cli build -p ios --profile production --auto-submit`.
- ⚠️ **O arquivo da build fica na EAS só 30 dias** (depois vira *Expired*). Envie logo.
- A Apple processa em 5 a 30 min e manda e-mail ("ready for testing" / "has completed processing").

---

## 9. TestFlight (teste antes da loja)

TestFlight instala **o mesmo binário que vai para a loja**, em iPhone real
([visão geral](https://developer.apple.com/help/app-store-connect/test-a-beta-version/overview-of-testflight)).
A build de teste vale **90 dias**.

### 9.1 Testadores internos (sem revisão, liberação imediata)
- Precisam ser **usuários do App Store Connect** com acesso ao app (você já é). Até 100 pessoas.
- Para incluir alguém: **Usuários e acesso → "+"** → e-mail, papel (ex.: *Developer* ou
  *Marketing*), acesso **só ao app Persona Fit** → a pessoa **aceita o convite por e-mail**.
- ⚠️ **Lição DOD Estudos:** na hora de adicionar ao grupo, **só aparecem quem já aceitou o
  convite**. Se alguém "sumiu" da lista, falta aceitar.
- **TestFlight → Testes internos → "+"** → grupo (ex.: "Equipe") → adicione as pessoas → a build
  entra automaticamente (se *distribuição automática* estiver ligada).

### 9.2 Testadores externos (qualquer e-mail ou link público, até 10 mil)
- **TestFlight → Testes externos → "+"** → grupo → adicione e-mails **ou** ative o **link público**.
- Antes do primeiro envio, preencha **Informações de teste**: descrição do app, e-mail de feedback,
  contato e **conta de login para o revisor** (marque *"Início de sessão obrigatório"*).
- A primeira build de cada versão passa pela **revisão beta** (até ~1 dia). **Não trava o teste
  interno**, que segue normal enquanto isso.
- Depois de aprovada, **adicione os testadores** no grupo (aprovação com 0 testadores não envia
  nada a ninguém — aconteceu no DOD Estudos).

### 9.3 Como o testador instala
1. Instala o app **TestFlight** (App Store) no iPhone.
2. Abre o convite por e-mail ou o link público → **Aceitar** → **Instalar**.
3. Preencha **"O que testar"** na build para orientar.

**O Simulador do Mac não substitui o TestFlight:** outro tipo de build, sem push, sem compras reais.

### 9.4 Roteiro mínimo (no iPhone, pelo TestFlight)
- [ ] Abre sem fechar sozinho (StatusBar, §7.1)
- [ ] Login por e-mail, **Google** e **Apple** — e volta para o app
- [ ] Fechar à força e reabrir → continua logado
- [ ] Câmera e galeria: pedido de permissão com o texto certo
- [ ] Análise de refeição por IA funciona, **com a tela de consentimento antes** (§7.7)
- [ ] **Paywall:** preços carregam, compra em **sandbox** conclui, "Restaurar compras" funciona
- [ ] Notificação: pedido de permissão + recebimento de push de teste
- [ ] Excluir conta funciona
- [ ] Ícone correto na tela inicial (sem fundo estranho, §7.2)
- [ ] (só iPhone) abre no Simulador de iPad em modo compatibilidade sem cortar nada essencial

---

## 10. Página da loja (Distribuição → versão iOS 1.0)

### 10.1 Textos e limites ([referência oficial](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information))
| Campo | Limite | Observação |
|---|---|---|
| Nome | 2 a 30 caracteres | em *Informações do app* |
| Subtítulo | 30 caracteres | idem |
| Texto promocional | 170 caracteres | aparece acima da descrição; **muda sem nova revisão** |
| Descrição | 4.000 caracteres | texto puro, sem HTML; obrigatório |
| Palavras-chave | **100 bytes** | separadas por vírgula, sem espaço; cada uma com 3+ caracteres; **acento conta 2 bytes**; não repita nome do app/vendedor; **proibido nome de outro app/marca** |
| O que há de novo | 4.000 caracteres | **não existe na 1ª versão**; obrigatório nas seguintes |
| URL de suporte | — | obrigatória; **precisa levar a um contato real** (e-mail/telefone/endereço) |
| URL de marketing | — | opcional |
| Copyright | — | obrigatório, ex.: `2026 Robson Solano` (o © é automático) |
| Versão | — | igual ao `version` do `app.config.ts` (ex.: `1.5.0`) |

### 10.2 Imagens e vídeos
Formatos e tamanhos no **§6**. Para o Persona Fit (só iPhone): capturas **1320×2868** e
**1206×2622**; vídeo opcional **886×1920**, 15–30 s.

### 10.3 Privacidade do app ("rótulo nutricional")
Em **Privacidade do app** ([guia oficial](https://developer.apple.com/app-store/app-privacy-details/)),
declare **tudo** que o app e os SDKs coletam:

| Tipo | Por quê | Vinculado ao usuário? |
|---|---|---|
| Nome, e-mail | conta | Sim |
| ID do usuário | conta/Supabase/RevenueCat | Sim |
| Fotos | análise de refeição | Sim |
| Saúde e condicionamento físico | peso, medidas, treinos, dieta | Sim |
| Compras | RevenueCat | Sim |
| Outro conteúdo do usuário | registros, chat | Sim |
| Interação com o produto / Dados de falhas | analytics, Sentry | conforme o SDK |

Nada é "rastreamento" se você não cruza dados com outros apps para anúncio. URL da política:
`https://apppersonafit.vercel.app/legal/privacidade`. Lição DOD: a declaração estava 3 anos
desatualizada — revise quando adicionar SDK novo.

### 10.4 Classificação etária (sistema novo de 2026)
- **Informações do app → Classificação etária → Editar.** Desde 31/01/2026 a Apple usa as faixas
  **4+, 9+, 13+, 16+ e 18+** e um questionário novo
  ([valores e definições](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions)).
  App sem classificação **não pode ser publicado**.
- Para o Persona Fit, marque **"Temas de saúde ou bem-estar"** (*Health or Wellness Topics* — a
  própria Apple cita contagem de calorias, dieta e exercícios). "Informação médica ou de
  tratamento" só se o app orientar condições médicas.
- Atenção também a: conteúdo gerado por usuário/chat de IA, controles parentais e acesso irrestrito
  à web (Não, salvo navegador embutido). Pergunta não respondida deixa **aviso amarelo** que
  bloqueia o envio.

### 10.5 Informações para a revisão (o ponto que mais recusa)
- **Início de sessão obrigatório:** marque e forneça uma **conta de demonstração que não expire**,
  com **assinatura premium ativa** e conteúdo de exemplo.
- ⚠️ **Lição DOD (recusa real):** a conta de revisão estava com o **premium vencido**. O revisor
  logava e não via nada → recusa 2.1. **Logue com a conta de revisão um dia antes de enviar.**
- **Notas** (até 4.000 bytes, em inglês): login (inclusive Google/Apple), onde fica a assinatura,
  como excluir a conta, o que a IA faz. Exemplo:
  > Sign in with the demo account above (email + password). The account has an active Premium
  > subscription. To analyze a meal, tap "+" and take or choose a photo; the image is sent to our
  > AI provider only after the user consents. In-app purchases are in Profile > Premium (sandbox).
  > Account deletion: Profile > Danger zone > Delete account.
- **Contato:** nome, e-mail e **telefone em formato internacional** (`+55 11 9…`; o campo não
  aceita só números) — alguém que **atenda** se a Apple ligar.

### 10.6 Preços e disponibilidade
- App **gratuito** (a receita vem da assinatura).
- **Países:** desmarque a **UE** se não quiser expor dados de comerciante (§3.3).
- **Método de distribuição: Público** — não dá para trocar depois de aprovado.
- "Apps para iPhone e iPad em Macs com Apple Silicon": pode deixar ativo; desative se não for testar.

### 10.7 Lançamento
- **"Lançar esta versão manualmente"** na primeira vez: você aprova e escolhe a hora.
- **Liberação em etapas (7 dias)** só existe para **atualizações**.

---

## 11. Enviar para revisão
1. Página da versão → **Compilação → "+"** → escolha a build de **produção** (é aqui que o ícone
   aparece na página).
2. Selecione os **produtos de assinatura** (§5).
3. **Salvar → Adicionar para revisão → Enviar para revisão.**
4. Status: **Aguardando revisão → Em revisão → Pronto para distribuição** (aprovado) ou **Rejeitado**.

### 11.1 Se recusar (vai acontecer pelo menos uma vez — normal)
1. Leia em **Revisão de apps → envio → Mensagens**: a diretriz (ex.: *2.1(a)*), **aparelho e iOS**.
2. **Reproduza no mesmo aparelho/iOS.** Sem o aparelho: Simulador com o runtime do iOS da revisão
   (`xcodebuild -downloadPlatform iOS`) e uma build EAS para simulador (`"ios": { "simulator": true }`).
3. Corrija. **Dado/conta/texto da loja** não pede build nova; código pede (o número sobe sozinho).
4. **Responda** em "Responda à equipe de revisão de apps" explicando o que foi feito.
5. Troque a compilação (se houver nova) → **Atualizar revisão** → **Reenviar para Revisão do app**.
- ⚠️ **Não clique no ⊖ vermelho** na tela do envio: ele **remove a versão do envio**.
- Discordou? Dá para recorrer ao **App Review Board**, mas quase sempre é mais rápido ajustar.

---

## 12. Depois de aprovado
1. **Lançar esta versão** (se manual). Até 24 h para aparecer em todos os países.
2. **Sentry todos os dias na primeira semana** (crashes, login, compra). Complementos: TestFlight →
   Falhas; Xcode → Organizer → Crashes.
3. **Atualizações só de JS** → `eas update` (OTA), **sempre** com `--environment production` (sem o
   flag, o CLI publica o `.env` local em produção — incidente real no DOD Cast).
4. Mudança nativa (plugin, permissão, SDK, ícone) → build nova + revisão.
5. OTA não pode mudar a natureza do app escondido da revisão — use para correções.

---

## 13. Checklist final antes do primeiro envio

**Conta e contratos**
- [ ] Apple Developer ativo (renovação automática ligada) e nenhum termo pendente no topo do App Store Connect
- [ ] Contrato de Apps Pagos **Ativo** (W-8BEN + banco validados)
- [ ] Small Business Program solicitado
- [ ] Decisão sobre UE/DSA tomada

**Projeto**
- [ ] `ios.bundleIdentifier` definitivo e **`supportsTablet` decidido** (§14.1)
- [ ] Ícone iOS 1024×1024 **sem alfa** (`sips -g hasAlpha` = no)
- [ ] `usesNonExemptEncryption: false`, `UIViewControllerBasedStatusBarAppearance: false`
- [ ] Sign in with Apple implementado (por causa do Google)
- [ ] Google Sign-In com Client ID **iOS** + `iosUrlScheme`
- [ ] RevenueCat com chave **iOS** + produtos ligados às entitlements
- [ ] Paywall com preço, período, Termos, Privacidade e Restaurar compras
- [ ] Consentimento explícito antes de enviar dados para IA
- [ ] Excluir conta funcionando
- [ ] Chave APNs na EAS e push testado no iPhone
- [ ] `eas.json` com `submit.production.ios.ascAppId` (ID do **app**)
- [ ] Chave de API vinculada ao bundle em **Credentials → iOS** (submit sem login)

**Loja**
- [ ] Informações do app completas (categoria, privacidade, EULA, bens digitais, dispositivo médico = Não)
- [ ] Assinaturas "Prontas para envio" e selecionadas na versão
- [ ] Capturas iPhone **1206×2622** (obrigatória) + **1320×2868** (+ iPad 13" se tablet)
- [ ] Privacidade do app completa
- [ ] Classificação etária respondida, sem aviso amarelo
- [ ] Distribuição **Pública**, países decididos
- [ ] **Conta de revisão testada no dia, com premium ativo**
- [ ] Notas de revisão (login, assinatura, IA, exclusão) + telefone internacional
- [ ] Teste completo no iPhone pelo TestFlight (§9.4)

---

## 14. Desafios que já enfrentamos (e como evitar)

### 14.1 iPad: decisão sem volta (erro 90101)
Publicado com iPad, **a Apple não deixa remover** (*"This bundle does not support one or more of
the devices supported by the previous app version"*). O DOD Questões teve que voltar a suportar
iPad, e no DOD Estudos as capturas de iPad viraram obrigatórias por causa disso.
- `supportsTablet: false` → só iPhone; no iPad roda "em modo iPhone". Sem capturas de iPad.
- `supportsTablet: true` → capturas de iPad 13", layout em tela grande e **teste em iPad** (a
  revisão do DOD foi feita **num iPad**).
- **Decisão para o Persona Fit (2026-10-18): começar só com iPhone.** Adicionar iPad depois é
  permitido; remover não. A Apple **pode revisar no iPad em modo compatibilidade** (2.4.1): precisa
  abrir e funcionar, só não precisa de layout próprio.

### 14.2 App fecha ao abrir (StatusBar)
`UIViewControllerBasedStatusBarAppearance: true` + `<StatusBar>` do RN = app fecha. Use `false`.

### 14.3 Build "Expired"
Arquivo da build some da EAS em 30 dias. Envie logo.

### 14.4 Conta de revisão quebrada
Premium vencido → revisor não vê conteúdo → recusa 2.1. Teste a conta no dia do envio.

### 14.5 "Teclado não apareceu" / login não abre
A revisão do DOD relatou teclado do login sem aparecer (iPadOS 27). Plano B: se a tela de login do
sistema não abrir, abrir no navegador e mandar o erro ao Sentry. Teste no **mesmo aparelho/iOS**.

### 14.6 ID errado no `ascAppId`
Número do canto da tela = ID da equipe. Use o da URL do app.

### 14.7 Chave de API com papel errado / não vinculada (DOD Estudos)
- Chave **Developer** não cria certificado de distribuição (403). Use **Admin**.
- Chave cadastrada na conta da Expo mas **não vinculada ao bundle** → submit pede Apple ID. Vincule
  em Credentials → iOS → bundle → *App Store Connect API Key for EAS Submit*.

### 14.8 Ícone cinza na página da versão
Não é erro: o ícone vem da build e só aparece depois de **associar uma build** à versão (§11).

### 14.9 Ícone com transparência
PNG com canal alfa é recusado no upload iOS. Use a cópia achatada (§7.2).

### 14.10 Grupo externo aprovado, ninguém recebeu
A revisão beta aprova a **build**; quem recebe são os **testadores do grupo**. Grupo com 0
testadores = ninguém recebe. Adicione e-mails ou ligue o link público.

### 14.11 Texto que manda pagar fora da Apple
Qualquer "assine/renove pelo site" é risco (3.1.1). Compra **só pela loja**.

### 14.12 Privacidade e classificação desatualizadas
SDK novo e perguntas novas do questionário exigem revisar **Privacidade do app** e
**Classificação etária** antes de cada versão importante.

### 14.13 Mac / Xcode local (se um dia buildar no Mac)
- `git` para após atualizar o Xcode → `sudo xcodebuild -license accept`.
- Xcode novo pode tornar **erro** o alvo mínimo antigo de bibliotecas e exigir patches no `Podfile`.
- **Recomendação:** use **só a EAS** para builds de loja. Mac local só para depurar e gerar capturas.

### 14.14 OTA de produção sem o ambiente certo
`eas update` sem `--environment production` publicou o `.env` local em produção no DOD Cast →
tela "Configuração inválida" para todos.

---

## 15. Comandos de referência
```bash
npx eas-cli whoami
npx eas-cli build  -p ios --profile production                 # build de loja
npx eas-cli build  -p ios --profile production --auto-submit   # build + envio
npx eas-cli submit -p ios --profile production --latest        # envio ao App Store Connect
npx eas-cli credentials -p ios                                 # certificados, push, chave de API
npx eas-cli build:version:set -p ios                           # ajustar build number (raro)
npx eas-cli update --branch production --environment production --message "..."  # OTA

# Capturas e vídeo no Simulador (tamanho exato do aparelho)
xcrun simctl list devices available | grep -E "iPhone 17 Pro|iPad Pro 13"
xcrun simctl io booted screenshot tela-01.png
xcrun simctl io booted recordVideo prev.mov      # Ctrl+C para parar

# Conferir imagens
sips -g pixelWidth -g pixelHeight -g hasAlpha arquivo.png
```

---

## 16. Links oficiais (conferidos em 2026-11-03)

**Conta e negócios**
- Inscrição: https://developer.apple.com/programs/enroll/
- Papéis no Developer Program: https://developer.apple.com/help/account/access/roles/
- Permissões por papel no App Store Connect: https://developer.apple.com/help/app-store-connect/reference/account-management/role-permissions
- Impostos: https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information
- Small Business Program: https://developer.apple.com/app-store/small-business-program/
- DSA (comerciante na UE): https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements
- Contato Apple Developer: https://developer.apple.com/contact/

**Regras e requisitos**
- Diretrizes de revisão: https://developer.apple.com/app-store/review/guidelines/
- Requisitos de SDK e prazos: https://developer.apple.com/news/upcoming-requirements/
- Privacidade do app: https://developer.apple.com/app-store/app-privacy-details/
- Classificação etária: https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions

**Página da loja e imagens**
- Capturas de tela: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- Vídeos de prévia: https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications
- Campos da versão (limites): https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- Ícone: https://developer.apple.com/help/app-store-connect/manage-app-information/add-an-app-icon · HIG: https://developer.apple.com/design/human-interface-guidelines/app-icons
- Bens e serviços digitais: https://developer.apple.com/help/app-store-connect/manage-app-information/complete-the-digital-goods-and-services-questionnaire
- Dispositivo médico regulamentado: https://developer.apple.com/help/app-store-connect/manage-app-information/declare-regulated-medical-device-status
- Rótulos de acessibilidade: https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels

**TestFlight e API**
- TestFlight: https://developer.apple.com/help/app-store-connect/test-a-beta-version/overview-of-testflight
- App Store Connect API: https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api

**Expo, RevenueCat, Supabase, Google**
- Expo — credenciais: https://docs.expo.dev/app-signing/app-credentials/
- Expo — Submit iOS: https://docs.expo.dev/submit/ios/
- Expo — Sign in with Apple: https://docs.expo.dev/versions/latest/sdk/apple-authentication/
- Supabase — Login com Apple: https://supabase.com/docs/guides/auth/social-login/auth-apple
- Google Sign-In no Expo: https://react-native-google-signin.github.io/docs/setting-up/expo
- RevenueCat — In-App Purchase Key: https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/in-app-purchase-key-configuration
- RevenueCat — Entitlements: https://www.revenuecat.com/docs/getting-started/entitlements
- Guia de recusas (RevenueCat): https://www.revenuecat.com/blog/growth/the-ultimate-guide-to-app-store-rejections/
