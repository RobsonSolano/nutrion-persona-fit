# Feature: Aluno contrata professor

**Data:** 2026-08-29 · **Escopo:** Complex · **Origem:** BACKLOG.md item #8
**Decisões:** ver `context.md`

## Visão geral

Um usuário comum encontra um professor pelo app, envia uma solicitação, e **só vira aluno quando o
professor marca a solicitação como efetuada**. Junto vem a reorganização da área do professor em
abas, avaliações por estrelas e o endurecimento da validação de CREF no cadastro de professor.

## Glossário

| Termo | Significado |
|---|---|
| **comum** | `profiles.role='comum'` — usuário direto do app, sem professor. |
| **aluno** | `profiles.role='aluno'` com `coach_id` preenchido. Treino fica read-only (RLS existente). |
| **professor** | `profiles.role='professor'` + linha em `coaches`. |
| **solicitação** | Linha em `coach_enrollment_requests`. NÃO confundir com `student_requests` (suporte aluno→professor, já existente). |
| **efetivar** | Ação do professor que muda `role` pra `aluno` e seta `coach_id`. |

---

## 1. Perfil público e descoberta

**[DESC]-01** — `coaches` ganha `is_public` (bool, default false), `state_uf`, `city`,
`city_ibge_code`, `specialties` (text[]), `service_mode` (`online`|`presencial`|`hibrido`).

**[DESC]-02** — QUANDO o professor liga "aparecer na busca" SEM ter preenchido UF, cidade,
ao menos uma especialidade e o modo de atendimento, ENTÃO o app bloqueia o toggle e lista o que
falta.

**[DESC]-03** — Um professor só é **encontrável** quando: `is_public = true` **E** entitlement
resolvido é `premium` **E** o CREF passa na validação estrutural (D1) **E** não bloqueou o usuário
que está buscando.

**[DESC]-04** — QUANDO um usuário comum abre "Encontre um professor", ENTÃO vê filtros de UF,
cidade, especialidade (multi) e modo de atendimento, e a lista de professores encontráveis.

**[DESC]-05** — A busca roda por RPC `security definer` que devolve **só** colunas públicas
(nome, avatar, bio, cidade/UF, especialidades, modo, média de estrelas, total de avaliações).
A RLS de `profiles` (`profiles_select_own`) não é afrouxada em momento nenhum.

**[DESC]-06** — QUANDO o usuário abre o perfil público de um professor, ENTÃO vê bio,
especialidades, cidade/UF, modo de atendimento, média de estrelas com total, e o botão de
solicitar — desabilitado com motivo se já existe solicitação aberta.

**[DESC]-07** — Cidade e UF vêm de lista IBGE embarcada no bundle (sem chamada de rede).

## 2. Solicitação e estados

**[SOLI]-01** — Tabela `coach_enrollment_requests`: `id`, `student_id`, `coach_id`, `status`
(`pendente`|`andamento`|`efetuado`|`cancelado`), `message`, `created_at`, `updated_at`,
`responded_at`, `seen_by_student_at`, `cancel_reason`.

**[SOLI]-02** — Índice único parcial: no máximo **uma** solicitação não-terminal
(`pendente`/`andamento`) por par aluno×professor.

**[SOLI]-03** — QUANDO um usuário comum envia solicitação, ENTÃO ela nasce `pendente` e aparece
na fila do professor.

**[SOLI]-04** — QUANDO o usuário já é `aluno` de alguém, ENTÃO não pode abrir solicitação nova
(precisa ser desvinculado antes). Bloqueio no servidor, não só na UI.

**[SOLI]-05** — QUANDO o professor move pra `andamento`, ENTÃO nada muda no vínculo — é só
sinalização de que está tratando com o aluno.

**[SOLI]-06** — QUANDO o professor marca `efetuado`, ENTÃO o servidor: valida limite de alunos do
tier, valida que o solicitante ainda é `comum`, seta `role='aluno'` + `coach_id`, roda
`sync_coach_student_access`, e dispara push. Se o limite estourou, **falha** com mensagem clara e
a solicitação continua como estava.

**[SOLI]-07** — QUANDO o professor marca `cancelado`, ENTÃO o usuário continua `comum` e recebe o
aviso na próxima abertura do app.

**[SOLI]-08** — O aluno vê as próprias solicitações com os mesmos quatro estados, `efetuado` em
verde e `cancelado` em vermelho.

**[SOLI]-09** — QUANDO existe uma resposta (`efetuado`/`cancelado`) ainda não vista, ENTÃO ao
abrir o app o usuário vê um aviso, e `seen_by_student_at` é gravado ao fechar. O aviso **não**
depende de permissão de push.

**[SOLI]-10** — QUANDO o usuário cancela a própria solicitação `pendente`, ENTÃO ela vira
`cancelado` sem notificar o professor.

## 3. Transição comum → aluno

**[TRAN]-01** — A mudança de `role`/`coach_id` acontece **só** na edge function
`coach-respond-enrollment` (service_role) — o trigger `guard_role_changes` impede qualquer outro
caminho.

**[TRAN]-02** — QUANDO o vínculo é efetivado, ENTÃO o aluno **mantém** rotinas, logs e histórico.
A RLS existente já congela a edição do treino.

