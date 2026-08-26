# STATE — memória de decisões, blockers e pendências

> Atualizado conforme as features avançam. Carregado no contexto base do nano-spec.

### cardio-metricas (2026-08-25) — implementado (branch `feature/cardio-metricas`)

Spec: `.specs/features/2026-08-25-cardio-metricas/spec.md` (CAR-01..CAR-08). Item #4 da leva.
**Baseline Test Gate:** 159/159 GREEN em `develop`.

**Problema:** cárdio usava séries/repetições/carga. "3x12 com 20 kg" não significa nada numa esteira.

**A descoberta que definiu o design:** o vetor NÃO pode ser a modalidade. Os 10 exercícios do grupo
`cardio` (esteira, bike, elíptico, remo, natação, HIIT…) estão todos com `modality='musculacao'` —
a coluna de modalidade nasceu depois deles (20260428120000) e pegaram o default. Além disso a
modalidade pertence à ROTINA inteira no `RoutineEditor` (trocá-la apaga os drafts), e uma rotina de
musculação com 10 min de esteira no fim é caso comum. O vetor certo é o **grupo do exercício**,
gravado como **snapshot** (`metric_type`) — mesmo princípio de `exercise_name`, que o schema já
guarda porque `exercise_id` é `on delete set null`.

**Nomenclatura — cuidado registrado:** `duration_min` significa "duração em MINUTOS", enquanto
`weight_min_kg`/`weight_max_kg` usam `min` como mínimo. Os dois padrões já conviviam. Reusamos
`duration_min` como o tempo e **não** criamos `duration_max_min`: seria erro de leitura garantido.

**`metric_type` obrigatório no tipo TS de propósito:** o typecheck então apontou os 8 lugares que
criam exercícios e forçou cada um a decidir, em vez de herdarem default silencioso. Foi assim que
apareceram o `onboarding.ts` e o import de treino por IA.

**Achados do review que viraram correção:**
- **DEFEITO REAL em produção** (`coach-apply-template`): o insert lista colunas explicitamente e não
  incluía os campos novos. Um template de cárdio aplicado no aluno virava exercício de FORÇA —
  distância e cadência iam a null, só o tempo sobrevivia. Contradizia CAR-08 e **não** estava
  coberto pelas limitações declaradas. Corrigido; **exige `fn:deploy`**.
- **Bug de saída no formatador:** faixa que cruza 1 km (`800m–3000m`) produzia `"800 m–3 km"`,
  misturando unidades, porque cada lado era formatado sozinho e um `.replace(/ km$/,'')` só funcionava
  quando o primeiro já estava em km. A unidade passou a ser escolhida uma vez para a faixa inteira.
  Sem teste antes; agora tem.
- **Zero era ambíguo:** `preenchido()` tratava 0 como "não informado", mas a validação de faixa o
  tratava como valor — digitar 0 em "Dist. máx" acusava "máxima menor que a mínima". Unificado.
- **Sem teto de valor:** número gigante passava a validação e estourava o `int4` no INSERT, virando
  "não consegui salvar" genérico. Tetos plausíveis: 1.000 km, 300 RPM, 1440 min.
- **`toFixed().replace('.',',')` reinventava** o `toLocaleString('pt-BR')` já usado em 5 lugares do
  projeto. Trocado.
- **Altitude:** `src/types/database.ts` era espelho isolado do schema, sem nenhum import, e eu tinha
  feito ele importar de `lib/`. `MetricType` voltou para lá; a lib importa do types (lib → types).
- **Duplicação ampliada:** o mapeamento exercício→insert estava copiado em 5 telas (duplicação
  anterior a esta feature) e eu acrescentei 4 linhas em cada. Extraído `toExerciseInsert`
  (`src/lib/exerciseInsert.ts`, 3 testes) — os 5 viraram `.map(toExerciseInsert)`.
- `CardioFields`/`StrengthFields` extraídos: o ternário inline tinha deixado ~100 linhas de JSX e
  indentação inconsistente no `ExerciseDraftRow`.

