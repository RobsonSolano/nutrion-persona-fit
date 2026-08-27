// NutriOn — Edge Function coach-create-student
// Permite que um professor crie a conta de um aluno com ficha completa
// já preenchida. O aluno entra no app sem passar pelo onboarding —
// `onboarding_completed_at` é setado nesta função.
//
// Fluxo:
// 1. Auth via JWT do professor + valida que caller.role='professor'
// 2. Valida limite (coaches.max_students vs count atual de alunos)
// 3. Cria auth.users via service_role (admin.createUser, email_confirm=true)
// 4. Trigger handle_new_user cria profile vazio
// 5. Update profile com role='aluno', coach_id, ficha completa, marcado
//    como onboarding_completed_at = now()
// 6. Retorna { student }

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
  email: string;
  password: string;
  full_name: string;
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
  allergies?: string | null;
  physical_limitations?: string | null;
  has_disability?: boolean | null;
  disability_types?: string[] | null;
  disability_notes?: string | null;
  bio?: string | null;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!SERVICE_ROLE_KEY) {
    return json(
      { error: 'missing_service_role', detail: 'SERVICE_ROLE_KEY ausente.' },
      500,
    );
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

    // 1. Caller precisa ser professor.
    const { data: callerProfile, error: cpErr } = await supabaseService
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();
    if (cpErr || callerProfile?.role !== 'professor') {
      return json(
        { error: 'forbidden', detail: 'Apenas professores podem cadastrar alunos.' },
        403,
      );
    }

    // 2. Body validation.
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body || !body.email || !body.password || !body.full_name) {
      return json(
        { error: 'invalid_body', detail: 'email, password e full_name são obrigatórios.' },
        400,
      );
    }
    if (body.password.length < 8) {
      return json(
        { error: 'weak_password', detail: 'A senha precisa ter pelo menos 8 caracteres.' },
        400,
      );
    }

    // 3. Limite de alunos (entitlement vs count atual).
    const ent = await getEntitlement(supabaseAuth);
    const { count: studentsCount } = await supabaseService
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', caller.id)
      .eq('role', 'aluno');
    if (ent.student_limit !== null && (studentsCount ?? 0) >= ent.student_limit) {
      return needsUpgrade('student_limit', CORS);
    }

    // 4. Cria auth.users (já confirmado, sem flow de email).
    const email = body.email.trim().toLowerCase();
    const { data: created, error: createErr } =
      await supabaseService.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.full_name.trim() },
      });
    if (createErr || !created.user) {
      const detail = createErr?.message ?? 'unknown';
      const isDup = /already|exists|registered/i.test(detail);
      return json(
        {
          error: isDup ? 'email_already_registered' : 'create_user_failed',
          detail,
        },
        isDup ? 409 : 500,
      );
    }

    const studentId = created.user.id;
    const now = new Date().toISOString();

    // 5. Update profile do aluno (trigger handle_new_user já criou linha vazia).
    const { data: student, error: updateErr } = await supabaseService
      .from('profiles')
      .update({
        role: 'aluno',
        coach_id: caller.id,
        full_name: body.full_name.trim(),
        sex: body.sex ?? null,
        birth_year: body.birth_year ?? null,
        weight_kg: body.weight_kg ?? null,
        height_cm: body.height_cm ?? null,
        goal_type: body.goal_type ?? null,
        goal_weight_kg: body.goal_weight_kg ?? null,
        goal_target_date: body.goal_target_date ?? null,
        practices_sport: body.practices_sport ?? null,
        sports: body.sports ?? null,
        weekly_frequency: body.weekly_frequency ?? null,
        water_goal_ml: body.water_goal_ml ?? null,
        allergies: body.allergies?.trim() || null,
        physical_limitations: body.physical_limitations?.trim() || null,
        has_disability: body.has_disability ?? null,
        disability_types: body.disability_types ?? [],
        disability_notes: body.disability_notes?.trim() || null,
        bio: body.bio?.trim() || null,
        onboarding_completed_at: now,
        onboarding_skipped_at: null,
      })
      .eq('id', studentId)
      .select('*')
      .single();

    if (updateErr) {
      // Tenta rollback (deletar auth.users criado) pra não deixar lixo.
      await supabaseService.auth.admin.deleteUser(studentId).catch(() => {});
      return json(
        { error: 'profile_update_failed', detail: updateErr.message },
        500,
      );
    }

    return json({ student });
  } catch (err) {
    console.error('[coach-create-student] unexpected error:', err);
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
