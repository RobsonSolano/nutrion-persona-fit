// Regra do alerta de IA para admins. TS puro (sem imports Deno) — testável
// pelo vitest; o cron-ai-quota-alert só conta no banco e chama aiAlertFor.

/** Rate limits por hora a partir dos quais a cota do Groq está em risco. */
export const RATE_LIMIT_THRESHOLD = 10;

/** Falhas de IA por hora a partir das quais algo quebrou (modelo descontinuado,
 *  JSON truncando, Groq fora). Em 2026-11-09 um usuário teve 7 falhas em 2 dias
 *  e só soubemos pelo print dele. */
export const FAILURE_THRESHOLD = 3;

/** error_code gravados em ai_usage_log quando a IA não entregou. O
 *  `sanity_fallback_groq_down` sai como sucesso (o app calculou pela TACO), mas
 *  significa que o Groq caiu. `rate_limit` é contado à parte. */
export const FAILURE_CODES = [
  'groq_api_error',
  'empty_response',
  'parse_failed',
  'circuit_open',
  'circuit_open_fallback',
  'sanity_fallback_groq_down',
];

export function aiAlertFor(counts: {
  rateLimits: number;
  failures: number;
}): { title: string; body: string } | null {
  const failing = counts.failures >= FAILURE_THRESHOLD;
  const quota = counts.rateLimits >= RATE_LIMIT_THRESHOLD;
  if (!failing && !quota) return null;

  const parts = [
    failing ? `${counts.failures} falhas de IA na última hora` : null,
    quota ? `${counts.rateLimits} rate_limits na última hora` : null,
  ].filter(Boolean);
  return {
    title: failing ? 'Persona Fit: IA falhando' : 'Persona Fit: cota IA em risco',
    body: `${parts.join(' · ')}. Verifique os logs do chat-ai e o Groq.`,
  };
}