**Migration:** auditada antes de aplicar (idempotente pelo padrão de `modality`; backfill com
`update ... from ... join` correto; `add column` com default constante é metadado, não reescreve a
tabela; constraints não podem colidir com dado antigo porque as colunas são novas). **Aplicada em
produção** em 2026-08-25 via `db push` — o dry-run mostrou que só ela estava pendente.

**Limitações declaradas (fora de escopo):** o gerador de plano por IA e a importação de treino por IA
(`coach-save-imported-workout`) não produzem métricas de cárdio — entram como `strength`, e o
professor corrige editando.

**Validado:** vitest **181/181**, typecheck sem erro novo, lint sem erro novo, `deno check` na
function corrigida.

**Pendente:** `fn:deploy` da `coach-apply-template` (senão o defeito segue em produção) e **OTA**
para a UI chegar ao app — o form de cárdio e a exibição são código do cliente. Nada disso foi visto
rodando em device.

### sanity-check-itemizado (2026-08-25) — onda 3 implementada (branch `feature/sanity-itemizado`)

Spec: `.specs/features/2026-08-25-sanity-check-itemizado/spec.md` (SAN-01..SAN-11).
Origem: item #2 da leva do `BACKLOG.md`. **Baseline Test Gate:** 110/110 GREEN em `develop`.

**Problema:** sanity check devolvia calorias infladas. Três causas: o modelo estimava o total num
único salto (`items` era só `string[]`); ninguém conferia a conta (o servidor repassava o texto cru
e o total do modelo era aceito como verdade); e não existia referência nutricional real — as
menções a "TACO/USDA" no prompt eram instrução de texto, não dados.

**Onda 3 (esta):** `items` virou lista de objetos com gramagem e macros por item, e o **servidor
soma em código** (`chat-ai/sanityMath.ts`, TS puro, 26 testes) ignorando o total do modelo. Fallback
para o total dele quando os itens vêm sem número, registrado em `ai_usage_log.error_code`.

**Decisão de rollout (SAN-11), importante:** a function e o app publicam por caminhos independentes
(`fn:deploy` vs. OTA/store). O campo `text` continua trazendo `items` como **array de strings** e os
macros **já reconciliados** — então o app hoje em closed testing passa a receber o total corrigido
**sem precisar de update e sem crashar**. Os objetos ricos vão num campo novo do envelope (`sanity`),
que só o app atualizado lê. Sem isso, subir a function primeiro quebraria `app/sanity-check.tsx:463`
(objeto como filho de `<Text>`).

**Achados do review que viraram correção (4 agentes: reuso, simplificação, corretude, prompt):**
- **Regressão da regex de fallback** (achada por 2 agentes independentes): `extractMacrosFromRaw`
  buscava `"kcal"` sem flag global; com `items` vindo antes de `macros` e cada item tendo `kcal`
  próprio, capturava o primeiro item (195, o arroz) como se fosse o total (507). Corrigido buscando
  a partir do bloco `"macros"`, agora com teste do cenário exato.
- **Contradição entre camadas do prompt:** o user message passou a dizer "o total é somado pelo app",
  mas o `SANITY_PERSONA_PROMPT` (system) continuava mandando "SEMPRE preencha macros, NUNCA omita" e
  nem mencionava `items` como objeto. As duas camadas foram alinhadas.
- **Bug latente de coerção:** havia duas funções de coerção numérica no MESMO bundle (`coerceNumber`
  no service e `coerceNumero` na lib nova), divergindo em negativos. Como `food_logs` tem
  `check (calories >= 0)`, um "-50 kcal" alucinado estouraria no INSERT na cara do usuário.
  Unificado em `src/lib/sanityParse.ts`, preservando os aliases (`calorias`, `proteina_g`…).
- Removido o campo `reason` de `Reconciliado` (documentado como telemetria, mas o caller nunca lia);
  extraído `resolveSanityOutput` (matou 3 `let` no meio do `serve()`); chip só mostra gramagem `> 0`.

**Pulados de propósito:** extrair o parser de JSON para `_shared/` (mexeria na geração de plano do
onboarding, fora do diff); tornar `sumItems` interna (exigiria apagar 5 testes da operação central);
`reasoning_effort:'low'` no caminho de foto (hipótese sem medição — o `'none'` está lá por
truncamento real já observado).

