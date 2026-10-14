// NutriOn — Edge Function coach-unlink-student
//
// Substitui o `coach-delete-student` no fluxo do coach: em vez de
// excluir a conta do aluno (LGPD/loja não permite mais coach deletar),
// transforma o aluno em usuário comum.
//
// Os passos do desvínculo vivem em _shared/desvinculo.ts (mesmos do
// student-leave-coach, quando é o aluno quem sai). Aqui: validar que o
// caller é o professor desse aluno, desvincular e avisar o aluno por push.

import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { sendPushAi } from '../_shared/pushAi.ts';
import { daysSince, desvincular } from '../_shared/desvinculo.ts';

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
};

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
    if (!body?.student_id) {
      return json(
        { error: 'invalid_body', detail: 'student_id obrigatório.' },
        400,
      );
    }

    // Valida ownership: caller é o coach desse aluno.
    const { data: student, error: studentErr } = await supaService
      .from('profiles')
      .select('id, role, coach_id, full_name, coach_linked_at')
      .eq('id', body.student_id)
      .single();
    if (studentErr || !student) {
      return json({ error: 'student_not_found' }, 404);
    }
    if (student.role !== 'aluno' || student.coach_id !== caller.id) {
      return json({ error: 'forbidden' }, 403);
    }

    // Lê nome do coach pra contexto do push (antes de qualquer mudança).
    const { data: coachProfile } = await supaService
      .from('profiles')
      .select('full_name')
      .eq('id', caller.id)
      .single();

    // Desvínculo (transação) + aviso no app + trial + vagas.
    const result = await desvincular(
      supaService,
      {
        studentId: body.student_id,
        coachId: caller.id,
        coachName: (coachProfile?.full_name as string | null) ?? null,
        studentName: (student.full_name as string | null) ?? null,
        initiatedBy: 'coach',
      },
      'coach-unlink',
    );
    if (!result.ok) {
      return json({ error: 'unlink_failed', detail: result.error }, 500);
    }

    // Push pro aluno (fire-and-forget) — só antecipa o aviso no app.
    void sendPushAi(supaService, body.student_id, 'coach_unlinked', {
      coach_name: (coachProfile?.full_name as string | null) ?? 'Seu professor',
      days_with_coach: daysSince(student.coach_linked_at as string | null),
      trial_granted: result.trialGranted,
      trial_days: result.trialGranted ? 7 : 0,
    }).catch((err) => {
      console.error('[coach-unlink] push falhou:', err);
    });

    return json({ ok: true, trial_granted: result.trialGranted });
  } catch (err) {
    console.error('[coach-unlink-student] unexpected:', err);
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
