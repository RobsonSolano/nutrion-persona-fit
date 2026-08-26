// NutriOn — Edge Function coach-apply-template
// Aplica 1+ templates do coach em um aluno: copia (snapshot) cada template
// pra workout_routines + workout_routine_exercises do aluno, marcando
// `created_by_coach = caller.id` e `source_template_id = template.id`.
//
// Validações:
//   - caller é professor (profiles.role = 'professor')
//   - student é aluno do caller (profiles.coach_id = caller.id, role = 'aluno')
//   - todos os templates pertencem ao caller (workout_templates.coach_id = caller.id)
//
// Retorna { created_routine_ids: string[] }. Em falha no meio da cópia,
// limpa as rotinas já criadas pra evitar lixo no aluno.

import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';

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
  template_ids: string[];
};

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
    if (
      !body?.student_id ||
      !Array.isArray(body?.template_ids) ||
      body.template_ids.length === 0
    ) {
      return json(
        {
          error: 'invalid_body',
          detail: 'student_id e template_ids (>=1) obrigatórios.',
        },
        400,
      );
    }

    // Caller precisa ser professor.
    const { data: callerProfile, error: callerProfileErr } =
      await supabaseService
        .from('profiles')
        .select('role')
        .eq('id', caller.id)
        .single();
    if (callerProfileErr || !callerProfile) {
      return json({ error: 'caller_not_found' }, 404);
    }
    if (callerProfile.role !== 'professor') {
      return json({ error: 'not_a_coach' }, 403);
    }

    // Student precisa ser aluno do caller.
    const { data: student, error: studentErr } = await supabaseService
      .from('profiles')
      .select('id, role, coach_id')
      .eq('id', body.student_id)
      .single();
    if (studentErr || !student) {
      return json({ error: 'student_not_found' }, 404);
    }
    if (student.role !== 'aluno' || student.coach_id !== caller.id) {
      return json({ error: 'not_your_student' }, 403);
    }

    // Templates precisam ser do caller (e não arquivados).
    const { data: templates, error: tplErr } = await supabaseService
      .from('workout_templates')
      .select('*')
      .in('id', body.template_ids)
      .eq('coach_id', caller.id)
      .eq('is_archived', false);
    if (tplErr) {
      return json(
        { error: 'template_fetch_failed', detail: tplErr.message },
        500,
      );
    }
    if (!templates || templates.length !== body.template_ids.length) {
      return json(
        {
          error: 'template_not_found_or_not_yours',
          detail:
            'Algum template solicitado não existe, está arquivado, ou pertence a outro coach.',
        },
        403,
      );
    }

    // Bulk-fetch dos exercícios de todos os templates de uma vez (evita N+1).
    const { data: allTplExs, error: allTplExsErr } = await supabaseService
      .from('workout_template_exercises')
      .select('*')
      .in('template_id', body.template_ids)
      .order('template_id, sort_order', { ascending: true });
    if (allTplExsErr) {
      return json(
        {
          error: 'template_exercises_fetch_failed',
          detail: allTplExsErr.message,
        },
        500,
      );
    }

    const exercisesByTemplate = new Map<string, typeof allTplExs>();
    for (const ex of allTplExs ?? []) {
      const arr = exercisesByTemplate.get(ex.template_id) ?? [];
      arr.push(ex);
      exercisesByTemplate.set(ex.template_id, arr);
    }

    // Cria routines sequencialmente — paralelizar complica o cleanup
    // em falha parcial e o ganho é marginal pra 1-5 templates.
    const created_routine_ids: string[] = [];

    try {
      for (const tpl of templates) {
        const { data: routine, error: rErr } = await supabaseService
          .from('workout_routines')
          .insert({
            user_id: body.student_id,
            created_by_coach: caller.id,
            source_template_id: tpl.id,
            name: tpl.name,
            modality: tpl.modality,
            group_id: tpl.group_id,
            description: tpl.description,
          })
          .select('id')
          .single();
        if (rErr || !routine) {
          throw new Error(
            `routine_insert_failed: ${rErr?.message ?? 'unknown'}`,
          );
        }
        created_routine_ids.push(routine.id as string);

        const tplExs = exercisesByTemplate.get(tpl.id) ?? [];
        if (tplExs.length > 0) {
          const rows = tplExs.map((ex, i) => ({
            routine_id: routine.id,
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise_name,
            equipment: ex.equipment,
            sort_order: ex.sort_order ?? i,
            sets: ex.sets,
            reps_min: ex.reps_min,
            reps_max: ex.reps_max,
            weight_min_kg: ex.weight_min_kg,
            weight_max_kg: ex.weight_max_kg,
            duration_min: ex.duration_min,
            // Métricas de cárdio (CAR-08): sem estes campos, um template com
            // esteira era aplicado no aluno como exercício de FORÇA — a
            // distância e a cadência ficavam null e só o tempo sobrevivia.
            metric_type: ex.metric_type ?? 'strength',
            distance_min_m: ex.distance_min_m ?? null,
            distance_max_m: ex.distance_max_m ?? null,
            cadence_rpm: ex.cadence_rpm ?? null,
            notes: ex.notes,
          }));
          const { error: exInsErr } = await supabaseService
            .from('workout_routine_exercises')
            .insert(rows);
          if (exInsErr) {
            throw new Error(
              `exercises_insert_failed: ${exInsErr.message}`,
            );
          }
        }
      }
    } catch (innerErr) {
      // Cascade em workout_routine_exercises.routine_id remove os filhos.
      if (created_routine_ids.length > 0) {
        await supabaseService
          .from('workout_routines')
          .delete()
          .in('id', created_routine_ids);
      }
      const detail =
        innerErr instanceof Error ? innerErr.message : String(innerErr);
      return json({ error: 'apply_failed', detail }, 500);
    }

    return json({ created_routine_ids });
  } catch (err) {
    console.error('[coach-apply-template] unexpected error:', err);
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
