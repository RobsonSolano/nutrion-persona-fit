// NutriOn — Edge Function student-leave-coach
//
// O aluno encerra o acompanhamento sozinho ([TRAN]-10): sem isso ele fica
// refém — não troca de professor nem volta a usar o app por conta própria
// se o professor não desvincular. Motivo obrigatório (10 a 500 caracteres),
// que o professor lê no aviso de abertura do app ([TRAN]-11).
//
// Mesmos passos do desvínculo pelo professor (_shared/desvinculo.ts); a
// diferença é quem chama, o motivo e quem é avisado.

import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { sendPushAi } from '../_shared/pushAi.ts';
import { daysSince, desvincular } from '../_shared/desvinculo.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const REASON_MIN = 10;
const REASON_MAX = 500;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = { reason?: string | null };

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }
  if (!SERVICE_ROLE_KEY) {
    return json({ error: 'missing_service_role' }, 500);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'unauthorized' }, 401);
    }
    const supaAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supaService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user: caller },
      error: callerErr,
    } = await supaAuth.auth.getUser();
    if (callerErr || !caller) {
      return json({ error: 'unauthorized' }, 401);
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    const reason = (body?.reason ?? '').trim();
    if (reason.length < REASON_MIN) {
      return json(
        { error: 'reason_required', detail: `Escreva o motivo (mínimo ${REASON_MIN} caracteres).` },
        400,
      );
    }
    if (reason.length > REASON_MAX) {
      return json(
        { error: 'reason_too_long', detail: `O motivo pode ter até ${REASON_MAX} caracteres.` },
        400,
      );
    }

    const { data: student, error: studentErr } = await supaService
      .from('profiles')
      .select('id, role, coach_id, full_name, coach_linked_at, coach:coach_id(full_name)')
      .eq('id', caller.id)
      .single();
    if (studentErr || !student) {
      return json({ error: 'profile_not_found' }, 404);
    }
    if (student.role !== 'aluno' || !student.coach_id) {
      return json({ error: 'not_student', detail: 'Você não tem professor no momento.' }, 409);
    }
    const coachId = student.coach_id as string;

    const coachName =
      ((student.coach as { full_name?: string | null } | null)?.full_name as string | null) ?? null;

    const result = await desvincular(
      supaService,
      {
        studentId: caller.id,
        coachId,
        coachName,
        studentName: (student.full_name as string | null) ?? null,
        initiatedBy: 'student',
        reason,
      },
      'student-leave',
    );
    if (!result.ok) {
      return json({ error: 'leave_failed', detail: result.error }, 500);
    }

    // Push pro professor (fire-and-forget) — só antecipa; a fonte é o aviso
    // de abertura do app.
    void sendPushAi(supaService, coachId, 'student_left_coach', {
      student_name: (student.full_name as string | null) ?? 'Um aluno',
      days_with_coach: daysSince(student.coach_linked_at as string | null),
      reason,
    }).catch((err) => {
      console.error('[student-leave-coach] push falhou:', err);
    });

    return json({ ok: true, trial_granted: result.trialGranted });
  } catch (err) {
    console.error('[student-leave-coach] unexpected:', err);
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
