# Contexto — Plano Elite (professor) + Pessoal Premium (comum)

> Criado em 2026-11-04. Escopo **Large** (app + Supabase + webhook + painel + hotsite + lojas).

## Problema

O Premium do professor (R$ 29,90) dá **alunos ilimitados**. Há professor com 50+ alunos, e o custo
de IA cresce por aluno (cada aluno herda a IA do professor). Um dono de academia poderia assinar e
dar IA para 150 alunos pelo preço de um personal.

## Decisões do dev (2026-11-04)

| Decisão | Escolha | Por quê |
|---|---|---|
| Limite do Premium | **20 alunos** | Fecha a armadilha do ilimitado. Se houver muita reclamação, sobe depois (é só o número na função do banco) |
| Plano novo | **Elite — R$ 49,90/mês, até 50 alunos** | Não existe mais plano ilimitado: 50 é o teto. Custo por aluno no teto cai em degraus (Pro R$ 3,18 · Premium R$ 1,50 · Elite R$ 1,00) |
| Nome | **Elite** (chave `elite`, produto `nutrion_prof_elite`) | Escada Free → Pro → Premium → Elite óbvia. "Persona" rejeitado: é a marca, ficaria "Persona Fit — Persona" na loja |
| Premium atual com mais de 20 alunos | ~~Teto de 50 enquanto ativo~~ → **sem regra de legado** | A consulta mostrou que nenhum professor passa de 20 alunos (máx. 11); a marca de legado seria complexidade sem ninguém para proteger |
| Free e Pro | **Sem mudança** (2 e 5 alunos) | — |
| Busca de professores (comum) | **Exige Pessoal Premium R$ 29,90**; bloqueia ver lista **e** pedir matrícula | Decisão do dev 2026-11-04. Hoje é grátis para qualquer comum |
| Cotas de IA do Premium | **Chat 10 → 20, análise de prato 8 → 15** por dia | Decisão do dev 2026-11-04 (hoje: `DAILY_USER_MESSAGE_LIMIT = 10`, `DAILY_SANITY_CHECK_LIMIT = 8` em `chat-ai`) |
| Quem ganha a cota maior | **Assinatura própria premium ou acima** (comum Premium, professor Premium/Elite); aluno que herda do professor fica em 10/8 | Default do agente: herdar a cota maior multiplicaria o custo de IA por 20–50 alunos. Ajustável |
| Ordem de trabalho | **Antes da publicação iOS** | Os produtos da App Store já nascem com os 3 planos no mesmo grupo de assinatura; a spec iOS mexe nos mesmos arquivos (paywall, `purchaseSelection`) |

## O que o Premium libera hoje (o Elite herda tudo)

1. Limite de alunos (`_resolve_entitlement` → `student_limit`).
2. Aparecer na busca de professores (`_coach_is_discoverable`, migration `20261013030000`).
3. Cadastrar exercícios próprios (`useExercises` → `canCreateExercise`).
4. Aluno herda o melhor tier entre o dele e o do professor (`free < pro < premium`, migration `20261013020000`).

Todo `tier === 'premium'` vira "premium **ou acima**".

## Ideias para depois (fora desta entrega)

- **Franquia de alunos extras:** ~R$ 2,00 por aluno acima de 50 (ou pacotes). Por isso o limite fica
  calculado num lugar só (`_resolve_entitlement`) — a franquia entra somando assentos extras.
- **Oferta para academias** (B2B): separada do Elite; por isso não usar "Studio/Business" como nome agora.

## Achados

- `hotsite/public/legal/contrato.html` já está desatualizado: diz Free 5 / Pro 20 / Premium ilimitado,
  mas o app usa 2 / 5 / ilimitado desde a migration `20260722000000`.
- Preços de tabela no painel (`painel/src/lib/plans.ts`): Pessoal Pro 15,90 · Professor Pro 15,90 · Premium 29,90.
- Preços confirmados pelo dev em 2026-11-04 (Pro 15,90 · Premium 29,90 · Elite 49,90).
- Consulta de impacto (2026-11-04, SQL Editor — o CLI local não tem permissão no projeto
  `lqmxspapqkwmvwsxkkeh`): 6 professores. Premium: 3 (store_play 5 alunos, external 11, partner 0);
  Pro store_play: 1 (0 alunos); Free: 2. **Nenhum com mais de 20 alunos.**
