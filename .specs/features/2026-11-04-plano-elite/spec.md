# Spec — Plano Elite (professor) + Pessoal Premium (comum)

> Feature `plano-elite` · 2026-11-04 · Escopo **Large** · Decisões em `context.md`.

## User stories

- Como **professor com carteira grande**, quero assinar o Elite (R$ 49,90) para acompanhar até 50 alunos.
- Como **usuário comum**, quero assinar o Pessoal Premium (R$ 29,90) para encontrar um professor e ter
  mais interações com a IA.
- Como **dono do app**, quero que nenhum plano dê alunos ilimitados, para o custo de IA por aluno caber no preço.

## Tabela de planos (alvo)

**Comum (pessoal)**

| Tier | Produto | Preço | IA pessoal | Chat/dia | Análise de prato/dia | Busca de professores |
|---|---|---|---|---|---|---|
| free | — | — | Não (trial 7 dias = Pro) | — | — | Não |
| pro | `nutrion_comum_pro` | R$ 15,90 | Sim | 10 | 8 | Não |
| **premium** | **`nutrion_comum_premium`** | **R$ 29,90** | Sim | **20** | **15** | **Sim** |

**Professor**

| Tier | Produto | Preço | Alunos | IA de professor | Busca de professores | Exercícios próprios |
|---|---|---|---|---|---|---|
| free | — | — | 2 | Não | Não | Não |
| pro | `nutrion_prof_pro` | R$ 15,90 | 5 | Sim | Não | Não |
| premium | `nutrion_prof_premium` | R$ 29,90 | **20** | Sim | Sim | Sim |
| **elite** | **`nutrion_prof_elite`** | **R$ 49,90** | **50** | Sim | Sim | Sim |

## Requisitos

### [ELITE]-01 Tier `elite` no banco
- ENTÃO `subscriptions.tier` aceita `'elite'` (check constraint atualizado), sem mexer nos dados existentes.
- ENTÃO a ordem dos tiers é `free < pro < premium < elite` e existe um único lugar no SQL que a define.

### [ELITE]-02 Limites de alunos
- QUANDO o professor tem tier `premium`, ENTÃO `student_limit = 20`.
- QUANDO tem tier `elite`, ENTÃO `student_limit = 50`.
- ENTÃO nenhum tier de professor devolve `student_limit = null` (fim do ilimitado). Free 2 e Pro 5 não mudam.
- QUANDO `coach-create-student` (ou aceite de matrícula) é chamado com o limite atingido, ENTÃO responde
  `402 needs_upgrade` com `feature: 'student_limit'`, como hoje.

### [ELITE]-03 Sem regra de legado
- ENTÃO não existe marca de "Premium legado": o limite de 20 vale para todos os Premium, inclusive os atuais.
- Base: consulta de 2026-11-04 — nenhum professor tem mais de 20 alunos (máximo 11). Ver `context.md`.
- QUANDO um Premium tiver mais de 20 alunos (ex.: caiu de Elite), ENTÃO vale o fluxo existente de
  "escolher quem fica" (`needsStudentChoice`) e o paywall oferece o Elite.

### [ELITE]-04 Elite herda tudo do Premium
- QUANDO o professor é `elite`, ENTÃO aparece na busca de professores (mesmas demais regras: opt-in, CREF,
  perfil completo) e pode cadastrar exercícios próprios.
- QUANDO um aluno é vinculado a um professor `elite`, ENTÃO herda o melhor tier (regra `aluno_melhor_tier`
  estendida para `elite`).
- ENTÃO todo gate que hoje compara `tier === 'premium'` (app e SQL) passa a aceitar premium **ou acima**,
  via helper único (ex.: `tierAtLeast(tier, 'premium')`).

### [ELITE]-05 Webhook RevenueCat
- QUANDO o evento traz a entitlement `elite`, ENTÃO `subscriptions.tier = 'elite'` (prioridade
  `elite > premium > pro`).
- ENTÃO os demais mapeamentos de status (trial, cancelamento, expiração, problema de cobrança) não mudam.

### [ELITE]-06 Compra e paywall
- QUANDO professor free abre o paywall, ENTÃO vê **Pro, Premium e Elite**; pro vê Premium e Elite; premium
  vê só Elite; elite não vê planos.
- QUANDO estoura o limite sendo pro, ENTÃO o produto sugerido é Premium; sendo premium, é Elite.
- QUANDO estoura o limite sendo elite, ENTÃO o paywall não oferece compra e mostra que o Elite é o maior
  plano, com atalho para o suporte do app.
- QUANDO troca premium → elite na Play, ENTÃO é troca de plano (substitui o produto antigo, sem cobrança
  dupla), como já é pro → premium.
- ENTÃO os textos dizem: Pro "Até 5 alunos" · Premium "Até 20 alunos" · Elite "Até 50 alunos"; nenhum
  texto do app diz "ilimitado" para alunos.

