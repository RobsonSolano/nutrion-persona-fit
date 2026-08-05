// Detecção do gating de cota diária do billing-core: 429 { error:'daily_limit', limit }.
// Converte o 429 num erro tipado pra UI mostrar um aviso amigável ("acabou por hoje,
// renova amanhã") em vez do alerta de erro genérico. Reutilizável (chat também emite
// esse 429); por ora só o sanity check consome.

export class DailyLimitError extends Error {
  limit: number | null;
  constructor(limit: number | null) {
    super('daily_limit');
    this.name = 'DailyLimitError';
    this.limit = limit;
  }
}

/**
 * Recebe o status e o texto cru do body. Retorna DailyLimitError só quando é o shape
 * exato do billing-core (429 `daily_limit`) — qualquer outro status/erro retorna null
 * e segue o tratamento normal do caller. `limit` vem do servidor (dinâmico).
 */
export function parseDailyLimit(
  status: number,
  bodyText: string,
): DailyLimitError | null {
  if (status !== 429) return null;
  try {
    const b = JSON.parse(bodyText);
    if (b?.error === 'daily_limit') {
      return new DailyLimitError(typeof b.limit === 'number' ? b.limit : null);
    }
  } catch {
    // body não-JSON → não é o nosso shape
  }
  return null;
}
