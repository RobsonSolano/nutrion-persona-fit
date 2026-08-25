# Spec — Sanity check itemizado + referência TACO

**Data:** 2026-08-25 · **Escopo:** Large (2 ondas, commits separados na mesma branch)
**Origem:** BACKLOG.md item #2 da leva de 2026-08-25 (ondas 3 e 4 do item de sanity check)

## Problema

O sanity check devolve **calorias infladas** — relato do dev: "parece estar retornando quantidade
de calorias mais do que de fato é". Investigação apontou três causas que esta spec ataca:

1. **Estimativa num único salto.** `buildSanityPrompt` (`chat-ai/index.ts:746`) pede `items` como
   `string[]` (só nomes) e um `macros` com o total. O modelo chuta o total de cabeça, sem passar por
   item → gramagem → kcal do item. LLM somando parcelas erra menos que estimando o todo.
2. **Ninguém confere a conta.** Não existe parser no servidor: o `chat-ai` repassa `aiText` cru
   (`:565`) e todo o `JSON.parse` acontece no cliente (`src/services/sanityCheck.ts`). O total que o
   modelo escreve é aceito como verdade.
3. **Não existe referência nutricional real.** As menções a "TACO/USDA" em `chat-ai/index.ts:116,760,774`
   são **texto de prompt** ("use bom senso e tabelas nutricionais brasileiras"), não dados. Buscas por
   `taco`, `kcal_100g`, `food_reference` no repo não retornam nenhuma tabela, seed ou JSON.

**Achado que motiva a onda 4 (medido na planilha oficial TACO 3 do NEPA/UNICAMP):** a tabela separa
cru de cozido, e em grãos a diferença é de **3x a 5x**:

| Alimento | cru | cozido |
|---|---|---|
| Arroz, integral | 360 kcal/100g | 124 kcal/100g |
| Feijão (preto/carioca/roxo…) | ~320–340 | ~70–93 |

Se o modelo ancora em valor de grão **seco** para um prato **pronto**, o total infla 3-5x. Arroz com
feijão é a base do prato brasileiro — é uma hipótese concreta e verificável para o exagero relatado.

## Objetivo

O total de calorias passa a ser **calculado em código a partir dos itens**, e o modelo recebe uma
referência numérica real (kcal/100g de alimentos brasileiros comuns, na forma cozida) em vez de uma
instrução vaga para "usar bom senso".

## Requisitos

| ID | Requisito |
|---|---|
| **SAN-01** | O prompt pede `items` como lista de objetos `{name, qty_g, kcal, protein_g, carbs_g, fats_g}` — nos **dois** caminhos (com foto e sem foto), que hoje são textos separados. |
| **SAN-02** | O total de macros é **somado em código, no servidor**, a partir dos itens. O `macros` que o modelo escrever no top-level é **ignorado** quando há itens válidos. |
| **SAN-03** | Se os itens vierem vazios ou todos malformados, cai para o `macros` top-level do modelo como fallback, e a ocorrência é registrada em `ai_usage_log` (`error_code`) para dar visibilidade. |
| **SAN-04** | A lógica de soma/normalização vive em módulo **TS puro sem imports Deno** (`chat-ai/sanityMath.ts`), importado pelo `index.ts` e testado por vitest — o padrão que `revenuecat-webhook/mapEvent.ts` estabeleceu. |
| **SAN-05** | O parser tolera **item legado em formato string** (`"arroz"`), sem quebrar: vira `{name}` sem números. |
| **SAN-06** | `app/sanity-check.tsx` renderiza `item.name` (e a gramagem quando existir), em vez de `{item}`. Hoje isso **crasharia** — `:463-468` faz `<Text>{item}</Text>`, e objeto como filho de `<Text>` lança "Objects are not valid as a React child". |
| **SAN-07** | O tipo `SanityCheckResult['items']` muda de `string[]` para `SanityCheckItem[]`, exportado de `src/services/sanityCheck.ts`. Os **dois** consumidores são atualizados juntos (`app/sanity-check.tsx` usa `items`; `MealForm.tsx` não usa, mas compartilha o tipo). |
| **SAN-08** | O system prompt do modo sanity recebe um bloco de referência com **60–80 alimentos brasileiros comuns**, extraídos da TACO 3, na forma **cozida/preparada**, com kcal e macros por 100 g. Fonte em `supabase/functions/_shared/tacoReference.ts` (TS puro, sem query ao banco). |
| **SAN-09** | O bloco de referência instrui explicitamente a **preferir o valor da forma preparada** quando o alimento for servido cozido — é a armadilha cru/cozido descrita no Problema. |
| **SAN-11** | **Compatibilidade de rollout.** A edge function e o app são publicados por caminhos independentes (`fn:deploy` vs. OTA/store), então há uma janela em que a function nova conversa com apps antigos. O campo `text` da resposta continua trazendo `items` como **array de strings** (formato que o app em produção sabe renderizar) e os macros **já reconciliados**; os objetos ricos vão num campo novo do envelope, que só o app novo lê. Sem isso, subir a function primeiro **crasharia** a tela de sanity check em produção. |
| **SAN-10** | `max_tokens` do modo sanity é revisto: itens com 6 campos podem triplicar o tamanho da resposta vs. `items: string[]`. Hoje é 700 (texto) / 1500 (foto), e o caminho da foto já teve `json_validate_failed` por truncamento (comentário em `index.ts:429-434`). |

## Critérios de aceite

- **QUANDO** o modelo devolve 3 itens com `kcal` cada **ENTÃO** o `kcal` final é a soma dos três,
  independentemente do que o modelo escreveu em `macros.kcal`. *(SAN-02)*
