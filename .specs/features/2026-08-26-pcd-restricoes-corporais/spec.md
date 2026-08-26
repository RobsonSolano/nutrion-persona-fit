# Restrições corporais: a IA precisa obedecer o que o usuário declara

**Data:** 2026-08-26
**Escopo:** Large
**Branch:** `feature/onboarding-pcd-restricoes`

## Problema relatado

Um usuário de teste fez o onboarding: selecionou musculação, e no campo
"Conta um pouco sobre você" escreveu *"Sou paraplégico, então não preciso ter
treino de pernas"*. **A IA gerou treino de pernas.**

O dev considera aceitável que o usuário consiga **cadastrar** treino de perna
manualmente (mau uso do app, não falha do app). O que não é aceitável é o
**onboarding gerar** isso.

## Causa raiz — são três buracos, não um

### 1. O `bio` chega no prompt, mas nada obriga a obedecê-lo

`plan-generator.ts:341` monta `- Bio: ${input.bio}` como a **última** das 11
linhas do perfil. A única regra de obediência do system prompt
(`plan-generator.ts:109`) diz *"Respeite limitações físicas declaradas"* e
aponta pro campo `physical_limitations` — que o usuário deixou **vazio**,
porque escreveu na tela seguinte.

Pro modelo, "Bio" é contexto de rotina: o próprio placeholder da tela pede
*"trabalho sentado 8h, durmo ~6h"*. Ele leu como preferência, não restrição.

### 2. Não existe garantia determinística

`sanitizePlan()` (`plan-generator.ts:424`) valida modalidade, casa o nome com
o catálogo e clampa números. **Não valida nada anatômico.** Se o modelo
prescrever agachamento, passa.

### 3. O fallback é pior — ignora tudo por construção

`buildFallbackPlan()` (`fallbackPlan.ts:73-89`) tem `Agachamento livre`,
`Levantamento terra`, `Afundo`, `Stiff` e `Panturrilha em pé` **hardcoded**.
Se o circuit breaker do Groq abrir, o paraplégico recebe treino de perna
independentemente de qualquer prompt.

E como `coach-generate-plan` usa o mesmo `plan-generator`, o professor tem
exatamente o mesmo bug.

## Princípio da correção

**Pedir educadamente pro LLM não é correção.** Uma declaração de paraplegia
tem que ser cumprida por código: filtrar o catálogo **antes** do prompt, pra
que o modelo não tenha um agachamento disponível pra escolher.

Isso aproveita uma propriedade que já existe: `sanitizePlan` descarta
qualquer exercício ausente do catálogo que recebeu. Então filtrar em
`fetchCatalog` fecha as duas pontas — prompt e saída — com um só mecanismo.

## Requisitos

| ID | Requisito |
|----|-----------|
| PCD-01 | `profiles` guarda `has_disability`, `disability_types[]`, `disability_notes` |
| PCD-02 | `exercises` guarda `requires_lower_limbs` |
| PCD-03 | Onboarding pergunta "Você é PCD?" no passo 4 (Hábitos e restrições); ao marcar Sim, escolhe o(s) tipo(s); "Outra" abre campo de descrição |
| PCD-04 | Professor informa o mesmo no cadastro e na edição do aluno |
| PCD-05 | `resolveBodyRestrictions()` traduz os campos estruturados em bloqueio determinístico |
| PCD-06 | Rede de segurança: palavras-chave em `disability_notes`, `physical_limitations` **e `bio`** também disparam bloqueio (é o caso que já aconteceu) |
| PCD-07 | `fetchCatalog` filtra os exercícios bloqueados **antes** de montar o prompt |
| PCD-08 | `buildFallbackPlan` respeita o mesmo bloqueio |
| PCD-09 | System prompt ganha bloco de restrições de prioridade máxima |
| PCD-10 | Texto livre passa a ser apresentado ao modelo como possível restrição de saúde, não como bio de rotina |
| PCD-11 | Em contradição (pediu perna, declarou paraplegia), a restrição de saúde vence — regra explícita no prompt |
| PCD-12 | Bloqueio disparado pela rede de palavra-chave é **avisado ao usuário** no `rationale`, com como corrigir |
| PCD-13 | O professor vê a condição no perfil do aluno |
| PCD-14 | Catálogo ganha `Ergômetro de braço (handbike)` — sem isso não sobra cardio nenhum |

