# Spec — Exercícios em conjunto (bi-set) + descrição do catálogo

> IDs `[CONJ]-NN` e `[DESC]-NN`. Critérios em QUANDO/ENTÃO (cada um vira teste
> nomeado quando há lógica pura). Decisões e o porquê em `context.md`,
> arquitetura em `design.md`.

## User stories

**Professor:** quero prescrever dois exercícios como série conjunta num card só,
cada um com suas próprias séries/reps/carga, pro aluno de 30-40 minutos
conseguir terminar o treino.

**Aluno:** quero abrir o treino e entender na hora que aqueles dois exercícios
são alternados série a série — e não um depois do outro.

## Requisitos — conjunto

### Banco

- **[CONJ]-01 — Colunas do par.** `workout_routine_exercises` e
  `workout_template_exercises` ganham `pair_key text` e `pair_role text`.
  - QUANDO `pair_key` é null ENTÃO `pair_role` também é null (exercício solto) —
    garantido por check `(pair_key is null) = (pair_role is null)`.
  - QUANDO `pair_role` tem valor ENTÃO só aceita `'principal'` ou `'conjunto'`.

- **[CONJ]-02 — Máximo 1 principal + 1 conjunto.** Unique
  `(routine_id, pair_key, pair_role)` e `(template_id, pair_key, pair_role)`.
  - QUANDO tento gravar uma terceira linha com o mesmo `pair_key` ENTÃO o banco
    recusa (o papel já está ocupado), não só o app.
  - QUANDO vários exercícios soltos têm `pair_key` null ENTÃO o unique não
    reclama (Postgres ignora nulos).

- **[CONJ]-03 — Sem backfill.** A migration não altera nenhuma linha existente;
  todas seguem com `pair_key` null. Idempotente, no padrão do projeto.

### Agrupamento (lógica pura)

- **[CONJ]-04 — `agruparConjuntos()`.** Recebe a lista de exercícios e devolve
  cards `{ principal, conjunto | null }`.
  - QUANDO duas linhas compartilham o `pair_key` ENTÃO viram **um** card, na
    posição do `sort_order` do principal.
  - QUANDO o exercício tem `pair_key` null ENTÃO vira um card sozinho
    (`conjunto: null`).
  - QUANDO um `pair_key` tem só uma linha (par órfão, dado corrompido) ENTÃO
    aquela linha vira card solto — **nunca some da tela**.
  - QUANDO as duas linhas do par não estão adjacentes na lista ENTÃO o
    agrupamento funciona igual (agrupa por chave, não por vizinhança).
  - A ordem dos cards **preserva a ordem de entrada**. Quem ordena é o caller:
    `fetchRoutineDetail` já entrega ordenado por `sort_order`, e no editor a
    ordem do array de rascunhos é a verdade (o `sort_order` só é atribuído no
    submit). Assim a mesma função serve leitura e edição.

### Editor (`RoutineEditor`, 6 telas)

- **[CONJ]-05 — Adicionar conjunto.** O card de cada exercício tem a ação
  "Adicionar conjunto".
  - QUANDO toco "Adicionar conjunto" ENTÃO abre o mesmo `ExercisePickerModal`.
  - QUANDO escolho o exercício ENTÃO ele entra **no card que já existe**, com
    bloco próprio de séries/reps/carga (ou distância/RPM/tempo, se for cárdio).
  - QUANDO o card já tem conjunto ENTÃO a ação "Adicionar conjunto" não aparece
    mais nesse card — no lugar aparece "Remover conjunto".

- **[CONJ]-06 — Remover conjunto.**
  - QUANDO toco "Remover conjunto" ENTÃO só o segundo exercício sai; o principal
    continua no lugar com a prescrição intacta.

- **[CONJ]-07 — Remover o principal promove o conjunto.**
  - QUANDO removo o exercício principal de um card que tem conjunto ENTÃO o
    conjunto vira principal do card (mantendo sua prescrição), em vez de os dois
    sumirem.

- **[CONJ]-08 — Picker não repete exercício.**
  - QUANDO um exercício já está no treino, seja como principal ou como conjunto,
    ENTÃO o picker o mostra como já adicionado (mesmo comportamento de hoje).

- **[CONJ]-09 — Gravação.** Ao salvar, os dois exercícios do par vão com o mesmo
  `pair_key` (gerado no cliente, sem dependência nativa), `pair_role` correto e
  `sort_order` sequencial com o conjunto logo após o principal.

