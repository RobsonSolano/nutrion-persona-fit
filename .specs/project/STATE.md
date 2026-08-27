# STATE — memória de decisões, blockers e pendências

> Atualizado conforme as features avançam. Carregado no contexto base do nano-spec.

### Auditoria de pontas soltas (2026-08-27, pós-incidente do cadastro)

Dev perguntou direto: "vai ter outra surpresa dessas?". Auditei em vez de
tranquilizar no vácuo.

**FECHADO hoje:**
- Failover de modelo no gerador de plano (coach-generate-plan, onboarding-plan) — deployado.
- Retry no chat-ai (sanity texto + FOTO) — era o único caminho de IA sem
  resiliência nenhuma; deployado e verificado.
- Cache do "aplicar template mostrava 0 treinos" — invalidava `routines` em vez
  de `student_detail`; corrigido, OTA publicado.
- Default de modelo de texto morto (llama-3.3) → gpt-oss-120b em 4 functions.

**Auditado e OK (não é bug):**
- Criar/editar/reordenar/deletar rotina do aluno pelo coach e save do plano JÁ
  invalidam `student_detail`. O template era o único dessa classe.

**AINDA ARMADO — riscos conhecidos, por prioridade:**

1. **Modelo de visão fraco pra JSON.** O sanity check COM FOTO roda em
   `qwen/qwen3.6-27b` (via secret GROQ_VISION_MODEL). Esse modelo FALHOU meu
   teste de JSON estrito ("400: Failed to validate JSON") — o mesmo tipo de erro
   que já assombrou o caminho de foto. O retry absorve 5xx transiente, mas NÃO
   um 400 de JSON inválido. Curioso: `qwen/qwen3.8-27b` PASSOU o teste de JSON —
   pode ser um vision model melhor SE aceitar imagem (não verificado). Não há
   vision model dedicado na conta Groq (llama-4-scout saiu). **Ação: validar se
   qwen3.8-27b aceita imagem e, se sim, trocar o secret. É mudança de secret, sem
   deploy.**
2. **Cadastro de aluno por coach FREE** continua bloqueado (aiCoachLocked barra
   antes de criar, mesmo com 2 slots de direito). Decisão de monetização pendente
   — não toca quem demonstra como premium.
3. **git push 403** — conta errada do gh ativa (robsonsolano-nano). `develop`
   local à frente do origin; funções e OTA já publicados, então runtime não
   depende disso. Trocar a conta e push.
4. **Play Console**: edge-to-edge (não acionável, camada Expo) e resizability
   (feita, aguarda próximo build) — advisory, não bloqueiam.

**Causa-mãe de tudo hoje:** dependência de modelos externos do Groq que são
descontinuados sem aviso + falta de failover. Agora os caminhos de plano e
sanity têm retry/failover. O de visão é o elo mais fraco que resta.

### Instabilidade no cadastro de aluno = Groq 5xx transiente sem retry (2026-08-27)

**Sintoma:** dev relatou "de novo com instabilidade no cadastro de aluno... modelo
de novo". Segunda vez que o cadastro pela IA falha.

**Diagnóstico (evidência real, não palpite):** `ai_usage_log` feature `coach_plan`
mostra `groq_api_error` recorrente — 08-27 07:58, 08-26 19:10, 08-22, sequência
em 07-22 — sempre ~8-9s. Reproduzi a chamada contra o Groq: `openai/gpt-oss-120b`
responde **200** com prompt curto e grande. Ou seja, o modelo funciona; as falhas
são **5xx transiente do servidor sob carga**.

**Causa raiz:** `plan-generator.ts` fazia UMA chamada e desistia no primeiro erro.
`coach-generate-plan` não tem fallback (decisão: coach quer plano por IA), então o
5xx virava "instabilidade" na cara do professor. `onboarding-plan` mascarava com o
fallback genérico.

**Correção:** `fetchGroqWithRetry` — 1 retry com backoff curto (600ms) em 429/5xx.
4xx fora 429 não repete (erro nosso). Beneficia coach e onboarding (bundlam o
plan-generator). Deployado nas 4 functions.

**Bomba adjacente desarmada:** o default de modelo de texto no código era
`llama-3.3-70b-versatile` — **descontinuado no Groq (404)**. Produção sobrepõe via
secret `GROQ_MODEL=openai/gpt-oss-120b`, então não estava quebrado, mas se o secret
cair, 4 functions 404am juntas. Trocado por `DEFAULT_TEXT_MODEL` compartilhado.