- **QUANDO** o modelo devolve itens **e** um `macros` top-level que diverge da soma **ENTÃO** a soma
  vence e a divergência é registrada em `ai_usage_log`. *(SAN-02, SAN-03)*
- **QUANDO** `items` vem `[]`, ausente, ou com todos os itens sem números **ENTÃO** usa o `macros` do
  modelo e registra o fallback. *(SAN-03)*
- **QUANDO** um item vem sem `qty_g` mas com `kcal` **ENTÃO** ele **conta** na soma (não é descartado
  — só não é possível avaliar densidade nele). *(SAN-02)*
- **QUANDO** um item vem como string solta (formato antigo) **ENTÃO** é normalizado para `{name}` e
  não derruba os outros itens. *(SAN-05)*
- **QUANDO** a tela de sanity check recebe itens **ENTÃO** exibe nome + gramagem nos chips, sem
  crashar. *(SAN-06)*
- **QUANDO** o prato descrito é "arroz com feijão" **ENTÃO** o prompt oferece os valores **cozidos**
  (arroz ~124, feijão ~78 kcal/100g), não os crus. *(SAN-08, SAN-09)*
- **QUANDO** um app **antigo** (sem SAN-06) recebe a resposta da function nova **ENTÃO** ele
  renderiza os chips normalmente (strings) e exibe os macros já corrigidos, sem crashar. *(SAN-11)*
- **QUANDO** a resposta com itens é longa **ENTÃO** não é truncada — o JSON fecha e o parse funciona.
  *(SAN-10)*

## Decisões de design

1. **Soma no servidor, não no cliente.** Hoje o `chat-ai` não parseia nada e cada consumidor
   reimplementaria a soma. Colocando no servidor, o cliente recebe o total já reconciliado e a
   lógica fica num único lugar testável.
2. **Rota A para a TACO (constante no Deno), não tabela no banco.** Decisão do dev em 2026-08-25.
   Ataca a armadilha cru/cozido — que é a maior parte do ganho esperado — sem migration, sem RLS,
   sem seed e sem o problema difícil de **matching fuzzy nome→alimento** em linguagem natural. A rota
   B (587 itens em tabela com `unaccent` + `pg_trgm`) fica disponível se a medição mostrar que
   precisa; esta decisão não a impede.
3. **Referência como dado, não como citação.** Não reusar `_shared/references.ts` — ele é para
   citações bibliográficas (`short_name` + `full_citation`, sem campos numéricos) e as referências
   seguem **desligadas** no modo sanity (`index.ts:275`) porque o Llama quebrava o JSON. O bloco TACO
   é um irmão (`tacoReference.ts`), não uma extensão daquele módulo.
4. **Duas ondas, dois commits na mesma branch.** Onda 3 (itemizar + somar) corrige o bug e é
   verificável sozinha; onda 4 (TACO) é incremento de precisão. Commits separados permitem validar e
   reverter cada uma de forma independente.

## Riscos

- **Crash de UI se SAN-06 for esquecido** — o mais grave, e silencioso em teste superficial porque
  o `MealForm` (a outra tela) não toca em `items`.
- **JSON mais complexo aumenta a chance de o modelo quebrar o formato.** Há histórico registrado no
  código: comentários em `sanityCheck.ts:49-53` e `index.ts:270-274` documentam o Llama emitindo
  chave malformada e invalidando o `JSON.parse`. Mitigação: `response_format: {type:'json_object'}`
  já está ativo no modo sanity, e o parser do cliente tem fallback por regex.
- **`qty_g` ausente é o campo que o modelo mais deve "esquecer"** — daí SAN-02 exigir que o item
  ainda conte na soma.
- **Prompt maior consome tokens de entrada** (o bloco TACO), o que reduz a folga do `max_tokens` de
  saída no caminho da foto.

## Fora de escopo

- **Guard-rails aritméticos e teto de densidade calórica** (validar `kcal ≈ 4·prot + 4·carb + 9·gord`,
  usar `scaleWeightG` como teto físico) e **baixar `temperature`** de 0.6: são o item #1 da lista
  priorizada, que o dev manteve fora desta leva.
- **Instrumentação de procedência** (`ai_kcal_original`, `macros_source` em `food_logs`) — mesmo item #1.
  Consequência assumida: não haverá baseline para medir de quanto o exagero caiu; a avaliação será
  qualitativa.
- Tabela TACO no banco com busca fuzzy (rota B).
- Exibir a lista itemizada no `MealForm.tsx` (hoje ele não mostra `items`; manter assim).

## Licença dos dados TACO — RESOLVIDO

**Decisão do dev (2026-08-25): pode usar, é dado público.** A planilha oficial (TACO 3, 587
alimentos) e o PDF da 4ª edição são distribuídos gratuitamente pelo NEPA/UNICAMP, com financiamento
do Ministério da Saúde/MDS. O agente não localizou termos de uso explícitos sobre redistribuição
comercial e sinalizou isso; o dev avaliou e liberou.

Prática adotada de qualquer forma: **creditar a fonte** no arquivo de dados
(`_shared/tacoReference.ts`) — edição, instituição e ano —, tanto por correção acadêmica quanto para
deixar rastreável de onde cada número veio se a questão voltar.

**Fonte usada:** `taco_4_edicao_ampliada_e_revisada.pdf` (4ª edição revisada e ampliada, 2011,
NEPA/UNICAMP), presente na raiz do projeto. Preferida à planilha em Excel do NEPA porque é a edição
mais recente e traz os valores já arredondados no formato de publicação.
