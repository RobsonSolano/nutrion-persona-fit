# Suporte e sugestões — spec

**Data:** 2026-10-15 · **Repos:** `app` (banco, edge, telas) + `painel` (caixa de entrada)

## Objetivo
Qualquer pessoa do app (usuário comum, aluno, professor) manda suporte ou sugestão pelo Perfil, com
título e descrição; o dev recebe no painel separado por papel e tipo, responde por lá, e a pessoa vê
a resposta no app e recebe um push.

## Decisões
- **Resposta pelo painel**, com situação `aberta | respondida | resolvida`. A pessoa vê a resposta em
  "Suporte e sugestões" e recebe push (edge `admin-support-update`). Mudar só a situação não avisa.
- **Aviso pro dev só no painel** (contador no menu e no dashboard), sem e-mail.
- **Papel gravado pelo banco** (`send_support_message` lê do perfil) — o client não informa.
- **Anti-spam:** 10 mensagens por pessoa por dia.
- App só **lê** as próprias mensagens (RLS); toda escrita vai por RPC.
- Resposta nova volta a ser "não lida" (badge no Perfil) até a pessoa abrir.

## Requisitos
| ID | Requisito | Status |
|---|---|---|
| [SUP]-01 | Enviar suporte/sugestão com título (3–120) e descrição (1–2000), papel gravado do perfil | Verified |
| [SUP]-02 | Validações (tipo, título, descrição) e anônimo barrado | Verified |
| [SUP]-03 | Cada pessoa vê só as próprias mensagens | Verified |
| [SUP]-04 | Limite de 10 mensagens por dia | Verified |
| [SUP]-05 | Painel: lista com filtro por papel, tipo, situação e busca; contadores; só admin | Verified |
| [SUP]-06 | Resposta + situação pelo painel; não lida até a pessoa abrir; push quando a resposta muda | Verified |

Testes: `supabase/tests/suporte_sugestoes.test.sql`, `src/lib/support.test.ts`.

## Entrega
1. `db:push` da migration `20261015000000_suporte_sugestoes.sql`.
2. `supabase functions deploy admin-support-update`.
3. OTA do app (telas + entrada no Perfil + rota do push).
4. Deploy do painel na Vercel.