**⚠️ ACHADO SEM CORREÇÃO — precisa de decisão:** o **modelo de VISÃO default
(`meta-llama/llama-4-scout-17b-16e-instruct`) também está 404**. A lista atual da
conta Groq (puxada da API em 2026-08-27) NÃO tem modelo multimodal óbvio:
`gpt-oss-120b/20b` são texto; `groq/compound` é agêntico (talvez aceite imagem,
não verificado). O sanity check COM FOTO depende do secret `GROQ_VISION_MODEL`
estar setado e apontando pra algo que exista. **Se esse secret cair ou o modelo
sair, a análise por foto quebra sem fallback de modelo.** Verificar o valor do
secret em produção e definir um vision model atual válido.

**Rate limit é outra coisa:** no teste, 3 gerações em 20s deram 429 (TPM do free
tier). Não é bug — é uso irreal. Um retry não vence rate limit sustentado, e coach
sem fallback falha nesse caso por decisão de produto.

### AAB de polimento 1.4.0 — preparado, build e submit pendentes (2026-08-26)

**`version` 1.3.0 → 1.4.0, e isso é a decisão mais consequente daqui.**
`runtimeVersion` é `appVersion`, então subir a version **isola o binário antigo
do canal OTA**. O comentário no `app.config.ts` já prescrevia exatamente isso
para mudança nativa — e este build muda nativo duas vezes (orientação
destravada + 5 módulos nativos em patch novo).

Sem o bump, um OTA publicado em 1.3.0 depois deste build entregaria JS
compilado contra `expo-updates@29.0.20` para binários rodando `29.0.17`. Com o
bump: quem está no versionCode 4 **mantém o último OTA de hoje** e para de
receber novos até instalar o AAB. Ninguém perde nada; só congela.

**Patches do SDK aplicados** (decisão do dev de mandar junto, que é o único
momento sem janela de risco): `expo` 54.0.34→54.0.37, `expo-updates`
29.0.17→29.0.20, `expo-router` 6.0.23→6.0.24, `expo-constants` e
`expo-file-system` pelo lockfile. `expo install --check` agora diz
"Dependencies are up to date". 280 testes e typecheck passam depois do bump.

**`submit.production.android.track = "alpha"`** — closed testing. O default do
`eas submit` é `internal`, que **não** alcança quem está no closed testing.
Decisão do dev, gravada no `eas.json` pra não depender de escolher na hora.

**Release notes voltaram a arrays vazios.** Descreviam o OTA anterior e ficaram
obsoletas no instante em que ele foi publicado. Anunciar conteúdo errado é pior
que cair no modal genérico. Preencher antes de cada `eas update` — segue sem
guarda automático (a ideia de um script no `update:*` continua não aplicada).

**Pendente, e é do dev:**

1. **Rotacionar o emulador antes do build.** É o único risco que OTA não
   conserta: o app foi desenhado em portrait e nenhuma tela foi vista em
   landscape. Checar aba de treino, modal de imagens do exercício, paywall e
   onboarding.
2. `eas build --platform android --profile production` → sai `versionCode 5`
   sozinho (`appVersionSource: remote` + `autoIncrement`).
3. **Submit: MANUAL, por decisão do dev (2026-08-26).** `npx eas-cli credentials`
   confirmou `Submissions: Google Service Account Key for Play Store Submissions
   — None assigned yet`. Configurar exigiria habilitar a Play Android Developer
   API no projeto `nutrion-d9acc`, criar service account, baixar JSON e convidar
   o e-mail no Play Console — duas UIs web, fora do meu alcance. O dev avaliou
   como trabalho demais para o retorno agora: **sobe o `.aab` à mão** no Play
   Console → Closed testing → nova versão.

   O `submit.production.android.track = "production"` fica no `eas.json`
   **dormente**, pronto se um dia a service account existir.

   **Correção (2026-08-26):** eu havia escrito `alpha`, assumindo que o app
   estava cumprindo closed testing e sem acesso a produção. **O app já está
   publicado em produção** — o dev corrigiu. Consequência maior que uma linha de
   config: os **dois OTAs de hoje foram para usuários reais em produção**, não
   para uma plateia de testadores. Não há público de teste absorvendo o primeiro
   impacto de um update.

   Vale reabrir quando o submit virar rotina (várias releases por mês).

### Play Console — resizability feita, edge-to-edge não é acionável (2026-08-26)

Item #7 do backlog, escopo escolhido pelo dev: **edge-to-edge + resizability,
sem R8**.

**Resizability — feita.** `orientation: 'portrait'` → `'default'`. Confirmei que
nada no projeto declarava `resizeableActivity=false`: a trava de orientação era
a única restrição, então essa linha resolve a recomendação.

Junto veio um bug que a rotação exporia: `ExerciseImagesModal` usava
`Dimensions.get('window').width`, que captura o valor **uma vez**. Cada slide do
carrossel tem largura fixa em px, então rotacionar desalinharia tudo. Trocado
por `useWindowDimensions`.

