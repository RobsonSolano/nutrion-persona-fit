// Resiliência da chamada ao Groq.
//
// POR QUE EXISTE: a geração de plano fazia UMA chamada e desistia no primeiro
// erro. Um 5xx transiente do Groq (servidor sob carga) virava falha dura — e
// como o coach-generate-plan não tem fallback, o professor via "instabilidade"
// no cadastro do aluno. Logs de produção: groq_api_error recorrente, ~8-9s,
// com o modelo funcionando normalmente entre uma falha e outra.
//
// Sem import externo de propósito: fica testável no vitest sem arrastar o
// supabase-js do plan-generator.

/** Modelo de texto padrão. NÃO usar mais `llama-3.3-70b-versatile`: foi
 *  descontinuado no Groq (404 model_not_found). Produção sobrepõe via secret
 *  GROQ_MODEL; este default só vale se o secret cair — e aí precisa ser um
 *  modelo que exista. Verificado disponível na conta em 2026-08-27. */
export const DEFAULT_TEXT_MODEL = 'openai/gpt-oss-120b';

/** Status HTTP que valem retry: rate limit e erros de servidor. 4xx (fora
 *  429) é culpa nossa — modelo inválido, body malformado — e não melhora
 *  repetindo. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export function isRetryableGroqStatus(status: number): boolean {
  return RETRYABLE.has(status);
}
