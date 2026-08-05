# Sanity Check — limite diário 8 + aviso amigável de cota

## Contexto
O sanity check (análise de prato por IA) tem cota diária fixa aplicada no servidor
(`chat-ai`, `DAILY_SANITY_CHECK_LIMIT`). Hoje o limite é 5 e, ao estourar, o app
mostra o **alerta de erro genérico** (`alert.showError`) — passa sensação de
bug/falha. Além disso, 5/dia é curto para quem está em bulking (6-7 refeições).

## Requisitos

- **[SANITY]-01** — O limite diário de sanity check passa de **5 para 8**.
  - QUANDO um usuário com direito a IA faz análises de prato no dia,
    ENTÃO pode fazer até **8** com sucesso antes de bater a cota.
  - Fonte da verdade da cota: servidor (`chat-ai`). O cliente **espelha** a constante
    (`src/services/aiUsage.ts`) para o check proativo e o badge `{used}/{limit}` —
    ambos os lados sobem para 8 (senão o app bloqueia/mostra 5).

- **[SANITY]-02** — Ao estourar a cota (429 `daily_limit`), o app mostra um
  **aviso informativo amigável**, não o alerta de erro vermelho.
  - QUANDO o servidor responde 429 `{ error: 'daily_limit', limit }` numa análise,
    ENTÃO o app exibe um alerta com título/tom positivo e o texto
    "Você já usou suas {limit} análises de prato de hoje. Elas renovam amanhã — te espero lá! 🙌".
  - O `{limit}` vem do servidor (dinâmico) — se o limite mudar no futuro, o texto acompanha sem novo OTA.
  - QUANDO o erro é qualquer outro (não `daily_limit`), ENTÃO segue no `alert.showError` atual.
  - Cota **não** vai para o Sentry (agora via tipo, não regex de texto).

## Fora de escopo
- Aviso proativo ao abrir a tela já no limite.
- Adoção pelo chat (só deixar o erro tipado reutilizável).
- Mudança na cota de chat (10 msgs/dia).

## Entrega
- `[SANITY]-01`: editar `chat-ai` + `supabase functions deploy chat-ai` (não é OTA).
- `[SANITY]-02`: JS do app → `eas update` (OTA). Sem novo binário/release Play.

## Rastreabilidade
| Req | Teste | Status |
|---|---|---|
| SANITY-01 | constantes 5→8 (client `aiUsage.ts` + server `chat-ai`) — deploy pendente | Implemented |
| SANITY-02 | `dailyLimit.test.ts` (5 casos: parser → DailyLimitError) | Verified |
