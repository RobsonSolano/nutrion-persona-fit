// NutriOn — Edge Function coach-import-workout-ai
// Recebe até 3 imagens (base64) + texto livre descrevendo um ou mais
// treinos. Chama Llama 4 Scout 17B (multimodal) ou Llama 3.3 70B (texto)
// e devolve JSON estruturado com os treinos extraídos. Faz matching
// server-side dos exercícios contra o catálogo global (`exercises`).
//
// NÃO persiste nada. O coach revisa e a edge `coach-save-imported-workout`
// salva depois. Imagens são consumidas só em memória — nunca vão pra storage.

import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_TEXT_MODEL } from '../_shared/groqRetry.ts';
import { getAiCircuitState } from '../_shared/aiCircuit.ts';
import { getEntitlement, needsUpgrade } from '../_shared/entitlement.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
const VISION_MODEL =
  Deno.env.get('GROQ_VISION_MODEL') ??
  'meta-llama/llama-4-scout-17b-16e-instruct';
const TEXT_MODEL = Deno.env.get('GROQ_MODEL') ?? DEFAULT_TEXT_MODEL;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MAX_IMAGES = 3;
const MAX_TEXT_LEN = 4000;
const MATCH_SCORE_THRESHOLD = 0.6;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ImageInput = {
  base64: string;
  mime?: 'image/jpeg' | 'image/png' | 'image/webp';
};
type Body = {
  images?: ImageInput[];
  text?: string;
  destination: 'aluno' | 'template';
  student_id?: string;
};

type Modality =
  | 'musculacao'
  | 'calistenia'
  | 'crossfit'
  | 'corrida'
  | 'generico';

type ExerciseOut = {
  name: string;
  equipment: string | null;
  sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
  duration_min: number | null;
  notes: string | null;
  suggested_group_slug: string;
  matched_exercise_id: string | null;
  match_confidence: 'high' | 'medium' | 'low';
};

type WorkoutOut = {
  name: string;
  modality: Modality;
  group_slug: string | null;
  exercises: ExerciseOut[];
};

