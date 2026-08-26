# Sanity check — instrumentação e guard-rails (item #1 do backlog)

**Data:** 2026-08-26
**Escopo:** Medium
**Branch:** `feature/sanity-instrumentacao`

## Por que agora

As ondas 3 e 4 (itemização + TACO) foram entregues em 2026-08-26 e o número
caiu de 417 para 367 kcal na mesma foto. **Mas não há como provar quanto disso
foi o código**: `food_logs` guarda só o valor final e não diz se veio da IA ou
foi digitado. É o ponto cego registrado no backlog, e é ele que decide se o
item #6 (IA paga) vale o investimento.

## O que já está feito (e não se repete aqui)

| Onda | Estado |
|---|---|
| 2a — recalcular kcal a partir dos macros e reconciliar | ✅ `reconcileMacros` em `sanityMath.ts`, veio junto da onda 3 |
| 3 — itemizar com gramagem | ✅ 2026-08-26 |
| 4 — referência TACO | ✅ 2026-08-26 |

## Requisitos

| ID | Requisito |
|----|-----------|
| INS-01 | `temperature` do modo `sanity_check` cai de 0.6 para 0.15. Contagem de caloria não quer criatividade — 0.6 é temperatura de conversa |
| INS-02 | Teto de densidade calórica: quando há peso na balança, kcal/g acima do fisicamente possível é corrigido, e os macros escalam no mesmo fator pra não divergir do total |
| INS-03 | `food_logs` guarda `ai_kcal_original`, `macros_source` e `scale_weight_g` |
| INS-04 | `macros_source` é derivado, não digitado: `manual` (nunca analisou), `ai` (aceitou a estimativa), `ai_edited` (analisou e corrigiu) |
| INS-05 | O `MealForm` preserva o valor original da IA quando o usuário corrige o campo |
| INS-06 | Instrumentação não bloqueia o registro: coluna nula nunca impede salvar refeição |

## A decisão do INS-02

O teto é **9 kcal/g** — gordura pura, o limite físico. Nada comestível passa
disso, então acima é erro aritmético e não estimativa pessimista.

Deliberadamente NÃO uso um teto "de prato" (4-5 kcal/g), que pegaria mais
casos: uma colher de azeite sozinha é ~8,8 kcal/g e seria corrigida pra baixo
indevidamente. Prefiro pegar menos e nunca errar contra o usuário.

Quando corrige, escala os quatro macros pelo mesmo fator. Corrigir só o total
deixaria kcal e macros brigando — exatamente o problema que a onda 2a resolveu.

## Por que `macros_source` é o dado mais valioso aqui

O `MealForm` preenche o campo com a estimativa da IA e o campo **segue
editável**. Quando o usuário corrige 500 para 350 antes de salvar, essa
diferença **é o erro da IA medido de graça, em produção real**. Hoje o valor
original é descartado.

Com `ai_kcal_original` + `macros_source = 'ai_edited'`, cada refeição corrigida
passa a ser um ponto de medição. Depois de algumas semanas dá pra responder
"a IA erra pra cima em quantos %?" com dado, não com impressão.

## Fora de escopo

- Onda 5 (avaliar modelo pago) — é o item #6, e depende desta baseline
- Campo de peso na balança no `MealForm` (a tela `sanity-check.tsx` já tem)
- Dashboard/relatório sobre os dados coletados — primeiro acumular

## Cobertura de teste

| ID | Cobertura |
|----|-----------|
| INS-02 | `sanityMath.test.ts` — função pura, vitest |
| INS-04 | `macrosSource.test.ts` — função pura, vitest |
| INS-01 | Revisão do diff (é um número no corpo da requisição) |
| INS-03, INS-06 | Migration + verificação no banco |
| INS-05 | UAT |