**Edge-to-edge — NÃO é acionável do nosso lado.** Investigado antes de mexer:

- `grep` em `app/`, `src/` e `app.config.ts` por `setStatusBarColor`,
  `setNavigationBarColor`, `androidStatusBar`, `androidNavigationBar`,
  `NavigationBar` e `windowOptOutEdgeToEdge`: **zero ocorrências**.
- `edgeToEdgeEnabled: true` já estava setado.
- `<StatusBar style="light" />` sem `backgroundColor`.
- `expo-status-bar@3.0.9` e `react-native-screens@4.16.0` estão nas versões que
  o SDK 54 espera (`npx expo install --check` não os aponta).

O aviso vem de dentro da camada Expo/RN. Só sai com upgrade de SDK ou
biblioteca — reavaliar no próximo bump. **Não fiz mudança cosmética pra alegar
que resolveu.**

**R8 fora por decisão do dev.** Primeira ativação em RN/Expo quebra release por
proguard rules, e o bug só aparece no build de release. Merece um build só dele,
onde dá pra atribuir a quebra.

**Risco a checar ANTES do AAB:** o app foi desenhado em portrait. Destravar a
orientação deixa telefone rodar em landscape, e nenhuma tela foi vista assim.
Rotacionar no emulador com o dev build **antes** de gerar o binário — OTA não
conserta config nativa.

**Observação separada, não aplicada:** `npx expo install --check` aponta 5
pacotes atrás do patch esperado pelo SDK 54 — `expo@54.0.34→54.0.37`,
`expo-constants`, `expo-file-system`, `expo-router`, `expo-updates@29.0.17→29.0.20`.
Não bumpei de propósito: não faz parte do item #7, e subir versão de módulo
nativo cria janela de risco entre o bump e o binário novo chegar (OTA publicado
nesse meio carrega JS que espera nativo mais novo). Decisão do dev.

### Sanity check — instrumentação e guard-rails (item #1) — 2026-08-26

O item #1 do backlog eram as ondas **1 e 2**; o que foi entregue mais cedo hoje
eram as ondas **3 e 4**. Confusão fácil de fazer, então: verificado no código
antes de começar que nada da onda 1 existia (`ai_kcal_original`,
`macros_source`, `scale_weight_g` não apareciam em migration nenhuma).

| Onda | Estado antes | Agora |
|---|---|---|
| 2a — reconciliar kcal ↔ macros | ✅ já feito (veio de carona na onda 3) | — |
| 2b — teto de densidade calórica | ❌ | ✅ `aplicarTetoDensidade` |
| 2c — baixar temperature no sanity | ❌ estava em **0.6** | ✅ **0.15** |
| 1 — instrumentar procedência | ❌ nada | ✅ 3 colunas + derivação |

**O teto é 9 kcal/g** — gordura pura, limite físico. Deliberadamente NÃO é um
teto "de prato" (4-5 kcal/g), que pegaria mais casos: 15 g de azeite sozinhos
dão ~8,8 kcal/g e seriam corrigidos indevidamente. Pega menos e nunca erra
contra o usuário. Quando corrige, escala os quatro macros no mesmo fator —
corrigir só o total recriaria a divergência que a onda 2a resolveu.

**`temperature` de 0.6 → 0.15 só no sanity** (`isChatMode ? 0.6 : 0.15`). O
chat conversacional segue em 0.6. Contagem de caloria não quer criatividade, e
0.6 adicionava variância entre duas análises da MESMA refeição — justo o que
atrapalha medir.

**A instrumentação é o ponto todo.** O `MealForm` preenche o campo com a
estimativa da IA e o campo segue editável; quando o usuário corrige 500 para
350 antes de salvar, essa diferença é o erro da IA medido de graça em produção.
Até hoje o original era descartado. Agora `ai_kcal_original` +
`macros_source` (`manual` | `ai` | `ai_edited`) transformam cada correção num
ponto de medição.

Os dois pontos de save foram instrumentados, e o **compilador apontou os dois**
— `FoodLogInsert` é `Omit<FoodLog, ...>`, então estender o tipo quebrou
`app/sanity-check.tsx:128` e `MealForm.tsx:171` na hora. `sanity-check.tsx`
salva a estimativa como veio (`macros_source: 'ai'` sem ambiguidade) e é o
único que tem peso de balança.

**INS-06 verificado no banco:** tudo nullable e os checks só barram valor
absurdo. Inserir refeição sem nenhum campo novo continua funcionando —
instrumentação não pode impedir alguém de registrar comida.

**Teste de ponta a ponta** (aluno3, 150 g arroz + 120 g frango, balança 270 g):
383 kcal, densidade 1,42 kcal/g. Os itens voltaram como
`Arroz, tipo 1, cozido 150g/192kcal` e `Frango, peito sem pele, grelhado
120g/190,8kcal` — batem **exatamente** com a TACO (128 e 159 kcal/100 g).