### Leitura (`ExerciseReadRow`)

- **[CONJ]-10 — Card do par.** O card mostra `Exercício 1 + Exercício 2` no
  título e, abaixo, **um bloco de métricas por exercício** (séries, reps, carga —
  ou as métricas de cárdio quando for o caso), cada um com seu nome e
  equipamento.
  - QUANDO o exercício é solto ENTÃO o card renderiza exatamente como hoje.

- **[CONJ]-11 — Explicação da série conjunta.** O card do par mostra a orientação
  fixa de execução. Texto proposto (constante única no app, usada no card e no
  olhinho — **sujeito a veto do dev antes do commit**):

  > Série conjunta: faça uma série do primeiro exercício e emende direto no
  > segundo, sem descanso entre eles. Descanse só no fim do par, antes de
  > começar a próxima série.

- **[CONJ]-12 — Numeração por card.** A numeração (`#1`, `#2`...) conta cards,
  não linhas — um par é um número só.

### Detalhe / olhinho (`ExerciseImagesModal`)

- **[CONJ]-13 — Olhinho dividido.**
  - QUANDO abro o olhinho de um card com conjunto ENTÃO a tela mostra o primeiro
    exercício em cima (nome, equipamento, carrossel de imagens, descrição) e o
    segundo embaixo, na mesma estrutura.
  - ENTÃO entre os dois aparece o bloco explicando como executar a série
    conjunta.
  - QUANDO o exercício é solto ENTÃO o olhinho renderiza como hoje.

### Propagação

- **[CONJ]-14 — Template → aluno.** `coach-apply-template` copia o par ao aplicar
  o template no aluno.
  - QUANDO aplico num aluno um template que tem conjunto ENTÃO a rotina criada
    tem o par preservado.
  - QUANDO o mesmo template é aplicado em dois alunos ENTÃO cada rotina tem sua
    própria `pair_key` (a chave é regerada por rotina, não copiada crua).

- **[CONJ]-15/16 — Plano por IA e importação não inventam par, sem código novo.**
  `coach-save-student-plan` e `coach-save-imported-workout` montam a linha a
  partir de payload de IA, que não produz série conjunta. As colunas são
  nulláveis sem default, então **omitir as chaves grava exatamente o mesmo que
  escrever `null`** — e os dois objetos são literais Deno sem tipo que obrigue.
  Escrever os nulls seria ruído que ainda contrariaria o precedente do projeto:
  na feature de cárdio essas duas funções também não foram tocadas.
  - ENTÃO as duas funções ficam **sem alteração**, e só `coach-apply-template`
    entra no `fn:deploy`.

## Requisitos — descrição do catálogo

- **[DESC]-01 — Coluna.** `exercises` ganha `description text`, com check de no
  máximo 400 caracteres.

- **[DESC]-02 — Geração.** Script Node (`--env-file=.env.local`, padrão dos
  `scripts/audit-*.mjs`) gera uma descrição curta por exercício usando a chave de
  IA já configurada, e grava um JSON pra revisão — **não escreve no banco
  direto**.
  - ENTÃO o texto é em PT-BR, 2 a 3 linhas, cobrindo execução e o erro comum.
  - QUANDO rodo o script de novo ENTÃO ele pula todo exercício que já tem
    descrição — seja na coluna `description` do banco, seja no JSON de saída
    anterior (o script lê os dois antes de chamar a IA). Rodar duas vezes não
    gasta cota nem sobrescreve texto já revisado.

- **[DESC]-03 — Seed.** O JSON revisado vira migration de seed idempotente, que
  casa o exercício por `(group_id, name)` — a unique que já existe no catálogo.

- **[DESC]-04 — Exibição.** O olhinho mostra a descrição do exercício.
  - QUANDO o exercício não tem descrição ENTÃO o olhinho mostra o texto genérico
    de hoje (sem espaço vazio nem erro).

## Critérios de aceite globais

- Entrega **OTA + migration + fn:deploy**. Nenhuma dependência nativa nova —
  nada de `expo-crypto`, nada de APK novo.
- Nenhuma rotina existente muda de comportamento: `pair_key` null em 100% das
  linhas atuais.
- `npm test` verde (baseline de entrada: 324 testes) e `npm run typecheck` verde.
- Não introduz erro/warn novo de lint. A dívida pré-existente (6 erros + 34
  warnings, registrada em STATE.md) não entra no escopo.