**Validado:** vitest **149/149**, `deno check` da function OK, lint 0 erros, typecheck sem erro novo.

**Expectativa honesta:** a onda 3 sozinha corrige o "chute do total num salto", mas **não** deve
fazer o sintoma desaparecer em pratos com arroz e feijão — a âncora em valor de alimento **cru**
(3-5x o cozido) só é atacada na onda 4.

**Ofertas em aberto (escopo que o dev delimitou, não aplicadas):** usar `scaleWeightG` como restrição
real no prompt (soma dos `qty_g` ≈ peso da balança) — é o item #1 da lista, fora desta leva.

**Onda 4 (implementada):** referência TACO no prompt, rota A (constante em
`_shared/tacoReference.ts`, sem tabela no banco e sem matching fuzzy — a rota B, com 587 itens e
busca fuzzy no Postgres, segue disponível se a medição pedir). Licença liberada pelo dev
("dado público"); fonte creditada no arquivo.

**57 alimentos**, ~900 tokens de prompt. Fonte: planilha oficial do NEPA (TACO 3), parseada por
referência de célula. O PDF da 4ª edição foi abandonado como fonte primária por **corrupção de
layout** (linhas com dois alimentos colados, números certos ligados ao nome errado) — mas serviu de
**fonte independente para validação cruzada**.

**Auditoria cruzada (agente, 2026-08-25):** os 52 itens originais conferem com o PDF da 4ª edição
**sem nenhuma divergência**; Atwater (`kcal ≈ 4p+4c+9g`) passa em todos, pior caso real −19,4%
(folhas, onde fibra pesa mais num kcal absoluto pequeno); zero violações da regra de curadoria.
A tolerância do teste de Atwater (25%) foi calibrada por essa medição, não escolhida no chute.

**Correção de um dado da auditoria:** o agente afirmou que `Presunto, com capa de gordura` tem
"377 kcal e 34,5 g de gordura, 4x mais". O valor real na TACO é **128 kcal / 6,8 g** (1,4x). O item
foi renomeado para deixar a forma explícita, mas o risco era muito menor que o descrito.

**Lacunas fechadas após a auditoria (+5 itens):** Batata-doce cozida (77 · crua é 118, armadilha de
1,5x), Lentilha cozida (93 · crua 339, 3,6x), Macarrão ao molho bolonhesa (120), Porco lombo assado
(210 · cru 176), Abacate cru (96 — a fruta mais densa; sem ela o modelo generalizava por analogia
com frutas de 14-98 kcal).

**Macarrão puro cozido não existe na TACO** (só cru, 371). Em vez de inventar número de outra fonte,
o bloco ganhou a **regra de rendimento**: grão e massa rendem 2,5-3x o peso seco ao cozinhar, então
divida o valor do seco por esse fator. Resolve genericamente o que falta (macarrão, grão-de-bico).

**Guarda-corpos automatizados na tabela:** teste que falha se alguém adicionar grão/massa/leguminosa
crua; teste de Atwater; teste que exige que todos os itens apareçam no bloco formatado (um `.slice()`
futuro não passa); teste de duplicidade de nome.

**Validado:** vitest **159/159**, `deno check` OK, typecheck sem erro novo. Lint das edge functions
acusa `import/no-unresolved` em `std/http/server.ts` — **pré-existente e sistêmico** (o mesmo erro
aparece em `onboarding-plan` e `revenuecat-webhook`, não tocadas): o eslint do projeto não resolve
import maps do Deno.

**Verificação real (2026-08-25, após `supabase functions deploy chat-ai` — chat-ai v66):**
prato de arroz branco + feijão carioca + bife grelhado, no caminho de TEXTO (`MealForm` sem foto →
`llama-3.3-70b`):

| Teste | Porções | Total devolvido |
|---|---|---|
| Com gramas explícitas (150/80/120 g) | dadas no texto | **545 kcal** |
| Sem gramas (modelo estimou a porção) | escolhidas por ele | **578 kcal** |