**Ainda sem verificação:** o `macros_source = 'ai_edited'` pela tela (precisa
analisar, corrigir o campo e salvar). E o teto de densidade nunca disparou de
verdade — só foi exercitado por teste unitário, porque exige o modelo errar
por mais de 9 kcal/g.

**O que isto desbloqueia:** depois de algumas semanas de uso, `select` em
`food_logs` responde "a IA erra pra cima em quantos %?" com dado. É a baseline
que o item #6 (IA paga) precisa pra deixar de ser fé.

### Enriquecimento do catálogo: 271 → 522 — 2026-08-26

Fonte: `yuhonas/free-exercise-db` (CC0), a mesma que já alimentava as imagens —
então os 251 novos nascem **com as duas imagens** de demonstração (verificado
por HEAD no CDN).

| | antes | depois |
|---|---|---|
| Total | 271 | **522** |
| Sem imagem | 13 | **9** |
| Disponível com restrição de membro inferior | 120 | 247 |

Por grupo depois: chest 45, back 60, legs 87, shoulders 51, biceps 31,
triceps 28, core 64, full_body 118, cardio 38.

**Decisões do dev aplicadas:** sem nível `expert` (45 descartados); kettlebell
completo (41); nomes em PT-BR com o inglês entre parênteses quando o termo não
se traduz (`Bom dia pernas estendidas (good morning)`).

**63 candidatos podados na mão** por serem variação de pegada/lateralidade do
mesmo movimento — seis roscas de punho, quatro flexões inclinadas, três
extensões de tríceps curvado, nove desenvolvimentos de kettlebell. Isso é o que
separa 522 de "586 com enchimento": o prompt da IA recebe só **8 exercícios por
grupo**, então variação redundante empurra movimento útil pra fora. O dev pediu
quantidade *com categorização correta*, e near-duplicata não é nem uma nem outra.

**Zero colisão de nome** com o catálogo existente — validado antes de gerar a
migration, não depois. Cinco candidatos foram descartados justamente por
colidirem (`Flexão inclinada`, `Flexão pegada larga`, `Supino reto (máquina)`,
`Agachamento livre (barra)`, `Sled push`).

**Grupo por categoria, não por músculo primário.** O dataset marca quadríceps
como primário em clean, snatch e box jump, o que jogaria 60 exercícios em
`legs`. Mas os equivalentes que já existem (`Power clean`, `Snatch`, `Box jump`,
`Sled push`, `Wall ball`) moram em `full_body` — então halterofilismo olímpico,
pliometria e strongman vão pra `full_body`, exceto agachamentos olímpicos.

**`requires_lower_limbs`:** classificado por músculo primário + categoria, com
19 correções manuais para movimentos que usam a perna como apoio ou alavanca
sem citá-la no nome (sit-up, superman, prancha caminhando, figura 8). Resultado:
275 true, 247 false, **0 null** — nada entrou não classificado.

**Não precisa de OTA:** catálogo é dado de servidor. Os 251 aparecem no app
assim que o cache de query expira (5 min no picker, 60 min no mapa de imagens).

### Poluição do catálogo global por import de IA — 13 linhas em CAIXA ALTA

Achado ao listar o catálogo: `ABDUÇÃO`, `ADUÇÃO`, `AGACHAMENTO PÊNDULO`,
`EXTENSÃO`, `FLEXÃO CADEIRA`, `FLEXÃO MESA`, `GÊMEOS PÊNDULO`, `GLÚTEO MÁQUINA`,
`ELEVAÇÃO PÉLVICA SOLO UNI`, `ROSCA DIRETA POLIA`, `REMADA BAIXA ABERTA`,
`REMADA CURVADA PRON.`, `PULLEY FRENTE`.

São do `coach-save-imported-workout` **antes** do item #5, quando o import por
IA criava exercício no catálogo global com `owner_id = null` e sem convenção de
nome. Vários duplicam entradas próprias (`EXTENSÃO` vs `Cadeira extensora`,
`FLEXÃO MESA` vs `Mesa flexora`).

O item #5 fechou a torneira (import agora nasce `exclusivo` do professor), mas
a spec de julho deixou a limpeza retroativa explicitamente fora de escopo.
**Pendente de decisão do dev**: renomear para a convenção, ou apagar. Apagar é
seguro — `exercise_id` é `on delete set null` nas três tabelas que referenciam,
e `exercise_name` é snapshot.

### Cadastro de exercício pelo professor (item #5) — 2026-08-26

