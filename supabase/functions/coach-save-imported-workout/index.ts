// NutriOn — Edge Function coach-save-imported-workout
// Recebe o payload final (revisado pelo coach) de uma importação via IA
// e persiste atomicamente:
//   1. Exercícios marcados como `new` viram entradas no catálogo `exercises`
//      (idempotente via UNIQUE(group_id, name) — se já existe, reusa).
//   2. Cada workout vira uma `workout_routine` (destination='aluno') ou
//      `workout_template` (destination='template'), com seus filhos.
//   3. Em falha parcial, faz rollback dos artefatos criados nessa sessão.

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

type Modality =
  | 'musculacao'
  | 'calistenia'
  | 'crossfit'
  | 'corrida'
  | 'generico';

type SavedExerciseRef =
  | { kind: 'existing'; exercise_id: string }
  | {
      kind: 'new';
      name: string;
      group_slug: string;
      modality: Modality;
      equipment?: string | null;
    };

type SavedExercise = {
  ref: SavedExerciseRef;
  exercise_name: string;
  equipment: string | null;
  sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
  duration_min: number | null;
  notes: string | null;
};

type SavedWorkout = {
  name: string;
  modality: Modality;
  group_slug: string | null;
  description?: string | null;
  exercises: SavedExercise[];
};

