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
 *  Ordem = preferência. Usado pelo plan-generator e, via textModelChain, pelo
 *  chat-ai. */
export const FALLBACK_TEXT_MODELS = ['openai/gpt-oss-20b'];

/** Status HTTP que valem retry: rate limit e erros de servidor. 4xx (fora
 *  429) é culpa nossa — modelo inválido, body malformado — e não melhora
 *  repetindo. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export function isRetryableGroqStatus(status: number): boolean {
  return RETRYABLE.has(status);
}

/**
 * 400 `json_validate_failed`: o JSON mode do Groq gerou algo que não é JSON
 * válido (cortado no max_tokens ou malformado) e a própria API recusa devolver.
 * Não é body ruim nosso: é variância de geração, e outra tentativa costuma
 * passar. Comunidade do Groq relata ~10% disso no gpt-oss com JSON mode; em
 * 2026-11-09 chegou ao usuário como "502 · 400: Failed to validate JSON".
 */
export function isJsonValidateFailed(status: number, bodyText: string): boolean {
  return status === 400 && groqErrorCode(bodyText) === 'json_validate_failed';
}

/** Modelo que a Groq tirou do ar (`model_not_found` / `model_decommissioned`).
 *  Já aconteceu duas vezes (llama-3.3, llama-4-scout). Repetir no mesmo modelo
 *  não adianta, mas o próximo da cadeia responde — sem isso, a retirada de um
 *  modelo derruba a feature até alguém trocar o secret. */
export function isModelGone(bodyText: string): boolean {
  const code = groqErrorCode(bodyText);
  return code === 'model_not_found' || code === 'model_decommissioned';
}

function groqErrorCode(bodyText: string): string | undefined {
  try {
    return JSON.parse(bodyText)?.error?.code;
  } catch {
    return undefined;
  }
}

/**
 * `reasoning_effort` certo por família de modelo, ou undefined quando o modelo
 * não raciocina (mandar o parâmetro a um modelo sem raciocínio dá 400).
 *
 * Nos modelos de raciocínio o "pensamento" sai do MESMO max_tokens da resposta.
 * - gpt-oss (texto): o default é `medium`, que num prompt de conta item a item
 *   come o orçamento e trunca o JSON. Aceita low/medium/high, não `none`.
 * - qwen (visão): `none` desliga o raciocínio de vez.
 */
export function reasoningEffortFor(model: string): 'low' | 'none' | undefined {
  if (model.startsWith('openai/gpt-oss')) return 'low';
  if (model.startsWith('qwen/')) return 'none';
  return undefined;
}

/** Cadeia de modelos de texto: o primário e os fallbacks, sem repetir. Não
 *  inclui o modelo de visão de propósito: foto não tem fallback, e gastar a
 *  cota dele com texto derruba a próxima análise com foto. */
export function textModelChain(primary: string): string[] {
  return [...new Set([primary, ...FALLBACK_TEXT_MODELS])];
}

/** Corpo da requisição para um modelo: o payload + `model` + o
 *  `reasoning_effort` certo para a família. Toda chamada ao Groq passa por
 *  aqui, então nenhum caller precisa lembrar da regra do raciocínio. */
export function groqBody(payload: Record<string, unknown>, model: string): string {
  const effort = reasoningEffortFor(model);
  return JSON.stringify({
    ...payload,
    model,
    ...(effort ? { reasoning_effort: effort } : {}),
  });
}

type FailoverOptions = {
  /** Base do backoff entre tentativas no mesmo modelo (ms). Teste usa 0. */
  backoffMs?: number;
};

/**
 * fetch síncrono ao Groq percorrendo `models` em ordem. Devolve a resposta e
 * QUAL modelo respondeu (para log e telemetria).
 *
 * Tentativas: 1 por modelo quando há fallback; 3 quando o modelo é o único
 * (visão). No free tier cada modelo tem ~8k tokens/min e cada análise reserva
 * ~5k, então repetir no mesmo modelo logo em seguida quase sempre dá 429: o
 * próximo modelo, com a cota dele livre, é a tentativa que vale.
 *
 * Passa adiante em 5xx, 429, `json_validate_failed` e modelo descontinuado;
 * em cadeia de um modelo só, repete 5xx e `json_validate_failed`, e 429/modelo
 * morto voltam na hora. Qualquer outro 4xx volta na hora (é erro nosso).
 *
 * A resposta de erro devolvida tem o body intacto para o caller ler. Não usar
 * com stream.
 */
export async function groqFetchWithFailover(
  url: string,
  apiKey: string,
  models: string[],
  payload: Record<string, unknown>,
  { backoffMs = 600 }: FailoverOptions = {},
): Promise<{ res: Response; model: string }> {
  const attempts = models.length === 1 ? 3 : 1;
  let last = { model: models[0], status: 0, text: '', headers: new Headers() };
  const failure = () => ({
    res: new Response(last.text, { status: last.status, headers: last.headers }),
    model: last.model,
  });

  for (const model of models) {
    const body = groqBody(payload, model);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      });
      if (res.ok) return { res, model };

      const text = await res.text().catch(() => '');
      last = { model, status: res.status, text, headers: res.headers };
      // 429 e modelo morto: este modelo não vai responder agora, vai pro
      // próximo sem repetir. 5xx e json_validate_failed: pode repetir nele.
      const nextModel = res.status === 429 || isModelGone(text);
      if (
        !nextModel &&
        !isRetryableGroqStatus(res.status) &&
        !isJsonValidateFailed(res.status, text)
      ) {
        return failure();
      }
      console.warn(
        `[groq] ${model} ${res.status} na tentativa ${attempt}: ${text.slice(0, 300)}`,
      );
      if (nextModel) break;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, backoffMs * attempt));
      }
    }
  }
  return failure();
}