## Decisões

**Onde perguntar:** dentro de "Hábitos e restrições" (passo 4), não em tela
nova. Mantém o funil em 6 passos e o tema da tela já é restrição.

**Amplitude do bloqueio (paraplegia/cadeirante):** grupo `legs` inteiro mais
os exercícios de `cardio`/`full_body`/`core` que dependem de perna. Sobram
peito, costas, ombros, bíceps, tríceps e o core sentado/em cabo — dá 3-4
rotinas cheias.

**LGPD:** condição de PCD é dado sensível de saúde (art. 11, I). Já coberto
pelo consentimento existente `consentimento_saude`
(`20260721000000_consentimento_saude.sql`), do mesmo tipo que já cobre
anamnese, alergias e limitações físicas. Nenhum fluxo de consentimento novo.

## Limitação assumida, explicitamente

**Classificar 300 exercícios para treino adaptado não é algo que se faça sem
autoridade clínica.** A classificação aqui marca o que é inequívoco:

- grupo `legs` → exige membro inferior
- `modality = 'corrida'` → exige membro inferior
- lista curada por nome em `cardio`/`full_body`/`core`

A linha que tracei: bloqueio o que **assume função de perna pra ser
executado** (agachamento, esteira, burpee, prancha, alongamento em pé).
Não bloqueio mobilidade de solo e foam roll de perna — pra quem usa cadeira
de rodas isso é, no pior caso, inútil, não perigoso.

É uma primeira passada revisada por nome, não uma classificação profissional.
Mora numa coluna de banco justamente pra ser corrigível sem deploy de código.
E o professor continua podendo prescrever manualmente o que julgar correto.

**Só membro inferior tem bloqueio determinístico.** Amputação de membro
superior não vira bloqueio: amputação de *um* braço não impede treino de
membro superior, e o campo não informa lateralidade — bloquear o grupo
inteiro deixaria o plano vazio. Vira regra de prompt (priorizar unilateral
e máquina, evitar barra e bilateral simétrico). Deficiência visual idem
(evitar pliometria e peso livre sem apoio). Deficiência auditiva **não tem
implicação de prescrição** — não vou inventar uma; entra só como contexto.

**Falso positivo da rede de palavra-chave:** quem escrever "meu pai é
cadeirante" perde treino de perna sem pedir. Por isso PCD-12 — quando o
bloqueio vem do texto livre (e não do campo estruturado), o `rationale`
avisa o que foi removido e como desfazer. Bloquear errado e avisar é melhor
que liberar errado e calar.

## Fora de escopo

- Cadastro manual de treino de perna pelo próprio usuário (decisão do dev:
  é mau uso, não falha)
- Catálogo de exercícios adaptados de verdade (handbike é o mínimo viável)
- Adaptação por deficiência visual/auditiva além do texto no prompt: não há
  bloqueio determinístico defensável (o problema é execução, não músculo)

## Cobertura de teste

| ID | Cobertura |
|----|-----------|
| PCD-05, PCD-06, PCD-11, PCD-12 | `bodyRestrictions.test.ts` — função pura, vitest |
| PCD-01, PCD-02, PCD-14 | Migration idempotente + query de verificação |
| PCD-07, PCD-08 | Revisão do diff + UAT (gerar plano declarando paraplegia) |
| PCD-03, PCD-04, PCD-13 | UAT no emulador |
| PCD-09, PCD-10 | Sem cobertura automatizada — é texto de prompt |