type Body = {
  destination: 'aluno' | 'template';
  student_id?: string;
  workouts: SavedWorkout[];
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')
    return json({ error: 'Method not allowed' }, 405);
  if (!SERVICE_ROLE_KEY) return json({ error: 'missing_service_role' }, 500);

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

    const { data: callerProfile } = await supabaseService
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();
    if (callerProfile?.role !== 'professor') {
      return json({ error: 'forbidden', detail: 'Apenas professores.' }, 403);
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body || !Array.isArray(body.workouts) || body.workouts.length === 0) {
      return json({ error: 'invalid_body' }, 400);
    }
    if (body.destination === 'aluno' && !body.student_id) {
      return json({ error: 'missing_student' }, 400);
    }
    if (body.destination === 'aluno' && body.student_id) {
      const { data: student } = await supabaseService
        .from('profiles')
        .select('role, coach_id')
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

    // Carrega grupos pra resolver slug → id.
    const { data: groups } = await supabaseService
      .from('exercise_groups')
      .select('id, slug');
    const groupBySlug = new Map<string, string>();
    for (const g of groups ?? []) groupBySlug.set(g.slug as string, g.id as string);

    // Passo 1: cria/garante exercícios novos no catálogo.
    // Coleta apenas os refs.kind==='new' únicos por (group_slug, name).
    type NewKey = string;
    const newExerciseRefs = new Map<NewKey, SavedExerciseRef & { kind: 'new' }>();
    for (const w of body.workouts) {
      for (const ex of w.exercises ?? []) {
        if (ex.ref.kind === 'new') {
          const key = `${ex.ref.group_slug}::${ex.ref.name.trim().toLowerCase()}`;
          if (!newExerciseRefs.has(key)) {
            newExerciseRefs.set(key, ex.ref);
          }
        }
      }
    }

    const createdExerciseIds: string[] = [];
    const exerciseIdByNewKey = new Map<NewKey, string>();

    try {
      for (const [key, ref] of newExerciseRefs) {
        const groupId = groupBySlug.get(ref.group_slug);
        if (!groupId) {
          throw new Error(`group_slug_invalido: ${ref.group_slug}`);
        }
        // Tenta criar; se já existe, busca o existente pra reusar.
        const insertRes = await supabaseService
          .from('exercises')
          .insert({
            group_id: groupId,
            name: ref.name.trim(),
            equipment: ref.equipment ?? null,
            modality: ref.modality,
            // Quem importou um PDF de treino não pediu pra publicar no
            // catálogo do app inteiro — nasce exclusivo do professor.
            // Antes caía no catálogo global anonimamente.
            owner_id: caller.id,
            visibility: 'exclusivo',
            // requires_lower_limbs fica NULL de propósito: ninguém
            // classificou. Null sai dos planos de quem declara restrição
            // (o filtro é eq.false), então falha pro lado seguro.
          })
          .select('id')
          .maybeSingle();

        if (insertRes.data?.id) {
          createdExerciseIds.push(insertRes.data.id as string);
          exerciseIdByNewKey.set(key, insertRes.data.id as string);
          continue;
        }
        // Conflito nos índices parciais de unicidade — busca o existente
        // DENTRO DO ESCOPO VISÍVEL do professor. Sem o filtro, um nome que
        // colide com o exclusivo de outro professor devolveria o id errado.
        const existing = await supabaseService
          .from('exercises')
          .select('id')
          .eq('group_id', groupId)
          .eq('name', ref.name.trim())
          .or(`visibility.eq.publico,owner_id.eq.${caller.id}`)
          .limit(1)
          .maybeSingle();
        if (existing.data?.id) {
          exerciseIdByNewKey.set(key, existing.data.id as string);
        } else if (insertRes.error) {
          throw new Error(
            `exercise_create_failed (${ref.name}): ${insertRes.error.message}`,
          );
        }
      }

      // Passo 2: cria workouts (routine ou template).
      const createdRoutineIds: string[] = [];
      const createdTemplateIds: string[] = [];

      for (const w of body.workouts) {
        const groupId = w.group_slug ? groupBySlug.get(w.group_slug) ?? null : null;

        if (body.destination === 'aluno') {
          const { data: routine, error: rErr } = await supabaseService
            .from('workout_routines')
            .insert({
              user_id: body.student_id!,
              created_by_coach: caller.id,
              name: w.name,
              modality: w.modality,
              group_id: groupId,
              description: w.description ?? null,
            })
            .select('id')
            .single();
          if (rErr || !routine) {
            throw new Error(
              `routine_insert_failed: ${rErr?.message ?? 'unknown'}`,
            );
          }
          createdRoutineIds.push(routine.id as string);

          const rows = (w.exercises ?? []).map((ex, i) =>
            buildChildRow(
              { kind: 'routine', parentId: routine.id as string },
              ex,
              i,
              exerciseIdByNewKey,
            ),
          );
          if (rows.length > 0) {
            const { error: exErr } = await supabaseService
              .from('workout_routine_exercises')
              .insert(rows);
            if (exErr) {
              throw new Error(`routine_exs_insert_failed: ${exErr.message}`);
            }
          }
        } else {
          const { data: tpl, error: tErr } = await supabaseService
            .from('workout_templates')
            .insert({
              coach_id: caller.id,
              name: w.name,
              modality: w.modality,
              group_id: groupId,
              description: w.description ?? null,
            })
            .select('id')
            .single();
          if (tErr || !tpl) {
            throw new Error(
              `template_insert_failed: ${tErr?.message ?? 'unknown'}`,
            );
          }
          createdTemplateIds.push(tpl.id as string);

          const rows = (w.exercises ?? []).map((ex, i) =>
            buildChildRow(
              { kind: 'template', parentId: tpl.id as string },
              ex,
              i,
              exerciseIdByNewKey,
            ),
          );
          if (rows.length > 0) {
            const { error: exErr } = await supabaseService
              .from('workout_template_exercises')
              .insert(rows);
            if (exErr) {
              throw new Error(`template_exs_insert_failed: ${exErr.message}`);
            }
          }
        }
      }

      return json({
        created_routine_ids: createdRoutineIds,
        created_template_ids: createdTemplateIds,
        created_exercises_count: createdExerciseIds.length,
      });
    } catch (innerErr) {
      // Rollback: deleta o que foi criado.
      // Cascade pega os filhos das routines/templates.
      console.error('[coach-save-imported-workout] rollback:', innerErr);
      if (createdExerciseIds.length > 0) {
        await supabaseService
          .from('exercises')
          .delete()
          .in('id', createdExerciseIds);
      }
      const detail =
        innerErr instanceof Error ? innerErr.message : String(innerErr);
      return json({ error: 'save_failed', detail }, 500);
    }
  } catch (err) {
    console.error('[coach-save-imported-workout] unexpected:', err);
    return json(
      {
        error: 'internal',
        detail: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});

function buildChildRow(
  parent: { kind: 'routine' | 'template'; parentId: string },
  ex: SavedExercise,
  index: number,
  exerciseIdByNewKey: Map<string, string>,
) {
  let exerciseId: string | null = null;
  if (ex.ref.kind === 'existing') {
    exerciseId = ex.ref.exercise_id;
  } else {
    const key = `${ex.ref.group_slug}::${ex.ref.name.trim().toLowerCase()}`;
    exerciseId = exerciseIdByNewKey.get(key) ?? null;
  }
  const base = {
    exercise_id: exerciseId,
    exercise_name: ex.exercise_name,
    equipment: ex.equipment,
    sort_order: index,
    sets: ex.sets,
    reps_min: ex.reps_min,
    reps_max: ex.reps_max,
    duration_min: ex.duration_min,
    notes: ex.notes,
  };
  if (parent.kind === 'routine') {
    return { routine_id: parent.parentId, ...base };
  }
  return { template_id: parent.parentId, ...base };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
