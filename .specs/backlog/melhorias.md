# Backlog — melhorias

> Ideias e evoluções capturadas fora do escopo da tarefa em andamento.

## Avisos de água distribuídos ao longo do dia (proporcionais à meta)
**Origem:** pedido do dev em 2026-10-01, adiado pra depois de ligar as crons existentes.

**O que ele quer:** se o usuário tem meta de 3 litros, receber **3 avisos de água no dia**, espalhados —
não um lembrete só no fim. A ideia é acompanhar o consumo durante o dia, não cobrar no fim.

**Como é hoje (`cron-water-reminder`):** desenhada pro oposto.
- Roda **1×/dia**, 20h BRT (`0 23 * * *`), e manda **um** push só se o usuário estiver **abaixo de 50%**
  da meta (`GOAL_PCT_THRESHOLD = 0.5`).
- Template fixo, sem IA (decisão consciente: "frase de 'ainda dá tempo' não muda nada com IA").
- `COOLDOWN_HOURS_BY_TYPE.water_reminder = 20` — o comentário no código diz literalmente
  *"garante 1×/dia mesmo se cron rodar duas vezes"*.

**O que precisa mudar (`_shared/pushAi.ts`):**
- `GLOBAL_DAILY_MAX = 3` — teto de pushes/dia **somando todos os tipos**. Três de água sozinhos
  consomem a cota inteira: o usuário deixaria de receber treino, streak e inatividade.
- `GLOBAL_MIN_GAP_MIN = 30` — mínimo entre dois pushes quaisquer.
- Quiet hours 22h–7h: sobram ~15h úteis pra distribuir.

**Duas decisões em aberto, que são do dev:**
1. O teto global sobe (ex: 5–6) ou água ganha cota própria fora dele?
2. Proporcional à meta (3L → 3 avisos; 5L → 5 avisos?) ou fixo em horários (ex: 10h, 15h, 20h
   independente da meta)? Proporcional puro escala feio pra metas altas.

**Dificuldade:** Média. Não é só agendar — mexe na função, no cooldown por tipo e na política global
de rate limit, que vale pra todos os outros pushes.