const SYSTEM_PROMPT = `Você é um assistente que extrai treinos de fichas em papel, prints de outros apps de treino, planilhas ou descrições livres.

Sua saída deve ser SOMENTE um JSON válido (sem markdown, sem prefixo, sem comentários) no formato:
{
  "workouts": [
    {
      "name": "A" | "Peito/Tríceps" | "Cardio HIIT" | ...,
      "modality": "musculacao" | "calistenia" | "crossfit" | "corrida" | "generico",
      "group_slug": "chest" | "back" | "legs" | "shoulders" | "biceps" | "triceps" | "core" | "full_body" | "cardio" | null,
      "exercises": [
        {
          "name": "Supino reto com barra",
          "equipment": "barra" | "halter" | "máquina" | "cabo" | "peso corporal" | "kettlebell" | null,
          "sets": 4,
          "reps_min": 8,
          "reps_max": 12,
          "duration_min": null,
          "notes": "com pausa de 1s no peito" | null,
          "suggested_group_slug": "chest"
        }
      ]
    }
  ]
}

Regras:
- Se o usuário escreve "A1, A2, A3..." e depois "B1, B2..." significa que A e B são treinos separados.
- Infira modalidade pelos exercícios: barra/halter/máquina = musculacao; peso corporal puro = calistenia; corrida/esteira/HIIT = corrida; mistura de movimentos olímpicos + condicionamento = crossfit; quando ambíguo use generico.
- Infira o grupo muscular de CADA exercício (suggested_group_slug) sempre. Use chest, back, legs, shoulders, biceps, triceps, core, full_body, cardio.
- Se reps vier como número único ("12"), use reps_min=12 e reps_max=12.
- Se reps vier como faixa ("8-12"), use reps_min=8, reps_max=12.
- Se for tempo ("30s", "1min"), preencha duration_min em minutos (30s = null se < 1min ou aproxime para 1).
- Se não houver séries explícitas, deixe sets=null.
- Notas: anote variações importantes (com pausa, lento na descida, unilateral, drop-set, etc).
- NÃO invente exercícios que não estão na entrada. Se não consegue ler, retorne workouts: [].
- Responda em português brasileiro.`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')
    return json({ error: 'Method not allowed' }, 405);
  if (!GROQ_API_KEY) return json({ error: 'missing_secret' }, 500);
  if (!SERVICE_ROLE_KEY) return json({ error: 'missing_service_role' }, 500);

  const startedAt = Date.now();

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing bearer token' }, 401);
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user: caller },
      error: callerErr,
    } = await supabaseAuth.auth.getUser();
    if (callerErr || !caller) return json({ error: 'Unauthorized' }, 401);

    // Só professores podem importar treino via IA.
    const { data: callerProfile } = await supabaseService
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();
    if (callerProfile?.role !== 'professor') {
      return json({ error: 'forbidden', detail: 'Apenas professores.' }, 403);
    }

    // Gating de IA de coach (billing-core).
    const ent = await getEntitlement(supabaseAuth);
    if (!ent.ai_coach) {
      return needsUpgrade('coach_import_workout', CORS);
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return json({ error: 'invalid_body' }, 400);

    const images = (body.images ?? []).slice(0, MAX_IMAGES);
    const text = (body.text ?? '').slice(0, MAX_TEXT_LEN).trim();
    if (images.length === 0 && !text) {
      return json(
        {
          error: 'empty_input',
          detail: 'Envie ao menos uma imagem ou descrição.',
        },
        400,
      );
    }
    if (body.destination === 'aluno' && !body.student_id) {
      return json(
        { error: 'missing_student', detail: 'student_id obrigatório.' },
        400,
      );
    }
    if (body.destination === 'aluno' && body.student_id) {
      // Valida que o aluno é desse coach.
      const { data: student } = await supabaseService
        .from('profiles')
        .select('id, role, coach_id')
        .eq('id', body.student_id)
        .maybeSingle();
      if (
        !student ||
        student.role !== 'aluno' ||
        student.coach_id !== caller.id
      ) {
        return json({ error: 'forbidden' }, 403);
      }
    }

    // Circuit breaker — protege a cota Groq.
    const circuit = await getAiCircuitState(supabaseService);
    if (circuit.open) {
      await logEvent(supabaseService, caller.id, startedAt, {
        status: 'error',
        errorCode: 'circuit_open',
      });
      return new Response(
        JSON.stringify({
          error: 'rate_limit',
          detail:
            'IA temporariamente instável. Aguarda ~1 minuto e tenta de novo.',
          retry_after_seconds: 60,
        }),
        {
          status: 429,
          headers: {
            ...CORS,
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        },
      );
    }

    // Carrega exercícios pra matching (id, name, group_id, modality).
    // Filtro explícito de visibilidade: service role IGNORA RLS, então a
    // policy do banco não vale aqui. Sem isso, o exercício exclusivo de um
    // professor entraria no prompt de outro.
    const { data: catalog } = await supabaseService
      .from('exercises')
      .select('id, name, group_id, modality, equipment')
      .or(`visibility.eq.publico,owner_id.eq.${caller.id}`);
    const exercisesCatalog = (catalog ?? []) as Array<{
      id: string;
      name: string;
      group_id: string;
      modality: Modality;
      equipment: string | null;
    }>;

    // Monta mensagem multimodal.
    const isMultimodal = images.length > 0;
    const modelToUse = isMultimodal ? VISION_MODEL : TEXT_MODEL;

    const userTextParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    userTextParts.push({
      type: 'text',
      text:
        text.length > 0
          ? `Extraia os treinos a partir do material abaixo:\n\n${text}`
          : 'Extraia os treinos a partir das imagens anexadas.',
    });
    for (const img of images) {
      userTextParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${img.mime ?? 'image/jpeg'};base64,${img.base64}`,
        },
      });
    }

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: isMultimodal ? userTextParts : userTextParts[0].text },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
        max_tokens: 2048,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => '');
      console.error('[coach-import-workout-ai] groq error:', groqRes.status, errText);
      if (groqRes.status === 429) {
        const retryHeader = groqRes.headers.get('retry-after');
        const retryAfter = parseRetryAfter(retryHeader) ?? 60;
        await logEvent(supabaseService, caller.id, startedAt, {
          status: 'error',
          errorCode: 'rate_limit',
        });
        return new Response(
          JSON.stringify({
            error: 'rate_limit',
            detail: `Muitas requisições. Aguarda ~${retryAfter}s.`,
            retry_after_seconds: retryAfter,
          }),
          {
            status: 429,
            headers: {
              ...CORS,
              'Content-Type': 'application/json',
              'Retry-After': String(retryAfter),
            },
          },
        );
      }
      await logEvent(supabaseService, caller.id, startedAt, {
        status: 'error',
        errorCode: `groq_${groqRes.status}`,
      });
      return json({ error: 'ai_failed', detail: errText.slice(0, 200) }, 502);
    }

    const groqJson = await groqRes.json();
    const content = groqJson.choices?.[0]?.message?.content ?? '';
    const tokens = groqJson.usage?.total_tokens ?? null;

    let parsed: { workouts?: WorkoutOut[] };
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      console.error('[coach-import-workout-ai] parse error:', err, content);
      await logEvent(supabaseService, caller.id, startedAt, {
        status: 'error',
        errorCode: 'parse_failed',
        tokens,
      });
      return json(
        { error: 'parse_failed', detail: 'IA devolveu formato inválido.' },
        502,
      );
    }

    const workouts = Array.isArray(parsed.workouts) ? parsed.workouts : [];
    const enriched = workouts.map((w) => enrichWorkout(w, exercisesCatalog));

    await logEvent(supabaseService, caller.id, startedAt, {
      status: 'success',
      tokens,
    });

    return json({ workouts: enriched });
  } catch (err) {
    console.error('[coach-import-workout-ai] unexpected:', err);
    return json(
      {
        error: 'internal',
        detail: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});

// =====================================================================
// Matching server-side
// =====================================================================
function enrichWorkout(
  w: WorkoutOut,
  catalog: Array<{
    id: string;
    name: string;
    group_id: string;
    modality: Modality;
    equipment: string | null;
  }>,
): WorkoutOut {
  const enrichedExercises = (w.exercises ?? []).map((ex) => {
    const match = findBestMatch(ex.name, catalog);
    return {
      ...ex,
      matched_exercise_id: match.id,
      match_confidence: match.confidence,
    };
  });
  return { ...w, exercises: enrichedExercises };
}

function findBestMatch(
  name: string,
  catalog: Array<{ id: string; name: string }>,
): { id: string | null; confidence: 'high' | 'medium' | 'low' } {
  const target = normalize(name);
  if (!target) return { id: null, confidence: 'low' };

  let bestId: string | null = null;
  let bestScore = 0;

  for (const c of catalog) {
    const candidate = normalize(c.name);
    if (candidate === target) return { id: c.id, confidence: 'high' };

    const score = jaccardTokens(target, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestId = c.id;
    }
  }

  if (bestScore >= 0.85) return { id: bestId, confidence: 'high' };
  if (bestScore >= MATCH_SCORE_THRESHOLD)
    return { id: bestId, confidence: 'medium' };
  return { id: null, confidence: 'low' };
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[()/,.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'com',
  'de',
  'do',
  'da',
  'no',
  'na',
  'e',
  'o',
  'a',
  'em',
]);

function jaccardTokens(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter((t) => t && !STOPWORDS.has(t)));
  const tb = new Set(b.split(' ').filter((t) => t && !STOPWORDS.has(t)));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

// =====================================================================
// Helpers
// =====================================================================
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const n = Number(header);
  if (Number.isFinite(n)) return Math.ceil(n);
  const ts = Date.parse(header);
  if (Number.isFinite(ts)) {
    return Math.max(1, Math.ceil((ts - Date.now()) / 1000));
  }
  return null;
}

async function logEvent(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  startedAt: number,
  params: {
    status: 'success' | 'error';
    tokens?: number | null;
    errorCode?: string | null;
  },
) {
  const { error } = await supabase.from('ai_usage_log').insert({
    user_id: userId,
    feature: 'coach_import_workout',
    duration_ms: Date.now() - startedAt,
    tokens: params.tokens ?? null,
    status: params.status,
    error_code: params.errorCode ?? null,
  });
  if (error) console.error('[coach-import-workout-ai] log error:', error);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
