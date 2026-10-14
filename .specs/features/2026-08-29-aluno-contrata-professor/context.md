# Contexto e decisões — Aluno contrata professor

> Decisões tomadas no discovery de 2026-08-29. Origem: item #8 do BACKLOG.md
> ("Usuário comum virar aluno de um professor"), refinado pelo dev nesta sessão.

## Ponto de partida (auditoria do código, 2026-08-29)

O que **já existe** e a feature reaproveita:

| Peça | Onde | Aproveitamento |
|---|---|---|
| `profiles.role` + `coach_id` + trigger `guard_role_changes` | `20260504000000_coach_role_and_table.sql:19,95` | Trigger reverte mudança de `role`/`coach_id` feita por `authenticated`. **Obriga** a transição a passar por edge function com `service_role`. |
| `coach-unlink-student` (aluno→comum) | `supabase/functions/coach-unlink-student/` | Espelho exato do caminho que falta. Serve de template (ordem de operações, push, best-effort). |
| Lock de treino do aluno | `20260506000000_routine_ownership_lock.sql:30-49` | RLS já nega insert/update/delete de rotina pra `role='aluno'`. O "refém" do backlog **sai de graça** ao setar o role. |
| Herança de IA | `_resolve_entitlement` em `20260722000000_student_limits_free2_pro5.sql:63-73` | `ai_personal` do aluno já vem do coach. Falta herdar o **tier**. |
| Limite + suspensão | `sync_coach_student_access`, `useCoachAccessSync` | Verificação de limite no aceite e reconciliação já prontas. |
| Acesso do coach aos dados | `20260509000000_coach_view_student_logs.sql` | Setar `coach_id` já libera food/water/workout/sessions — **retroativo**. |
| `coaches` | `20260504000000` + `20260517000000` | Já tem `bio`, `cref`, `show_contact_to_students`, `contact_phone`. |
| Push | `push_type` enum + `push_preferences` + `send-push-notification` | Infra dos avisos de aceite/recusa. |

O que **não existe** (construído nesta feature):

- Qualquer noção de visibilidade pública do professor (zero `is_public`/`rating`/`review` nas migrations).
- Localização: **nenhuma** tabela tem cidade/UF.
- Especialidades do professor. O enum `Modality` existente (`src/types/database.ts:135`) é a
  modalidade **do exercício/rotina** (5 valores) — semântica diferente, não reusar.
- Avaliações.
- Solicitação de vínculo.
- Área do professor em abas (hoje `app/(coach)/_layout.tsx` é um `Stack`).

## Decisões

### D1 — Validação de CREF: formato + heurística anti-lixo, sem fila manual

**Verificado em fonte externa (2026-08-29):** não existe API pública oficial de consulta de
CREF. O CONFEF mantém só uma busca web (`confef.org.br/confefv2/registrados/`) e cada regional
tem seu próprio portal, vários em plataformas de terceiros (`implanta.net.br` no SP e RS,
`spiderware` no SC). Nenhum expõe API documentada. Scraping de 20+ portais é frágil e esbarra em
ToS/LGPD.

**Formato confirmado:** `CREF NNNNNN-C/UF` — 6 dígitos, hífen, categoria `G` (graduado) ou `P`
(provisionado), barra, UF. Fonte: CREF3/SC e Resolução CONFEF.

**Decisão do dev:** "por enquanto dá pra seguir assim, porém, a aplicação deixar passar um 999999
ou 8888888 ou 1111111 complicado né? acredito que não tenha cref bizonha assim".

Implementar: validação estrutural (formato + UF real + categoria válida) **mais** rejeição de
números degenerados (todos os dígitos iguais, sequências crescentes/decrescentes). Aplicada nos
**dois** pontos de escrita — `signup-professor` e a edição de perfil do coach (hoje o CREF é
editável livremente depois do cadastro via `coaches_update_own`, o que anularia qualquer
validação feita só no signup).

**Fora de escopo, registrado como próximo passo:** fila de revisão manual por admin
("aguarde enquanto validamos"), que é o único caminho que prova de fato o registro.

### D2 — Billing: aluno recebe o melhor dos dois tiers

O app **não cancela** assinatura da loja — a spec de billing fixa isso
(`.specs/features/billing/estrutura_assinatura.md:120-124`: "o app não cancela, a loja é o
merchant of record").

Hoje `_resolve_entitlement` devolve pro aluno o **tier próprio** e só herda `ai_personal`. Com
"só professor premium aparece na busca", um usuário que já paga Pro viraria aluno e continuaria
pagando.

**Decisão:** o entitlement do aluno passa a resolver por `max(tier próprio, tier do coach)`
enquanto a assinatura própria não expira. Na tela de confirmação, transparência explícita do que
ele ganha/perde + deep link pra Play (`play.google.com/store/account/subscriptions`) pra cancelar
quando quiser. Nunca fica pagando e sem acesso.

### D3 — Região: UF + cidade da lista IBGE

Dois selects encadeados, lista de municípios embarcada no bundle (JSON estático, sem rede em
runtime). Texto livre foi descartado — `"Sao Paulo"` ≠ `"São Paulo"` fura o filtro.

### D4 — Só professor premium aparece na busca

Decisão do dev, já fechada. É a trava econômica da feature: o professor premium paga por ter
alunos, e o aluno herda o acesso. Consequência: a busca filtra por entitlement resolvido no
servidor, não por um flag no perfil.

### D5 — Estados da solicitação

`pendente` → `andamento` → `efetuado` (verde) | `cancelado` (vermelho).

- **pendente**: aluno enviou, professor ainda não abriu.
- **andamento**: professor está tratando com o aluno (conversa fora do app).
- **efetuado**: professor confirmou — **é neste momento que o vínculo acontece** e o usuário vira
  aluno. Antes disso ele continua comum.
- **cancelado**: recusado. O usuário continua comum e recebe o aviso ao abrir o app.

O aluno vê as próprias solicitações com os mesmos estados.

### D6 — Avaliações: só estrelas, sem texto

1 a 5 estrelas, uma avaliação por par aluno×professor, editável. **Sem comentário livre no MVP** —
texto abre moderação de conteúdo ofensivo, denúncia e responsabilidade editorial, que é uma
feature própria. Só quem teve vínculo efetivado pode avaliar.

### D7 — Pagamento fora do app

"Pelo aplicativo aluno não paga professor, ainda." O acerto financeiro acontece fora. O app não
processa, não intermedia e não exibe valores na contratação.

### D8 — Sem publicação antes do emulador

Decisão do dev: "antes de disponibilizar algo, vamos testar no nosso emulador". Nada de
`eas update` nesta leva. Nada aqui é código nativo — quando publicar, sai por OTA + `db:push` +
`fn:deploy`, sem `.aab`.

## Conflito de nomenclatura resolvido

`student_requests` **já existe** e significa *pedido de suporte do aluno pro professor*
(`app/solicitacoes/`, `app/(coach)/solicitacoes.tsx`, `useRequests`). A fila nova de vínculo usa
**`coach_enrollment_requests`** no banco e a rota `app/(coach)/contratacoes.tsx` no app, pra não
colidir com a tela existente.