Referência calculada com os próprios valores que subiram no prompt: 192 (arroz) + 61 (feijão) +
263 (patinho) = **516 kcal**. O resultado com gramas ficou 5,6% acima — dentro do arredondamento e
da escolha de corte da carne.

**A evidência mais forte é negativa:** se a âncora no alimento CRU ainda estivesse atuando, só o
arroz daria 537 kcal (358/100 g × 150 g) e o total passaria de 900. Vir 545 mostra que o modelo
aplicou os valores da forma cozida — que é exatamente o que a onda 4 corrigiu.

**Os dois testes juntos** também mostram que estimar a porção sozinho (578) não degradou o resultado
frente a receber as gramas prontas (545) — 6% de diferença. No caminho de texto, porção não é o
gargalo que se temia.

**Limites do que foi verificado (não inflar a conclusão):** duas amostras, do mesmo prato, e **sem o
"antes" medido** — consequência direta de a instrumentação (item #1) ter ficado fora da leva. É
evidência de que o mecanismo funciona, não prova de que o sintoma relatado acabou. E o caminho de
**FOTO** (`/sanity-check` → `llama-4-scout-17b`) segue **sem teste**: estimar gramagem de foto 2D
sem referência de escala é o pedaço mais frágil, e nada nesta feature o atacou.

### ota-release-notes (2026-08-25) — implementado (branch `feature/ota-release-notes`)

Spec: `.specs/features/2026-08-25-ota-release-notes/spec.md` (OTA-01…OTA-07). Origem: item #3 da
leva priorizada no `BACKLOG.md` (leva = #2, #3, #4, #5).

**Baseline Test Gate:** vitest 93/93 GREEN em `develop`. O `typecheck` segue com o **mesmo 1 erro
pré-existente** já registrado nesta STATE (`src/lib/paywall.ts(6,17)`, `.expo/types` stale) — não é
override novo, é a condição já acordada. Confirmado que `.expo/types/router.d.ts` é de 29/jun e
`app/paywall.tsx` de 23/jul, o que explica o erro. Não tocamos em `paywall.ts`.

**Entrega:** o modal de OTA passa a mostrar "o que há de novo" em 3 categorias (🚀 novidades →
✨ melhorias → 🔧 ajustes), lidas de `extra.releaseNotes` do manifest do **update disponível**.
Sem notas válidas, cai no texto genérico de antes — silenciosamente.

**Decisões (e o porquê):**
- **`Updates.updateMessage` NÃO EXISTE** no expo-updates 29.0.17 (a ideia original no backlog
  apostava nisso). Conferido na API pública do pacote: o `--message` do `eas update` não é exposto
  ao cliente. A fonte real é `check.manifest` do `checkForUpdateAsync()`.
- **`ConfirmModal` ganhou `content?: ReactNode`, prop nova e opcional** — os 15 callers seguem
  intactos. Trocar `message: string` por `ReactNode` foi rejeitado (superfície ampla, risco sem
  ganho); e `message` vive dentro de um `<Text>`, onde uma `<View>` não pode entrar, então dois
  slots com semânticas diferentes é o desenho certo, não overengineering.
- **O parser declara o shape do manifest localmente em vez de importar os tipos do expo.** Assim o
  parsing não ganha dependência de compilação no SDK: se o expo mudar o formato, nada quebra no
  build — passa a devolver `null` e o modal usa o texto genérico.
- **`getOtaModalMessage` e `seccoesVisiveis` moram na lib pura**, não no componente/layout. Motivo
  concreto: o projeto **não tem teste de componente** (`vitest.config.ts` coleta só
  `src/lib/**/*.test.ts` e `supabase/functions/**/*.test.ts`; não existe nenhum `*.test.tsx`). Pondo
  a ordem das seções e a omissão de seção vazia na lib, esses comportamentos ficam cobertos por
  vitest e o JSX vira um `.map` burro.

**Achados do review que viraram correção:**
- **CTA inalcançável (severidade média, introduzido por esta feature):** `ConfirmModal` não tem
  `maxHeight` nem `ScrollView`, e `content` é o primeiro conteúdo de tamanho variável que ele
  recebe. Um changelog longo (20-30 itens) empurraria "Atualizar agora" fora da tela. Resolvido com
  `maxHeight: 260` + `ScrollView` **dentro do `OtaReleaseNotes`**, sem alterar o layout do modal
  compartilhado — coerente com o JSDoc do slot ("quem passa `content` cuida do próprio layout").
- **`trim()` não remove zero-width** (U+200B/U+200D/BOM não são `White_Space`): item colado de
  Notion/Docs viraria um bullet invisível. Passou a limpar invisíveis antes de aparar.
- **`Object.values(notas).every(...)` era frágil de forma prospectiva** — se `ReleaseNotes` ganhasse
  um campo `string`, `.length` continuaria compilando e o "está tudo vazio" ficaria errado em
  silêncio. Trocado por lista explícita dos 3 arrays.
- **Rotulagem de teste corrigida:** dois testes alegavam cobrir OTA-01 (a garantia de que o manifest
  lido é o do update disponível) mas testavam parsing sobre manifest montado à mão. Foram
  re-rotulados e a spec ganhou OTA-06/OTA-07 para o que de fato existia só como decisão de código.

**Cobertura — o que NÃO tem rede de proteção (aceito consciente, não "passou porque está verde"):**
- **OTA-01 não tem teste.** Trocar `parseReleaseNotes(check.manifest)` por `Updates.manifest` em
  `useOtaUpdate.ts` não quebraria nenhum teste. Só revisão de código e verificação manual pegam.
- **OTA-04** é garantido apenas por `tsc --noEmit` — "compila", não "comportamento verificado".
- **OTA-05** (preencher as notas antes de publicar) falha em silêncio por design.

**Validado:** vitest **110/110** (15 arquivos; +17 testes nesta feature), lint **0 problemas** nos
arquivos tocados, typecheck sem erro novo.

**Pendências:**
1. **Comportamento na 1ª publicação:** o modal é renderizado pelo bundle **em execução** e as notas
   vêm do manifest do update **que chega**. Logo o primeiro OTA com esta feature ainda será
   anunciado pelo texto genérico; as notas aparecem a partir do publish seguinte. Está comentado no
   hook pra não ser confundido com bug.
2. **`app.config.ts` tem `releaseNotes` com 3 arrays vazios** e só um comentário como guardrail.
   Recomendação **não aplicada** (decisão do dev): um script amarrado a `update:preview` /
   `update:production` (`package.json:21`) que avise quando as 3 listas estiverem vazias — o
   esquecimento é silencioso, então nada no fluxo de release denuncia que a feature virou no-op
   naquele update.
3. **Verificação manual pendente** (exige build de preview: `Updates.isEnabled === false` em Expo
   Go/dev, o hook é no-op): (a) 3 categorias preenchidas → ordem e bullets; (b) só uma categoria →
   as outras omitidas sem cabeçalho órfão; (c) tudo vazio → texto genérico sem bloco fantasma;
   (d) chave grafada errada → fallback silencioso; (e) 1ª execução após instalação limpa → modal
   suprimido por `shouldPromptForUpdate`; (f) changelog longo → lista rola e os botões continuam
   alcançáveis.

### consentimento-dados-saude (2026-07-21) — em andamento (branch `feature/assinatura`)

**Baseline Test Gate — OVERRIDE [2] (2026-07-21):** vitest 41/41 GREEN, mas `typecheck` tem 1 erro
**pré-existente e alheio** à task: `src/lib/paywall.ts(6,17)` — `"/paywall"` não bate com as rotas
tipadas do expo-router (provável `.expo/types` stale, regenera no `expo start`/prebuild). Dev autorizou
seguir com a feature de consentimento e investigar o `/paywall` à parte depois. Não tocar em paywall.ts nesta task.

**Feature:** adicionar consentimento específico e destacado p/ tratamento de dado de saúde (LGPD art. 11, I)
no cadastro comum (`login.tsx`, cobre e-mail + Google) e professor (`signup-professor.tsx`). Storage: reusa
infra de auditoria (`legal_documents` novo `doc_type='consentimento_saude'` requires_acceptance=true →
`recordLegalAcceptance` grava automático). Grandfather por ausência (existentes não recadastram), igual spec #4.

## Billing (iniciativa de assinatura)

### billing-core (spec #1) — implementado em 2026-06-22 (branch `feature/implementacao-assinatura-paginas-auxiliares`)

**Decisões (D1–D5):** ver `.specs/features/2026-06-22-billing-core/spec.md`.

**CONCERN — ordem de deploy (bloqueante para prod):**
- O gating server-side (`402 needs_upgrade`) e a migration `20260622000000_billing_core.sql`
  **só podem ir pra produção junto do build do app que trata o 402** (spec #2 `paywall-ui`).
- Grandfather cobre todos os usuários atuais, então o risco é só pra **novos cadastros**
  pós-deploy sem UI de upsell. **Não fazer `db:push`/`fn:deploy` isolado em prod antes da #2.**

**Validação pendente (não bloqueia fechar a branch):**
- **Runtime das 5 edge functions Deno** (import do helper, formato do `rpc`, 402 chegando no app) —
  sem Deno local e `tsconfig` exclui `supabase/`; validar via `functions serve`/deploy + e2e.
- **RLS direta**: a policy de select existe, mas o acesso real é via RPC `resolve_entitlement`
  (SECURITY DEFINER) — não há grant de select direto a `authenticated`, então leitura direta da
  tabela já fica bloqueada por grant (defesa em profundidade). Sem teste direto necessário.
- Guia de verificação: `.specs/features/2026-06-22-billing-core/VERIFY.md`.

**Já validado (evidência fresca, 2026-06-22):**
- `resolve_entitlement` (lógica): **ALL PASS nos 14 casos contra o SCHEMA REAL local** (supabase start
  via `npx supabase@latest` — o CLI pinado 2.92.1 falha no sync de vector buckets) + também no container stub.
- Migration aplica limpa (DDL/RLS/backfill/funções/grants) no schema real; backfill = 1 grandfather/profile.
- `typecheck` do app: passa. Nenhum lint/type issue introduzido pelo billing-core.

**Nota de tooling:** `supabase start`/`db reset` com o CLI pinado (`supabase@^2.92.1`) aborta no
`Updating vector buckets` (409 FeatureNotEnabled) — incompatibilidade do CLI no local. Workaround:
`npx supabase@latest start`. Considerar bumpar o pin do CLI (afeta `npm run db:push`/`fn:deploy`).

### paywall-ui (spec #2) — implementado em 2026-06-22 (mesma branch)

**Decisões (C1–C7):** ver `.specs/features/2026-06-22-paywall-ui/context.md`.

- **Entrega:** leitura de entitlement (`useEntitlement` + hooks derivados `useAiPersonalLocked`/
  `useAiCoachLocked`), detecção tipada do `402 needs_upgrade` (`NeedsUpgradeError` em **4** call
  sites — incluindo `sanityCheck.ts`, achado no execute), rota modal `app/paywall.tsx` por
  `feature`, helper `handleNeedsUpgrade`, e gating proativo híbrido (componente `PaywallNotice`)
  nas 5 superfícies (chat, sanity, gerar plano, import treino, limite de alunos).
- **CTA "Assinar" = placeholder "em breve" (C1):** compra real (RevenueCat/IAP) é a spec #5.
  Aluno não vê CTA (C4): IA herdada do coach.
- **CONCERN de deploy do billing-core RESOLVIDO:** esta é a UI que trata o `402`. Agora o
  deploy conjunto pode acontecer (`db:push` + `fn:deploy`, ver billing-core VERIFY.md §4) ao
  fechar a branch. **Ainda não deployado** — fazer no fechamento da branch.

**Tooling:** introduzido **vitest** (`npm test`, `vitest.config.ts`) escopado a `src/lib/**`
(lógica pura, sem JSX/RN) — primeira base de testes unitários JS do projeto. 19 testes GREEN
(needsUpgrade, paywall, paywallContent, studentLimit).

**Validado (evidência fresca, 2026-06-22):** `typecheck` verde; `npm test` 19/19; lint dos
arquivos tocados sem warning/erro **novo**. **Pendente (UAT manual):** runtime das 5 superfícies
com usuário sem/com direito (guia em `.specs/features/2026-06-22-paywall-ui/VERIFY.md`).

### trial-e-migração (spec #3) — implementado em 2026-06-22 (branch `feature/billing-trial-e-migracao`)

**Decisões (T1–T7):** ver `.specs/features/2026-06-22-trial-e-migracao/context.md`.

- **Entrega:** `grant_server_trial(uuid)` (concessão única, grandfather-safe + anti-abuso) +
  **trigger** que concede ao **comum** que conclui/pula onboarding (keyed no onboarding, não no
  insert — exclui alunos criados pelo coach, T1b) + `coach-unlink-student` concede ao **ex-aluno**
  (best-effort) e o push `coach_unlinked` menciona o trial. Cliente: `trialDaysLeft` (puro) +
  `useTrialStatus` + `TrialBanner` discreto no dashboard.
- **ADIADO pro #5 (T2):** "escolhe quem fica" / downgrade de professor — gatilho real
  (cancelamento via webhook) mora no #5. **Sem cron de expiração (T5):** `resolve_entitlement`
  já trata `trial_end<now` ao vivo.
- **Validado (evidência fresca):** `grant_server_trial.test.sql` → **ALL PASS** (6 casos, schema
  real local via `npx supabase@latest`); migration limpa/idempotente; `npm test` 23/23; typecheck ok.
- **Pendente (UAT/deploy):** runtime do trigger + do unlink (precisa `auth.users` real / deploy).

**Estado da iniciativa:** specs #1 (billing-core) e #2 (paywall-ui) em `develop`; #3 nesta branch.
Próxima: **#4 legal-docs** e **#5 revenuecat-integration** (deploy conjunto + loja).

**Pendência cross-spec registrada (pedido do dev):** manual de configuração da loja respondendo
(a) se precisa publicar na Play pra assinar, (b) valor mínimo de assinatura, (c) cupom p/ assinar
no valor mínimo. É território do #5; entregar como adendo (pesquisa web + `manual-2-billing-play-store.md`).

### legal-docs (spec #4) — implementado em 2026-06-22 (branch `feature/billing-legal-docs`)

**Decisões (L1–L7):** ver `.specs/features/2026-06-22-legal-docs/context.md`.

- **Entrega:** `legal_documents` (catálogo versionado, 3 docs, URLs placeholder) + `legal_acceptances`
  (PK `user_id,doc_type,version` + RLS own) + service/hook (`recordLegalAcceptance` idempotente) +
  componentes `Checkbox`/`TermsAcceptance` + aceite inline no cadastro de **usuário normal** e
  **professor** + trava no **"Continuar com Google"** + URL de privacidade no `app.config.ts`.
- **L1:** só infra (texto jurídico = advogado, fora do repo). **L2/L7:** só novos cadastros;
  **sem backfill/gate** — existentes não recadastram, logo nunca são re-perguntados. **L5:** login
  por email não exige aceite.
- **Validado:** migration aplica (3 docs seedados, RLS habilitada, idempotente; schema real local);
  vitest 26/26; typecheck verde.
- **Pendente (UAT/deploy):** runtime do aceite + enforcement RLS (auth real).
- **TODO publicação:** trocar URLs placeholder (`personafit.app/legal/*`) pelas reais do hotsite —
  em `legal_documents` (sem release) e `app.config.ts` (release). Texto jurídico + hospedagem do
  hotsite são deliverables externos (advogado/site separado).

**Estado da iniciativa:** #1 billing-core · #2 paywall-ui · #3 trial-e-migração em `develop`;
#4 legal-docs nesta branch. **Falta: #5 revenuecat-integration** (loja + compra + cupons + downgrade
"escolhe quem fica" + manual-4 já escrito orientando a config).

### revenuecat-integration #5a (server-first) — implementado em 2026-06-22 (branch `feature/billing-revenuecat-webhook`)

**Decisões (R1–R6):** ver `.specs/features/2026-06-22-revenuecat-integration/context.md`.

- **Entrega:** edge `revenuecat-webhook` (auth por header secreto, `--no-verify-jwt`, upsert em
  `subscriptions` via service_role; mapa de evento puro `mapEvent.ts` testável) + downgrade
  "escolhe quem fica" (o adiado do #3): `needsStudentChoice` (puro; dispara só pra professor
  over-limit não-grandfather — D5) + banner no coach index + tela `escolher-alunos` (marca quem
  fica ≤ limite, desvincula o resto via `coach-unlink-student` em `Promise.allSettled`).
- **R1:** #5b (SDK `react-native-purchases` + compra real + ligar a CTA do paywall + `appUserID`)
  ADIADO pra quando houver Play Console + RevenueCat + dev build. Guiado por manual-2/3/4.
- **Validado:** `mapEvent` 10 + `downgrade` 5 testes vitest (41/41 total); typecheck verde.
- **Pendente (UAT/deploy):** webhook por simulação curl + tela de downgrade (auth real);
  `supabase secrets set RC_WEBHOOK_SECRET` + URL no RevenueCat (operacional).

**Iniciativa de billing:** specs #1–#4 + #5a em develop após merge; **#5b é o que falta** (depende
do setup operacional da loja — fora de código). `manual-4` orienta a config + responde as dúvidas
do dev (publicação/valor mínimo/cupom). **Dinheiro:** Google é merchant of record (taxa ~10-15%
assinatura + impostos), payout automático mensal (~dia 15) na conta bancária do perfil de pagamentos.

### UAT de integração server-side (2026-06-22) — billing #1–#5a

Validado localmente (`npx supabase@latest`, schema real):
- **`supabase db reset`**: TODAS as migrations (incl. billing_core, server_trial, legal_docs)
  aplicam **limpas do zero, em ordem, sem conflito** (integração #1–#5).
- **`resolve_entitlement.test.sql` → ALL PASS** · **`grant_server_trial.test.sql` → ALL PASS**.
- **legal_documents** seedado (3 docs) · objetos presentes (subscriptions, grant_server_trial,
  trigger de onboarding, legal_acceptances).
- **Webhook (`revenuecat-webhook`) ciclo completo por simulação (curl):** sem header→401;
  INITIAL_PURCHASE(premium)→`premium/active` + entitlement `ai_personal=true`; CANCELLATION→
  `canceled` mas acesso mantido (§3.6, ai_personal segue true até period_end); EXPIRATION→
  `free/expired`+ai_personal=false. Mapeamento, colunas e onConflict corretos.

> **⚠️ CAVEAT pro deploy (webhook):** no stack LOCAL, `service_role` não tem grant DML em tabelas
> public (vale pra `subscriptions` E `profiles`/`coaches`) — quirk do `db reset` (o Supabase
> hospedado concede via bootstrap; por isso os edges atuais escrevem `profiles` em prod sem
> problema). O webhook foi validado concedendo o grant localmente. **Como o webhook dá ack 200 em
> erro de upsert (pra não disparar retries do RevenueCat), uma eventual falha de grant em prod
> seria SILENCIOSA** → **smoke-test obrigatório do webhook logo após o 1º deploy** (simular evento
> e conferir que `subscriptions` atualizou). Se falhar, adicionar `grant insert,update,select on
> public.subscriptions to service_role` numa migration.

### #5b (SDK / compra real) — planejado, NÃO implementado

Plano execução-ready em `.specs/features/2026-06-22-revenuecat-integration/plan-5b-sdk.md`.
Bloqueado por setup operacional (Play Console + RevenueCat + dev build EAS). **Gotcha:**
entitlements no RevenueCat devem se chamar `pro`/`premium` (o `mapEvent.ts` decide o tier por isso).

## Dívida técnica conhecida (pré-existente, fora do escopo billing-core)

- **Lint do app:** `npm run lint` acusa **6 erros + 34 warnings** em arquivos `app/`/`src/`
  (ex: `app/(coach)/index.tsx`, `app/onboarding/resultado.tsx`, `src/services/auth.ts`),
  pré-existentes na develop. Decidido não tratar junto do billing-core (evitar scope creep).
  Candidato a um `chore(lint)` dedicado.
