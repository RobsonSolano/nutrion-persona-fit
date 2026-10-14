# Painel admin v2 — spec

**Data:** 2026-10-14 · **Repos:** `app` (banco) + `painel` (`RobsonSolano/nutrion-painel`, telas)

## Objetivo
Abrir o painel e saber em segundos quantos usuários existem, quantos pagam e em que plano, quanto a
IA está sendo usada e se está dando certo — e conceder plano de parceria sem passar pelo SQL Editor.
Uso: só o dev.

## Fora do escopo
- Suporte/sugestões dentro do app (entrega B, depois).
- **Conteúdo das conversas com a IA:** decisão do dev — o painel mostra só contadores (total,
  sucesso, erro, limite, código do erro), nunca o texto.

## Decisões
- **Contas no banco:** funções `admin_*` (SECURITY DEFINER) devolvem JSON pronto; todas começam
  checando `is_admin(auth.uid())` — ficam no mesmo banco do app e qualquer usuário logado pode
  chamá-las com a anon key.
- **Parceria = origem nova `partner`** em `subscriptions` (+ `note`). Vale até `period_end`
  (null = sem fim) e volta a free sozinha. `_resolve_entitlement` e `grant_server_trial` conhecem
  `partner`. Nunca sobrescreve assinatura de loja ativa.
- **Plano exibido = o que o app vê:** `plan_kind` segue as regras do `_resolve_entitlement`
  (inclusive aluno herdando do professor). Trial com `trial_end` no passado é free, mesmo com
  `status = in_trial` gravado (o banco nunca atualiza essa coluna).
- **Contas de teste fora por padrão:** `@nutrion.test`, `@example.com`,
  `@cloudtestlabaccounts.com` (robôs da Play), `+review@`.
- **Dia = dia em São Paulo**, não UTC.
- **Receita estimada do mês** = assinantes ativos da Play × preço de tabela do catálogo do painel
  (`painel/src/lib/plans.ts`) + valor mensal de quem paga por fora. Avulsos ficam à parte. O banco
  não guarda o preço pago na Play; aparece "parcial" enquanto faltar preço ou valor.

## Requisitos
| ID | Requisito | Status |
|---|---|---|
| [ADM]-01 | Só admin chama as funções; anônimo e usuário comum levam `forbidden` | Verified |
| [ADM]-02 | Origem do plano de hoje: store / partner / trial / inherited / grandfather / free | Verified |
| [ADM]-03 | App libera o plano da parceria enquanto vigente | Verified |
| [ADM]-04 | Dashboard: base, planos, engajamento, IA, professores — com filtro de período, plano e contas de teste | Verified |
| [ADM]-05 | Série diária de cadastros, ativos e IA por recurso | Verified |
| [ADM]-06 | Lista de usuários com filtros (papel, plano, origem, professor, busca) e ficha | Verified |
| [ADM]-07 | Uso da IA só em contadores: por recurso (total/sucesso/erro/limite/tempo), códigos de erro, por dia, pushes (enviados/falharam/motivo de não envio) — e exclusões com motivo | Verified |
| [ADM]-08 | Plano manual pelo painel: parceria (não paga) ou pago por fora (Pix etc.) — conceder, alterar, encerrar | Verified |
| [ADM]-09 | Pago por fora: desde quando, mensal ou avulso, dia do pagamento e valor; mensal entra na receita do mês, avulso fica à parte; conta como pagante mesmo herdando plano maior do professor | Verified |

Testes: `supabase/tests/painel_admin.test.sql` (banco) e `vitest` no painel (funções puras).
Conferido na tela (Playwright, 1440 px e 390 px) contra o Supabase local com seed.

## Achados nesta entrega
- `coach-import-workout-ai` grava `feature = 'coach_import_workout'`, que não estava no check de
  `ai_usage_log`: todo insert falhava calado. A migration inclui o valor — importações passam a
  contar a partir do `db:push` (o histórico anterior não existe).
- `_shared/pushAi.ts` grava colunas que não existem (`model`, `input_tokens`, `output_tokens`):
  pushes com IA nunca entraram em `ai_usage_log`. O painel conta pushes por `push_history`, que
  está certo. Corrigir o insert exige `fn:deploy` das 11 functions que usam o pushAi — backlog.

## Entrega
1. `db:push` da migration `20261014120000_painel_admin.sql` — sem build nem OTA.
2. Deploy do painel na Vercel.
3. A edge function `admin-list-users` deixa de ser usada pelo painel (pode sair depois).
