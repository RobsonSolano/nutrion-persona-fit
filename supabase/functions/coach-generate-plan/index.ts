// NutriOn — Edge Function coach-generate-plan
// Permite que um professor gere um plano (metas + rotinas) pra um aluno
// dele, baseado na ficha JÁ preenchida do aluno (foi salva no
// coach-create-student). Reusa a lógica de IA do _shared/plan-generator.
//
// Cota: livre durante o cadastro do aluno (pode regenerar quantas vezes
// quiser sem cota até o save). Log fica na conta do professor com
// feature='coach_plan'.

import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_TEXT_MODEL } from '../_shared/groqRetry.ts';
import { generatePlan, type PlanInput } from '../_shared/plan-generator.ts';
import { formatAnamneseForPrompt } from '../_shared/anamneseFormatter.ts';
import { getAiCircuitState } from '../_shared/aiCircuit.ts';
import { getEntitlement, needsUpgrade } from '../_shared/entitlement.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
const MODEL = Deno.env.get('GROQ_MODEL') ?? DEFAULT_TEXT_MODEL;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = {
  student_id: string;
  /**
   * Quando `true`, a resposta retorna `routines: []` mesmo que a IA tenha
   * gerado treinos. Usado quando o coach vai aplicar templates da biblioteca
   * em vez de aceitar as rotinas geradas pela IA.
   */
  skip_routines?: boolean;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!GROQ_API_KEY) {
    return json({ error: 'missing_secret', detail: 'GROQ_API_KEY ausente.' }, 500);
  }
  if (!SERVICE_ROLE_KEY) {
    return json({ error: 'missing_service_role' }, 500);
  }

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
    if (callerErr || !caller) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // Gating de IA de coach (billing-core).
    const ent = await getEntitlement(supabaseAuth);
    if (!ent.ai_coach) {
      return needsUpgrade('coach_generate_plan', CORS);
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body?.student_id) {
      return json({ error: 'invalid_body', detail: 'student_id obrigatório.' }, 400);
    }

    // Valida que caller é professor do aluno.
    const { data: student, error: studentErr } = await supabaseService
      .from('profiles')
      .select(
        'id, role, coach_id, full_name, sex, birth_year, weight_kg, height_cm, goal_type, goal_weight_kg, goal_target_date, practices_sport, sports, weekly_frequency, water_goal_ml, allergies, physical_limitations, bio, has_disability, disability_types, disability_notes',
      )
      .eq('id', body.student_id)
      .single();

    if (studentErr || !student) {
      return json(
        { error: 'student_not_found', detail: 'Aluno não encontrado.' },
        404,
      );
    }
    if (student.role !== 'aluno' || student.coach_id !== caller.id) {
      return json(
        {
          error: 'forbidden',
          detail: 'Aluno não pertence a você ou conta não é de aluno.',
        },
        403,
      );
    }

    // Carrega anamnese (não-bloqueante: se falhar, segue sem ela)
    const { data: anamnese } = await supabaseService
      .from('student_anamneses')
      .select(
        'injuries, injuries_notes, surgeries, chronic_conditions, chronic_conditions_notes, allergy_food, dietary_restrictions, dietary_notes, sport_history, goal_notes, has_medical_clearance, medical_clearance_notes',
      )
      .eq('user_id', body.student_id)
      .maybeSingle();
    const anamneseSummary = formatAnamneseForPrompt(anamnese);

    const logEvent = async (params: {
      status: 'success' | 'error';
      tokens?: number | null;
      errorCode?: string | null;
    }) => {
      // Log na conta do professor (caller).
      const { error } = await supabaseService.from('ai_usage_log').insert({
        user_id: caller.id,
        feature: 'coach_plan',
        duration_ms: Date.now() - startedAt,
        tokens: params.tokens ?? null,
        status: params.status,
        error_code: params.errorCode ?? null,
      });
      if (error) console.error('[coach-generate-plan] log error:', error);
    };

    const input: PlanInput = {
      full_name: student.full_name,
      sex: student.sex,
      birth_year: student.birth_year,
      weight_kg: student.weight_kg,
      height_cm: student.height_cm,
      goal_type: student.goal_type,
      goal_weight_kg: student.goal_weight_kg,
      goal_target_date: student.goal_target_date,
      practices_sport: student.practices_sport,
      sports: student.sports,
      weekly_frequency: student.weekly_frequency,
      water_goal_ml: student.water_goal_ml,
      allergies: student.allergies,
      physical_limitations: student.physical_limitations,
      bio: student.bio,
      has_disability: student.has_disability,
      disability_types: student.disability_types,
      disability_notes: student.disability_notes,
      // O caller é o professor do aluno — os exclusivos dele entram.
      visible_owner_id: caller.id,
      anamnese_summary: anamneseSummary,
    };

    // Circuit breaker: coach NÃO recebe fallback (coach quer plano por IA);
    // devolvemos 429 com mensagem amigável e ele tenta de novo em 1min.
    const circuit = await getAiCircuitState(supabaseService);
    if (circuit.open) {
      console.warn(
        `[coach-generate-plan] circuit open (${circuit.recentFailures} rate_limits/1min), refusing call`,
      );
      await logEvent({ status: 'error', errorCode: 'circuit_open' });
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
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        },
      );
    }

    const result = await generatePlan(
      supabaseService,
      GROQ_API_KEY,
      MODEL,
      input,
    );

    if (result.error) {
      const e = result.error;
      if (e.kind === 'empty_catalog') {
        await logEvent({ status: 'error', errorCode: 'empty_catalog' });
        return json({ error: 'empty_catalog', detail: 'Catálogo vazio.' }, 500);
      }
      if (e.kind === 'rate_limit') {
        await logEvent({ status: 'error', errorCode: 'rate_limit' });
        const retryAfter = e.retryAfterSeconds ?? 60;
        return new Response(
          JSON.stringify({
            error: 'rate_limit',
            detail: `Muitas requisições. Aguarda ~${retryAfter}s e tenta de novo.`,
            retry_after_seconds: retryAfter,
          }),
          {
            status: 429,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'application/json',
              'Retry-After': String(retryAfter),
            },
          },
        );
      }
      if (e.kind === 'groq_api_error') {
        await logEvent({ status: 'error', errorCode: 'groq_api_error' });
        return json(
          { error: 'groq_api_error', detail: `${e.status}: ${e.detail}` },
          502,
        );
      }
      console.error('[coach-generate-plan] parse_failed:', e.raw);
      await logEvent({ status: 'error', errorCode: 'parse_failed' });
      return json(
        { error: 'parse_failed', detail: 'IA não retornou JSON válido.' },
        502,
      );
    }

    await logEvent({ status: 'success', tokens: result.totalTokens });

    // skip_routines hoje só descarta as routines da resposta — a IA ainda as
    // gera. Otimização futura: prompt slim pra economizar tokens.
    const finalPlan = body.skip_routines
      ? { ...result.plan, routines: [] }
      : result.plan;

    return json({ plan: finalPlan, model: MODEL });
  } catch (err) {
    console.error('[coach-generate-plan] unexpected error:', err);
    return json(
      {
        error: 'internal_error',
        detail: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
