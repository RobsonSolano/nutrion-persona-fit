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

/** Modelos de texto para failover quando o primário está em surto de 5xx.
 *  `gpt-oss-20b` é da mesma família do default, aceita o mesmo schema JSON e
 *  responde rápido (~2s) — verificado gerando plano válido em 2026-08-27.
 *  Ordem = preferência. O primário é tentado primeiro (com retry); só se ele
 *  cair de vez a cadeia entra. */
export const FALLBACK_TEXT_MODELS = ['openai/gpt-oss-20b'];

/** Status HTTP que valem retry: rate limit e erros de servidor. 4xx (fora
 *  429) é culpa nossa — modelo inválido, body malformado — e não melhora
 *  repetindo. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export function isRetryableGroqStatus(status: number): boolean {
  return RETRYABLE.has(status);
}

/**
 * fetch ao Groq com retry em erro transiente (5xx / 429), no mesmo endpoint.
 * Compartilhado pelo chat-ai (sanity + foto) e disponível pra quem mais
 * precisar. Não faz failover de modelo — quem quiser isso compõe por cima
 * (o plan-generator faz). Não usar em requisição com stream: o corpo é
 * consumido pelo caller.
 */
export async function groqFetchWithRetry(
  url: string,
  apiKey: string,
  body: string,
  maxAttempts = 2,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });
    if (res.ok || attempt >= maxAttempts || !isRetryableGroqStatus(res.status)) {
      return res;
    }
    console.warn(`[groq] ${res.status} na tentativa ${attempt}, repetindo...`);
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, 600 * attempt));
  }
}