Implementado a partir da spec e do plano de 2026-07-29 (`docs/superpowers/`),
41 commits atrás. Os deltas que a base exigiu estão em
`.specs/features/2026-08-26-exercicios-professor/deltas.md`.

**Onde o professor cadastra:** dentro do `ExercisePickerModal` ("Escolher
exercício"), botão `+ Novo exercício` abaixo do estado vazio e acima da lista.
Caminho: aluno → Plano → Treinos → + → escolher exercício. Nenhuma rota nova.

**Cinco furos do plano de julho**, todos corrigidos e documentados:

1. A Task 9 mandava resolver o coach dentro do `plan-generator` usando "o
   identificador que já existe no escopo" — **não existia**. `generatePlan` não
   recebe id de usuário. Resolvido com `visible_owner_id` no `PlanInput`.
2. Eram 4 functions para deploy, não 5: `coach-save-student-plan` importa só
   `type PlanOut`, apagado no bundle.
3. `fallbackPlan.ts` foi reescrito no dia 26 — as linhas apontadas não existiam.
4. `fetchCatalog` ganhou parâmetro de restrição corporal; o filtro de
   visibilidade teve de compor com ele.
5. A policy de insert chamava `_resolve_entitlement(uuid)`, que **não tem grant
   para authenticated** — daria permission denied. Trocado pelo wrapper
   `resolve_entitlement()`.

**Decisão nova (dev):** `requires_lower_limbs` virou nullable sem default.
O item #5 é o primeiro portão que cria exercício fora do seed, e `default false`
significava "liberado" — um "Agachamento Ravi" chegaria a quem declarou
paraplegia. Com `null` = não classificado e o filtro sendo `eq.false`, o não
classificado já sai dos planos com restrição. O form ganhou o toggle "Exige uso
das pernas?", com estado inicial derivado do grupo pela distribuição real do
catálogo.

**Verificado contra o banco (não é UAT de tela):**

| O que | Resultado |
|---|---|
| Policy de leitura | Exclusivo do professor: dono VÊ, aluno dele VÊ, avulso não vê |
| Policy de insert | Professor premium insere; aluno bloqueado; professor com `owner_id` de outro bloqueado |
| Seed | 271/271 visíveis pros três papéis — nada ficou invisível |
| Fail-safe | Insert sem a coluna deixa `requires_lower_limbs = null` |
| Índices parciais | Professor consegue criar homônimo de exercício do seed |
| `fetchCatalog` | Aluno do coach 152 exercícios · autônomo 150, e **zero exclusivos de qualquer um** |
| `fallbackPlan` | `.is('owner_id', null)` casa 1 em vez de 2 no nome duplicado |
| Bucket | `exercise-photos` público, 2 MB |

**Dois defeitos meus, achados na revisão do próprio diff:** `tocouPerna` não
resetava ao reabrir o modal (segunda abertura ignorava a sugestão por grupo), e
`valoresIniciais()` lia `groupsQ.data` que pode não ter respondido ainda —
o default caía em "Sim" pra exercício de peito e nunca era recalculado.

**Achado de brinde:** o `ExercisePickerModal` tinha o mesmo bug de safe area do
`TemplatePicker` (`Platform.OS === 'ios' ? 50 : 16` fixo). Corrigido em commit
separado da extração.

**Sem verificação: nenhuma tela foi renderizada.** Task 10 (UAT) é do dev.
Falta ver o botão, o form, o upload de imagem, o badge "meu", o lápis de edição,
o fluxo de duplicata e a exclusão. E o gate depende de `tier === 'premium'`, que
por D3 do billing só resolve com assinatura de loja.

### Restrição corporal declarada (PCD) — 2026-08-26

**O bug relatado:** usuário de teste selecionou musculação e escreveu no campo livre
"Conta um pouco sobre você": *"Sou paraplégico, então não preciso ter treino de pernas"*.
A IA gerou treino de pernas.

**Eram três causas, não uma:**

| # | Onde | Causa |
|---|---|---|
| 1 | `plan-generator.ts:341` | O `bio` chegava como **última** das 11 linhas do perfil, rotulado "Bio". A única regra de obediência apontava pra `physical_limitations` — campo que o usuário deixou vazio. O placeholder da tela pede "trabalho sentado 8h, durmo ~6h", então o modelo leu como preferência de rotina |
| 2 | `sanitizePlan()` | Valida modalidade, nome no catálogo e clamps numéricos. **Nada anatômico** |
| 3 | `buildFallbackPlan()` | Agachamento/terra/afundo/stiff/panturrilha **hardcoded** — com circuit breaker aberto, prescrevia perna independentemente de qualquer prompt |

E como `coach-generate-plan` usa o mesmo gerador, o professor tinha o bug idêntico.

**Princípio da correção:** pedir educadamente pro LLM não é correção. O filtro mora em
`fetchCatalog`, antes do prompt. Aproveita uma propriedade que já existia — `sanitizePlan`
descarta o que não está no catálogo recebido — então **um** filtro fecha as duas pontas.

**Decisões:**

- Pergunta "Você é PCD?" entra no passo 4 (Hábitos e restrições), não em tela nova: funil segue em 6 passos.
- Bloqueio determinístico **só pra membro inferior**. Amputação de membro superior não vira
  bloqueio — amputar *um* braço não impede treino de membro superior e o campo não diz
  lateralidade; bloquear o grupo deixaria o plano vazio. Vira regra de prompt. Auditiva
  **não tem implicação de prescrição** e não inventamos uma.
- Responder "Não" **desarma** a rede de palavra-chave. É o escape hatch de quem escreve
  "meu pai é cadeirante". Contradição inversa (respondeu não mas marcou tipo) → segurança vence.
- Bloqueio vindo de texto livre é **anunciado no rationale** com como desfazer. Bloquear
  errado e avisar é melhor que liberar errado e calar.
- LGPD: coberto pelo `consentimento_saude` existente. Sem fluxo novo.

**Achado durante a implementação:** `Levantamento terra (barra)` e `Deadlift (CrossFit)` moram
no grupo `back`; `Push press` e `Handstand push-up` em `shoulders`. A lista curada restrita a
cardio/full_body/core deixava os quatro passarem — precisou de passada catalog-wide.

**Efeito medido do filtro:** 140 exercícios bloqueados, **117 livres** (peito 25, costas 22,
ombros 19, bíceps 13, tríceps 13, core 8, full_body 14 de mobilidade, cardio 3 + handbike).
Dá 3-5 rotinas cheias. Sem o handbike não sobrava **um** cardio.

**Limitação assumida:** classificar 300 exercícios pra treino adaptado não é algo que se faça
sem autoridade clínica. A linha traçada foi "assume função de perna pra ser executado".
Mobilidade de solo e foam roll de perna ficam liberados — pra quem usa cadeira de rodas são,
no pior caso, inúteis, não perigosos. Mora em coluna de banco pra ser corrigível sem deploy.

**Fora de escopo, e o dev sabe:** cadastro manual de treino de perna pelo próprio usuário
(decisão dele: é mau uso, não falha do app). `coach-apply-template` também não filtra —
aplicar template é ação deliberada do professor.

**Buraco conhecido que ficou:** o `chat-ai` não conhece a condição. Se o aluno pedir treino
de perna no chat, nada bloqueia. É função separada, com persona própria — não entrou nesta leva.

**Verificado contra o banco e a IA reais (2026-08-26, após `db:push` + `fn:deploy`):**

| O que | Resultado |
|---|---|
| `onboarding-plan` — controle sem restrição | IA prescreveu perna (agachamento, leg press, terra, stiff) — o detector funciona |
| `onboarding-plan` — **paraplegia só no `bio`** (o caso relatado) | Peito/Tríceps + Ombro/Core + Costas/Bíceps. **Zero perna.** O modelo escreveu "foco em grupos superiores devido à paraplegia" |
| `onboarding-plan` — mesmo caso, **caminho do fallback** | `Superior A/B/C`, zero perna, aviso de texto livre presente |
| `onboarding-plan` — campo estruturado | `Superior A/B/C`, zero perna, **sem** aviso (correto) |
| `onboarding-plan` — respondeu "Não", `bio` cita cadeirante | `Full Body` **com** agachamento/terra — escape hatch confirmado |
| `coach-create-student` com os 3 campos | 200, persistiu `wheelchair_paraplegia` + nota; e o **espelho de e-mail funcionou num signup novo** |
| `coach-generate-plan` pro aluno paraplégico | Peito/Tríceps + Costas/Bíceps + Ombros/Core. **Zero perna** |
| `coach-update-student` | Patch dos 3 campos atravessou a allowlist |
| Gravação pelo client (shape do `saveOnboardingResult`), RLS ligada | 4 formas válidas gravaram: sim+tipo+nota, múltiplos tipos com "other", "não" limpando, e null |
| Check constraints | Slug inválido (`paraplegico`) rejeitado; nota de 501 chars rejeitada; 500 passou |
| Classificação no catálogo real | 270 exercícios, 148 bloqueados, 122 livres. Os 13 movimentos críticos todos bloqueados |

O caminho do fallback foi testado **por acidente**: o teste de controle estourou o rate limit da
Groq, o circuit breaker abriu, e as três chamadas seguintes caíram no fallback. Foi sorte — é
exatamente o buraco #3, o que ignorava qualquer prompt por construção.

**Funil da tela verificado (aluno4, 2026-08-26 17:08):** o dev criou uma conta pelo app,
marcou "Cadeirante / paraplegia" no passo 4 e completou o onboarding. No banco:
`has_disability=true`, `disability_types=["wheelchair_paraplegia"]`. Plano gerado com 4 rotinas
e 20 exercícios, **nenhum** com `requires_lower_limbs`. A IA escolheu o handbike sozinha de novo.

Isso fecha a cadeia `DisabilityFields` → store → `loading.tsx` → `generatePlan` →
`saveOnboardingResult`, que antes só tinha typecheck.

**E isolou o campo estruturado por acidente.** O dev escreveu no "sobre":
*"Inoperante da cintura pra baixo"* — frase que a rede de palavra-chave **não pega** (não diz
paraplegia, cadeirante nem amputação). Confirmado por teste: com só esse `bio`,
`blockLowerLimbs=false`. Ou seja, quem bloqueou foi exclusivamente o campo estruturado — a
prova de que texto livre sozinho não bastaria, e a justificativa da pergunta nova existir.
Virou caso permanente em `bodyRestrictions.test.ts`.

**Ainda sem verificação:** a linha de e-mail no perfil do aluno, o `formatDisability` exibido,
a dica laranja de formulário incompleto e o `continueDisabled` — nenhum foi visto renderizado.

### D3 do billing bloqueia teste de IA de professor (descoberto em 2026-08-26)

`_resolve_entitlement` (20260722000000) só concede `ai_coach` e limite elevado de alunos quando
`source in ('store_play','store_apple','stripe')`. A linha 79 diz explicitamente
`-- D3: grandfather/early NÃO concede coach`. Consequência prática: **promover `coach@nutrion.test`
a `premium/grandfather` NÃO libera `coach-generate-plan` nem passa do limite de 2 alunos** — a RPC
devolve `tier: free, ai_coach: false, student_limit: 2`.

Pra testar o lado professor é preciso `source = 'store_play'`. Foi o que fiz nesta verificação,
restaurando `premium/grandfather` no fim. Não é bug — é a decisão documentada. Mas custa tempo
sempre que alguém tenta testar IA de professor e leva um 402.

### E-mail do aluno visível pro professor (2026-08-26)

`public.profiles` não tinha `email` — vive em `auth.users`, ilegível pelo client. O professor
cadastrava, avisava "vai chegar um e-mail" e não tinha onde consultar qual. Agora é espelho de
`auth.users.email` com backfill e dois gatilhos (signup e troca). A policy `profiles_select_own`
já libera `coach_id = auth.uid()` — RLS intocada.

Texto `selectable` em vez de botão copiar: `expo-clipboard` é dependência nativa e exigiria APK
novo, o que a regra de pré-lançamento evita.

### UAT completo no emulador (2026-08-26) — leva de 2026-08-25 VERIFICADA

Ambiente: emulador Pixel 8 / **Android 16 (API 36)**, dev build local (`npx expo run:android`),
barra de navegação em **3 botões** (o modo gestos não reproduz o bug de safe area). Usuários do
`seed:test-users`; `coach@` promovido a premium (`source=grandfather`) para liberar a IA.

| O que | Resultado |
|---|---|
| Sanity check — **texto** | 545 kcal com gramas / 578 sem (arroz+feijão+bife). Âncora no cru daria 900+ |
| Sanity check — **foto** | 488 → 417 → **367** no mesmo sanduíche. Os 4 macros fecham com a tabela na casa da unidade |
| Cárdio — form | Troca séries/reps/carga por distância/duração/RPM ao escolher exercício do grupo cardio |
| Cárdio — exibição | `2–5 km` · `1h30` · `6 RPM` na visão do aluno |
| Cárdio — **decisão de design validada** | Rotina de **modalidade Musculação** exibindo métricas de **cárdio** — é o caso que fez rejeitar a modalidade como vetor |
| **Template → aluno** | Métricas atravessaram o `coach-apply-template`. Confirma o fix do defeito achado em review |
| Safe area — paywall e demais | Botão de rodapé alcançável |
| Safe area — **abas** | **Sem espaço duplicado** acima da tab bar: confirma a decisão de NÃO aplicar `bottom` nelas |
| Validações | Máx < mín bloqueia; 9.999.999 m avisa (teto 1.000 km) sem erro genérico |
| Duração | `90` no campo de minutos normaliza para `1h30` |
| Alertas | Card escuro do app, não o Alert branco nativo |

**Bugs achados NO teste e corrigidos na hora:** rodapé do `TemplatePicker` (modal, não passava pelo
`Screen`) cortado pela barra de navegação, e o mesmo no topo; imagem de esteira em
"Caminhada (ao ar livre)"; alerta nativo feio; maionese fora da tabela TACO inflando o total.

**Limite do que foi verificado:** não existe baseline do "antes de tudo". Os 488 do primeiro teste de
foto já eram COM a onda 3+4 no ar, e entre o 1º e o 2º a descrição também mudou — então a comparação
limpa é **417 → 367 (−12%)**, atribuível ao código. É a consequência concreta de a instrumentação
(item #1) ter ficado fora da leva.

**Ainda sem verificação:** modal de release notes (`Updates.isEnabled` é `false` em dev build; só
aparece em build de release, e a partir do 2º OTA publicado).

### Dívida de typecheck do `/paywall` — RESOLVIDA (2026-08-26)

O erro `src/lib/paywall.ts(6,17)` (`"/paywall"` fora das rotas tipadas), registrado nesta STATE
desde 2026-07-21 como "pré-existente e alheio" e presente em toda esta sessão, **desapareceu**:
`npx expo run:android` regenerou `.expo/types/router.d.ts` (que estava de 29/jun, antes de
`app/paywall.tsx` existir). `npm run typecheck` agora passa **sem nenhum erro**.

Confirma o diagnóstico original: era cache stale de typed routes, não código quebrado. Nenhuma
alteração em `paywall.ts` foi necessária. **Consequência prática:** o typecheck volta a ser um gate
útil — antes havia sempre 1 erro esperado, o que obrigava a contar erros em vez de exigir zero.

### cardio-duracao-hm (2026-08-26) — implementado (branch `feature/cardio-duracao-hm`)

**Feedback do dev, no teste do emulador:** registrar duração em minutos inteiros é ruim — para 2h30
o professor tem de calcular 150 de cabeça.

**Correção sem tocar o banco:** `duration_min` continua em MINUTOS (unidade canônica, nenhuma
migration). Só a UI muda: o form ganha **Horas + Minutos** que compõem o valor, e a exibição passa a
mostrar **`2h30`** em vez de `150 min`.

Funções puras novas em `cardioMetrics.ts` (4 testes): `formatDuracao` (45 → "45 min", 60 → "1h",
150 → "2h30", 125 → "2h05"), `minutosParaHoraMin` e `horaMinParaMinutos`.

**Trade-off aceito:** digitar mais de 59 no campo de minutos normaliza sozinho (90 vira 1h30, com o
campo mudando na frente do usuário). É correto e até útil, mas causa um pequeno susto ao digitar. A
alternativa seria estado local desacoplado do draft, o que traria dessincronização.

**Validado:** 185/185, typecheck **zero erros**, lint sem erro novo.

### safe-area-bottom (2026-08-26) — implementado (branch `bugfix/safe-area-bottom`)

**Sintoma (dev):** em algumas telas — paywall/assinatura o exemplo — o conteúdo do rodapé ficava
**embaixo dos botões de navegação do Android**, inalcançável.

**Causa raiz:** `app.config.ts:62` tem `edgeToEdgeEnabled: true` (conteúdo desenha atrás das barras,
por design do Android 15) + `src/components/ui/Screen.tsx` com default `edges = ['top']` (só o topo
protegido) + **aplicação inconsistente**: 6 telas passavam `['top','bottom']`, 13 passavam só
`['top']`. Não era bug de uma tela.

**Correção:** `['top', 'bottom']` nas **12 telas fora das tabs** (paywall, editar-perfil, log,
sanity-check, rotina nova/[id], onboarding/resultado, coach aluno-novo, coach rotina nova/[routineId],
coach templates novo/[id]).

**O que NÃO foi mexido, e por quê:** `(tabs)/chat` fica em `['top']` e as três telas de tabs que usam
`<Screen>` sem `edges` (`index`, `treino`, `perfil`) seguem no default. A tab bar já soma
`insets.bottom` na própria altura (`app/(tabs)/_layout.tsx`), então dar `'bottom'` a elas criaria
espaço vazio duplicado.

**Recomendação inicial descartada por verificação:** a primeira ideia foi inverter o default do
`Screen` para `['top','bottom']`. Não serve, exatamente por causa das 3 telas de tabs que dependem do
default. O default fica `['top']` e a armadilha está **documentada no JSDoc do próprio `Screen.tsx`**
— é o ponto onde alguém decide, e onde a informação evita a repetição.

**Relação com o item #7 do backlog (Play Console / edge-to-edge):** parentes, não iguais. O #7 é sobre
APIs deprecadas de insets e **exige build novo**; este é JS puro e **sai por OTA**.

**Validado:** 181/181, typecheck sem erro novo. Lint: os 2 erros em `onboarding/resultado.tsx:114`
(aspas não escapadas) são pré-existentes — confirmado por stash; só a linha do `<Screen>` foi tocada.

**Pendente:** verificação visual em device — exige OTA. O ajuste é de layout, então só o olho confirma.

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
