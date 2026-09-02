// NutriOn — Edge Function coach-update-student
// Permite que o professor edite a ficha de um aluno (peso, altura,
// objetivo, modalidades, etc). Usa service_role pra driblar a RLS de
// profiles que limita UPDATE a auth.uid() = id.
//
// Não permite mudar role nem coach_id — esses campos são protegidos
// (a trigger guard_role_changes silencia, mas service_role bypassa o
// trigger; por isso o whitelist explícito).

import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { getEntitlement, needsUpgrade } from '../_shared/entitlement.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = {
  student_id: string;
  patch: {
    full_name?: string | null;
    sex?: 'm' | 'f' | 'o' | null;
    birth_year?: number | null;
    weight_kg?: number | null;
    height_cm?: number | null;
    goal_type?:
      | 'lose_fat'
      | 'maintain'
      | 'gain_muscle'
      | 'reduce_body_fat'
      | null;
    goal_weight_kg?: number | null;
    goal_target_date?: string | null;
    practices_sport?: boolean | null;
    sports?: string[] | null;
    weekly_frequency?: string | null;
    water_goal_ml?: number | null;
    daily_calorie_goal?: number | null;
    protein_goal_g?: number | null;
    carbs_goal_g?: number | null;
    allergies?: string | null;
    physical_limitations?: string | null;
    has_disability?: boolean | null;
    disability_types?: string[] | null;
    disability_notes?: string | null;
    bio?: string | null;
  };
};

const ALLOWED_KEYS = new Set<keyof Body['patch']>([
  'full_name',
  'sex',
  'birth_year',
  'weight_kg',
  'height_cm',
  'goal_type',
  'goal_weight_kg',
  'goal_target_date',
  'practices_sport',
  'sports',
  'weekly_frequency',
  'water_goal_ml',
  'daily_calorie_goal',
  'protein_goal_g',
  'carbs_goal_g',
  'allergies',
  'physical_limitations',
  'has_disability',
  'disability_types',
  'disability_notes',
  'bio',
]);

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!SERVICE_ROLE_KEY) {
    return json({ error: 'missing_service_role' }, 500);
  }

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

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body?.student_id || !body?.patch) {
      return json(
        { error: 'invalid_body', detail: 'student_id e patch obrigatórios.' },
        400,
      );
    }

    // Valida que aluno existe e é do professor.
    const { data: student, error: studentErr } = await supabaseService
      .from('profiles')
      .select('id, role, coach_id, daily_calorie_goal, protein_goal_g, carbs_goal_g, water_goal_ml')
      .eq('id', body.student_id)
      .single();
    if (studentErr || !student) {
      return json({ error: 'student_not_found' }, 404);
    }
    if (student.role !== 'aluno' || student.coach_id !== caller.id) {
      return json({ error: 'forbidden' }, 403);
    }

    // Whitelist: apenas as keys permitidas. Ignora outras silenciosamente
    // (caller pode mandar role/coach_id; a gente nunca aplica).
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body.patch)) {
      if (ALLOWED_KEYS.has(k as keyof Body['patch'])) {
        sanitized[k] = v;
      }
    }
    if (Object.keys(sanitized).length === 0) {
      return json({ error: 'empty_patch', detail: 'Nada pra atualizar.' }, 400);
    }

    // Editar META (kcal/proteína/carbo/água) é recurso de professor pago.
    // Só barra se o valor REALMENTE muda — assim o free segue editando
    // nome/peso/etc pelo mesmo endpoint sem tropeçar (o editar.tsx manda as
    // metas mesmo quando o coach não mexeu nelas).
    const GOAL_KEYS = [
      'daily_calorie_goal',
      'protein_goal_g',
      'carbs_goal_g',
      'water_goal_ml',
    ] as const;
    const mudaMeta = GOAL_KEYS.some(
      (k) => k in sanitized && sanitized[k] !== (student as Record<string, unknown>)[k],
    );
    if (mudaMeta) {
      const ent = await getEntitlement(supabaseAuth);
      if (!ent.ai_coach) {
        return needsUpgrade('coach_edit_goals', CORS);
      }
    }

    const { data: updated, error: updateErr } = await supabaseService
      .from('profiles')
      .update(sanitized)
      .eq('id', body.student_id)
      .select('*')
      .single();
    if (updateErr) {
      return json(
        { error: 'update_failed', detail: updateErr.message },
        500,
      );
    }

    return json({ student: updated });
  } catch (err) {
    console.error('[coach-update-student] unexpected error:', err);
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
