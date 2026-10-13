# Contexto — Exercícios em conjunto (bi-set)

> Decisões do dev capturadas no brainstorming de 2026-09-15. Requisitos em
> `spec.md`, arquitetura em `design.md`.

## O cenário, nas palavras do dev

> "Tenho alunos que não tem muito tempo pra treinar, muitas vezes 30-40 minutos,
> então passamos exercícios conjuntos, exemplo: Elevação lateral + Elevação
> frontal. Do jeito que está hoje, cadastrando separado, o aluno vai fazer um, e
> depois vai fazer outro. A ideia é: faz a primeira série do lateral já faz em
> seguida a primeira do frontal, depois a segunda de cada, a terceira de cada.
> Então no card do exercício, ter a opção de Adicionar conjunto (que é como se
> fosse adicionar um novo exercício mas ficam no mesmo card: Elevação lateral +
> Elevação Frontal)."

> "No detalhe (olhinho) precisa ter uma breve descrição também de cada
> exercício, principalmente nesses conjunto ter uma explicação de fazer séries
> conjuntas."

> "Talvez ter uma tabela auxiliar de exercicio_conjunto (por aluno, ok, usuário
> ok? não é geral). Então pro aluno ou usuário comum id X vai ter o treino Y com
> o exercício_principal W e exercício conjunto Z (acredito que até já tenha uma
> tabela dessa gestão de exercício por treino por pessoa, seria adicionar a
> coluna de exercicio_conjunto)."

Correção do dev depois de uma primeira leitura inflada do escopo:

> "A ideia era no card que mostra o exercício, mostrar: Exercício 1 + Exercício 2
> (porque tem exercício conjunto), abaixo deve exibir séries peso repetições POR
> exercício, e no máximo de 1 exercício conjunto, então sempre principal e no
> máximo 1 conjunto. No detalhe do exercício onde mostra a imagem, divide em 2
> também, acima mostra 1 e embaixo o outro."

**O problema de negócio:** aluno com 30-40 minutos não termina o treino se os
exercícios forem executados em sequência. O bi-set resolve, mas hoje o app não
tem como expressar isso — o professor cadastra dois exercícios soltos e o aluno
não tem como saber que deviam ser alternados.

## Decisões tomadas

| # | Decisão | Por quê |
|---|---------|---------|
| 1 | **Máximo 1 principal + 1 conjunto.** Nunca tri-set. | Palavra do dev. O schema impõe, não só o app. |
| 2 | Métricas (séries/reps/carga) são **por exercício**, não do par. | Elevação lateral 3x12 com 8kg e frontal 3x12 com 6kg são prescrições diferentes. |
| 3 | **Duas linhas + chave de par**, não tabela auxiliar nem colunas achatadas. | `replaceRoutineExercises` apaga e reinsere TODAS as linhas a cada save — os `id` não sobrevivem a uma edição, então qualquer tabela apontando pra eles morre no primeiro "Editar treino". Com duas linhas, tudo que já existe (contagem de exercícios, mapa de imagens por `exercise_id`, métricas de cárdio, o picker que bloqueia repetido) continua funcionando sem ser tocado. |
| 4 | `pair_key` é **`text`**, não `uuid`. | `src/services/exercises.ts:69` documenta que não há lib de uuid no projeto e que `expo-crypto` é módulo nativo — usar obrigaria a gerar APK novo. O `RoutineEditor` já gera chave local com `${Date.now()}-${random36}`; reusar mantém a entrega OTA. |
| 5 | O texto explicando série conjunta é **constante no app**, não coluna no banco. | Não varia por exercício. |
| 6 | Remover o principal **promove o conjunto a principal** em vez de apagar os dois. | Menos destrutivo; o dev não perde a prescrição que já digitou. |
| 7 | **Descrição breve dos 534 exercícios** entra junto, gerada por IA e revisada antes do seed. | Pedido do dev no mesmo escopo. Serve a todo exercício no olhinho, não só aos conjuntos. |
| 8 | Templates do professor espelham as colunas. | Padrão do projeto desde as métricas de cárdio (`20260825000000`). |

## Fora do escopo (decidido explicitamente)

- **Execução guiada com histórico por série** na tela de treino ativo. Chegou a
  ser escolhido enquanto o escopo estava inflado e foi retirado na correção do
  dev. Hoje `app/treino-ativo.tsx` é só cronômetro (139 linhas) e não existe
  nenhum registro por série no app. Fica pro BACKLOG.
- **Tri-set / circuito** (3+ exercícios no mesmo card).
- **Campo de descanso.** Não existe em nenhuma tabela hoje; o texto fixo da série
  conjunta cobre a orientação ("descanso só no fim do par") sem coluna nova.
- **IA gerando conjuntos** na importação de treino. `coach-save-imported-workout`
  só precisa não quebrar.

## Estado do código na entrada (verificado em 2026-09-15)

- `workout_routine_exercises` (`20260422120000`) e a gêmea
  `workout_template_exercises` (`20260515000000`) já são "exercício por treino
  por pessoa" — `workout_routines.user_id` resolve o "por aluno".
- `RoutineEditor.tsx` é consumido por **6 telas** (rotina do aluno nova/editar,
  rotina pelo coach nova/editar, template novo/editar).
- `ExerciseReadRow.tsx` é usado em `app/rotina/[id].tsx` e `app/(coach)/templates/[id].tsx`.
- O olhinho (`ExerciseImagesModal.tsx`) mostra carrossel + legenda genérica. O
  catálogo **não tem coluna de descrição**.
- Catálogo de produção: **534 exercícios** (consultado via PostgREST).
- Três edge functions copiam exercício: `coach-apply-template`,
  `coach-save-student-plan`, `coach-save-imported-workout`.
- Baseline de testes na entrada: **324/324 verdes**.