**[TRAN]-03** — `app/rotina/[id].tsx` usa hoje `readOnly = isStudent && fromCoach`. Uma rotina
criada pelo próprio usuário antes do vínculo tem `created_by_coach=false` → a UI ofereceria editar
e o banco recusaria. Passa a ser `readOnly = isStudent`.

**[TRAN]-04** — Antes de confirmar, o usuário vê tela de transparência: que o professor passa a
ver todo o histórico (inclusive anterior ao vínculo), que o treino fica sob o professor, que ele
ganha o acesso do plano do professor, e o que acontece com a assinatura própria se houver.

**[TRAN]-05** — O aceite fica registrado via o fluxo legal existente
(`consentimento_saude` + `recordLegalAcceptance`) — compartilhar dado sensível de saúde com um
terceiro exige base legal.

**[TRAN]-06** — `_resolve_entitlement` passa a resolver o aluno por `max(tier próprio, tier do
coach)`; `ai_personal` continua herdado. Aluno nunca fica pagando e sem acesso.

**[TRAN]-07** — QUANDO o aluno tem assinatura própria ativa, ENTÃO o app mostra o estado e um
link pra gerenciar na Play. O app não cancela.

## 4. Bloqueio

**[BLOQ]-01** — Tabela `coach_blocks` (`coach_id`, `user_id`, `created_at`), PK composta.

**[BLOQ]-02** — QUANDO o professor bloqueia um usuário, ENTÃO ele some da busca e dos perfis
públicos pra aquele usuário, e solicitações abertas daquele par são canceladas.

**[BLOQ]-03** — Tela de bloqueados na área do professor, com desbloquear.

**[BLOQ]-04** — O usuário bloqueado **não** é avisado do bloqueio.

## 5. Avaliações

**[AVAL]-01** — Tabela `coach_ratings` (`student_id`, `coach_id`, `stars` 1-5, timestamps), PK
composta.

**[AVAL]-02** — Só quem teve solicitação `efetuado` com aquele professor pode avaliar (vale pra
ex-aluno também). Regra no servidor.

**[AVAL]-03** — Uma avaliação por par, editável — reavaliar sobrescreve.

**[AVAL]-04** — A busca e o perfil público exibem média (1 casa) e total.

**[AVAL]-05** — Sem comentário em texto (D6).

## 6. Área do professor em abas

**[ABAS]-01** — `app/(coach)/_layout.tsx` deixa de ser `Stack` puro e passa a ter as abas
**Home**, **Alunos** e **Perfil**.

**[ABAS]-02** — **Home**: nome e e-mail do professor, plano, total de alunos (ativos/suspensos),
total de solicitações pendentes, atalho pra biblioteca de treinos, atalho pra cadastrar aluno,
média de estrelas, e o card de "aparecer na busca" quando o perfil público está incompleto.

**[ABAS]-03** — **Alunos**: a lista que hoje vive na home, com busca.

**[ABAS]-04** — **Perfil**: dados do professor, CREF, perfil público (toggle + região +
especialidades + modo), contato, bloqueados.

**[ABAS]-05** — As rotas de detalhe (`aluno/[id]`, `templates`, etc.) continuam empilhando por
cima das abas.

## 7. CREF (endurecimento)

**[CREF]-01** — Validação estrutural: `NNNNNN-C/UF` — 6 dígitos, categoria `G` ou `P`, UF real.
Aceita entrada com ou sem o prefixo `CREF` e com espaços.

**[CREF]-02** — Rejeita números degenerados: todos os dígitos iguais (`111111`, `999999`) e
sequências (`123456`, `654321`).

**[CREF]-03** — Aplicada em **`signup-professor`** e na **edição de perfil do coach**. Sem os
dois, a validação é decorativa (hoje o CREF é editável livremente após o cadastro).

**[CREF]-04** — Mensagem de erro diz o formato esperado com exemplo.

**[CREF]-05** — Professores já cadastrados com CREF fora do formato **não** são bloqueados
retroativamente no login, mas não aparecem na busca ([DESC]-03) até corrigir.

---

## Fora de escopo

- Fila de revisão manual de CREF por admin ("aguarde enquanto validamos") — registrado em
  `STATE.md` como próximo passo.
- Pagamento do aluno ao professor pelo app (D7).
- Comentário em texto nas avaliações (D6).
- Denúncia/moderação de professor.
- Chat aluno↔professor antes do vínculo (a conversa acontece fora do app).
- Play In-App Updates (exige build nativo, não faz parte desta leva).

## Riscos

| Risco | Mitigação |
|---|---|
| Busca vazar dado de `profiles` | RPC `security definer` com colunas whitelisted; RLS não é afrouxada ([DESC]-05). |
| Professor no limite marca "efetuado" | Validação de limite no servidor antes de efetivar ([SOLI]-06). |
| Race: dois professores efetivam o mesmo usuário | Servidor revalida `role='comum'` dentro da transação ([SOLI]-06). |
| Coach vê histórico retroativo sem consentimento | Tela de transparência + aceite legal ([TRAN]-04, [TRAN]-05). |
| Aluno pagante perde acesso | `max()` no entitlement ([TRAN]-06). |
| Colisão com `student_requests` | Nome e rota distintos (ver `context.md`). |
