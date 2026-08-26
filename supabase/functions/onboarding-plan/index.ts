// NutriOn — Edge Function onboarding-plan
// Recebe o perfil preenchido no onboarding e devolve um plano completo
// (metas + rotinas) via Groq.
//
// Lógica de geração foi extraída pra `_shared/plan-generator.ts` e é
// reusada por `coach-generate-plan`. Este handler cuida só de auth,
// cota, logging e response.

import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { generatePlan, type PlanInput } from '../_shared/plan-generator.ts';
import { formatAnamneseForPrompt } from '../_shared/anamneseFormatter.ts';
import { buildFallbackPlan } from '../_shared/fallbackPlan.ts';
import { getAiCircuitState } from '../_shared/aiCircuit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;

const MODEL = Deno.env.get('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!GROQ_API_KEY) {
    return json(
      {
        error: 'missing_secret',
        detail:
          'GROQ_API_KEY não configurada. Rode: npx supabase secrets set GROQ_API_KEY=gsk_xxx',
      },
      500,
    );
  }

  const startedAt = Date.now();

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing bearer token' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const logEvent = async (params: {
      status: 'success' | 'error' | 'quota_exceeded';
      tokens?: number | null;
      errorCode?: string | null;
    }) => {
      const { error } = await supabase.from('ai_usage_log').insert({
        user_id: user.id,
        feature: 'onboarding_plan',
        duration_ms: Date.now() - startedAt,
        tokens: params.tokens ?? null,
        status: params.status,
        error_code: params.errorCode ?? null,
      });
      if (error) console.error('[onboarding-plan] log error:', error);
    };

    const body = (await req.json()) as PlanInput;
    if (!body || typeof body !== 'object') {
      return json({ error: 'invalid_body' }, 400);
    }

    // Cota: onboarding inicial (até completar pela 1ª vez) é livre.
    // Refazer (após onboarding_completed_at) custa 1 uso por dia.
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select(
        'onboarding_completed_at, coach_id, has_disability, disability_types, disability_notes',
      )
      .eq('id', user.id)
      .single();
    if (profileErr) {
      console.error('[onboarding-plan] profile fetch error:', profileErr);
    }

    const isInitialOnboarding = !profile?.onboarding_completed_at;

    if (!isInitialOnboarding) {
      const today = new Date().toISOString().slice(0, 10);
      const { count: usedToday, error: usageErr } = await supabase
        .from('ai_usage_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('day', today)
        .eq('feature', 'onboarding_plan')
        .eq('status', 'success');
      if (usageErr) {
        console.error('[onboarding-plan] usage count error:', usageErr);
      }
      if ((usedToday ?? 0) >= 1) {
        await logEvent({ status: 'quota_exceeded' });
        return json(
          {
            error: 'daily_limit',
            detail:
              'Você já refez seu plano hoje. Pra gerar outro, volta amanhã.',
            limit: 1,
          },
          429,
        );
      }
    }

    // Carrega anamnese (não-bloqueante) e injeta no body
    const { data: anamnese } = await supabase
      .from('student_anamneses')
      .select(
        'injuries, injuries_notes, surgeries, chronic_conditions, chronic_conditions_notes, allergy_food, dietary_restrictions, dietary_notes, sport_history, goal_notes, has_medical_clearance, medical_clearance_notes',
      )
      .eq('user_id', user.id)
      .maybeSingle();
    // Compatibilidade de rollout: app instalado antes desta versão não manda
    // os campos de PCD no body. Sem esse fallback, quem regenera o plano por
    // um app antigo perderia o bloqueio de exercício. Body tem precedência
    // porque durante o onboarding ele é o dado mais fresco — o profile só é
    // gravado DEPOIS da geração.
    const inputWithAnamnese: PlanInput = {
      ...body,
      has_disability: body.has_disability ?? profile?.has_disability ?? null,
      disability_types:
        body.disability_types ?? profile?.disability_types ?? null,
      disability_notes:
        body.disability_notes ?? profile?.disability_notes ?? null,
      // Exercício exclusivo que este plano pode usar: o do professor do
      // aluno. Aluno sem professor (autônomo) fica só com o público.
      visible_owner_id: profile?.coach_id ?? null,
      anamnese_summary: formatAnamneseForPrompt(anamnese),
    };

    // Circuit breaker: se Groq está em surto de falhas, pula direto pro fallback.
    const circuit = await getAiCircuitState(supabase);
    if (circuit.open) {
      console.warn(
        `[onboarding-plan] circuit open (${circuit.recentFailures} rate_limits/1min), serving fallback`,
      );
      await logEvent({ status: 'error', errorCode: 'circuit_open_fallback' });
      const fallbackPlan = await buildFallbackPlan(supabase, inputWithAnamnese);
      return json({
        plan: fallbackPlan,
        model: 'fallback',
        is_fallback: true,
        fallback_reason: 'circuit_open',
      });
    }

    const result = await generatePlan(
      supabase,
      GROQ_API_KEY,
      MODEL,
      inputWithAnamnese,
    );

    if (result.error) {
      const e = result.error;
      if (e.kind === 'empty_catalog') {
        await logEvent({ status: 'error', errorCode: 'empty_catalog' });
        return json(
          {
            error: 'empty_catalog',
            detail:
              'Catálogo de exercícios vazio pras modalidades selecionadas. Rode npm run db:push.',
          },
          500,
        );
      }
      if (e.kind === 'rate_limit' || e.kind === 'groq_api_error') {
        // Fallback: gera plano genérico pra não travar o user no onboarding.
        // Plano é marcado como is_fallback pra rastreabilidade.
        await logEvent({
          status: 'error',
          errorCode: e.kind === 'rate_limit' ? 'rate_limit_fallback' : 'groq_api_error_fallback',
        });
        const fallbackPlan = await buildFallbackPlan(supabase, inputWithAnamnese);
        return json({
          plan: fallbackPlan,
          model: 'fallback',
          is_fallback: true,
          fallback_reason: e.kind,
        });
      }
      // parse_failed
      console.error('[onboarding-plan] parse_failed:', e.raw);
      await logEvent({ status: 'error', errorCode: 'parse_failed' });
      return json(
        {
          error: 'parse_failed',
          detail: 'IA não retornou JSON válido. Tenta de novo.',
        },
        502,
      );
    }

    await logEvent({ status: 'success', tokens: result.totalTokens });

    return json({ plan: result.plan, model: MODEL });
  } catch (err) {
    console.error('[onboarding-plan] unexpected error', err);
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