### [ELITE]-07 Telas de plano
- ENTÃO `CoachPlanBadge`, `SubscriptionCard` e perfil mostram "Elite", contador `X/50`, e só oferecem
  upgrade quando há plano acima.

### [ELITE]-08 Painel admin (repo `nutrion-painel`)
- ENTÃO catálogo, label/cor do tier, filtro global e plano manual (parceria/pago por fora) aceitam `elite`.
- ENTÃO `set_manual_plan` aceita `p_tier = 'elite'` e o erro `invalid_tier` diz "Escolha Pro, Premium ou Elite".
- ENTÃO o catálogo mostra Premium "Até 20 alunos" e Elite "Até 50 alunos", R$ 49,90.

### [ELITE]-09 Hotsite
- ENTÃO a tabela de `legal/contrato.html` mostra Free 2 · Pro 5 · Premium 20 · Elite 50 e a coluna Elite.
- ENTÃO nenhuma página do hotsite promete alunos ilimitados.

### [ELITE]-10 Lojas e RevenueCat (manual, com roteiro na entrega)
- Play Console: criar assinatura `nutrion_prof_elite` (plano base mensal, R$ 49,90); trocar a descrição do
  Premium para "até 20 alunos".
- RevenueCat: entitlement `elite`, produto ligado a ela, package na offering atual.
- Spec iOS (`2026-11-03-publicacao-ios`, M6): os três planos de professor no **mesmo grupo de assinatura**
  da App Store.

### [PREM]-01 Produto Pessoal Premium (comum)
- ENTÃO existe o produto `nutrion_comum_premium` (R$ 29,90/mês), ligado à entitlement `premium` do
  RevenueCat (a mesma do professor Premium — o webhook já mapeia para `tier = 'premium'`).
- ENTÃO o Pessoal Premium inclui tudo do Pessoal Pro + busca de professores + cotas de IA maiores.

### [PREM]-02 Busca de professores exige Pessoal Premium
- QUANDO um usuário `comum` sem tier `premium` ou acima abre "Encontrar professor" (lista ou perfil),
  ENTÃO vê o paywall do Pessoal Premium (`feature: 'coach_discovery'`) em vez da lista.
- QUANDO chama `search_coaches`, `get_coach_public_profile` ou `request_coach` sem o plano, ENTÃO o
  servidor recusa com erro `needs_upgrade` / `coach_discovery` (o gate não pode ser só visual).
- QUANDO o usuário já é `aluno` ou `professor`, ENTÃO o comportamento atual não muda.
- QUANDO a assinatura Premium do comum expira, ENTÃO solicitações já abertas continuam valendo
  (o gate é para buscar e pedir, não para cancelar o que já existe).

### [PREM]-03 Cotas de IA maiores no Premium
- QUANDO o usuário tem **assinatura própria** com tier `premium` ou acima (comum Premium, professor
  Premium ou Elite), ENTÃO as cotas diárias são **chat 20** e **análise de prato 15**.
- QUANDO não tem (free, Pro, trial, aluno que só herda do professor), ENTÃO seguem **chat 10** e **análise 8**.
- ENTÃO as cotas ficam num lugar só (helper compartilhado das edge functions), e a mensagem de limite
  mostra o número da cota do usuário.

### [PREM]-04 Paywall e telas do comum
- QUANDO comum free abre o paywall, ENTÃO vê **Pro e Premium**; comum Pro vê Premium; comum Premium não vê planos.
- QUANDO troca Pro → Premium na Play, ENTÃO é troca de plano (substitui o produto antigo, sem cobrança dupla).
- ENTÃO os textos do Premium pessoal dizem: "Tudo do Pro", "Encontre um professor no app",
  "20 mensagens e 15 análises de prato por dia" (Pro: "10 mensagens e 8 análises por dia").
- ENTÃO `SubscriptionCard` e perfil do comum mostram "Premium" e só oferecem upgrade quando há plano acima.

### [PREM]-05 Painel, hotsite e lojas
- Painel: catálogo ganha "Pessoal Premium" (`nutrion_comum_premium`, R$ 29,90); `catalogPlanFor('comum','premium')`
  passa a existir; plano manual de comum aceita Premium.
- Hotsite: contrato com a coluna/linha do Pessoal Premium, cotas de IA por plano e a regra da busca.
- Play Console: assinatura `nutrion_comum_premium`. RevenueCat: produto ligado à entitlement `premium`.

## Fora do escopo

- Franquia de alunos extras (R$ 2/aluno) e oferta para academias — registrar em `STATE.md`.

## Critério de pronto

- Cada `[ELITE]-XX` com teste (vitest para TS puro, `supabase/tests/*.test.sql` para SQL) ou verificação
  manual registrada.
- `npm test`, `npm run typecheck` e os testes SQL verdes; painel com testes e build verdes.
- Roteiro manual de Play/RevenueCat entregue e conferido com o dev antes de subir a migration em produção
  (a ordem importa: produto na loja e entitlement no RevenueCat **antes** do app novo ir para a loja).
