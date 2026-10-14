// NutriOn — Edge Function coach-respond-enrollment
//
// O professor responde a uma solicitação de contratação. É o espelho do
// `coach-unlink-student`: lá o aluno vira comum, aqui o comum vira aluno.
//
// Precisa de SERVICE_ROLE porque a trigger `guard_role_changes` reverte
// qualquer mudança de role/coach_id feita por authenticated — inclusive
// dentro de função security definer, já que ela olha auth.role() do JWT.
// Não existe caminho pelo cliente, e é essa a intenção.
//
// Ações:
//   andamento → só sinaliza que o professor está tratando com o aluno
//   efetuado  → VINCULA (valida limite + role antes) e dispara push
//   cancelado → recusa; o usuário continua comum e é avisado
//
// Ver .specs/features/2026-08-29-aluno-contrata-professor/spec.md
// [SOLI]-05, [SOLI]-06, [SOLI]-07, [TRAN]-01.

import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { getEntitlement, needsUpgrade } from '../_shared/entitlement.ts';
import { sendPushAi } from '../_shared/pushAi.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Action = 'andamento' | 'efetuado' | 'cancelado';

type Body = {
  request_id: string;
  action: Action;
  cancel_reason?: string | null;
};

const ACTIONS: Action[] = ['andamento', 'efetuado', 'cancelado'];

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
    if (!body?.request_id || !ACTIONS.includes(body.action)) {
      return json(
        {
          error: 'invalid_body',
          detail: 'request_id e action (andamento|efetuado|cancelado) são obrigatórios.',
        },
        400,
      );
    }

    // 1. A solicitação existe e é DESTE professor.
    const { data: request, error: reqErr } = await supaService
      .from('coach_enrollment_requests')
      .select('id, student_id, coach_id, status')
      .eq('id', body.request_id)
      .maybeSingle();
    if (reqErr) {
      console.error('[coach-respond-enrollment] fetch request:', reqErr.message);
      return json({ error: 'request_fetch_failed' }, 500);
    }
    if (!request || request.coach_id !== caller.id) {
      return json({ error: 'not_found' }, 404);
    }
    if (request.status === 'efetuado' || request.status === 'cancelado') {
      return json(
        {
          error: 'already_resolved',
          detail: 'Esta solicitação já foi finalizada.',
        },
        409,
      );
    }

    const now = new Date().toISOString();

    // 2. andamento: só muda o rótulo da fila, nada acontece com a conta.
    if (body.action === 'andamento') {
      const { error } = await supaService
        .from('coach_enrollment_requests')
        .update({ status: 'andamento' })
        .eq('id', request.id);
      if (error) {
        console.error('[coach-respond-enrollment] update andamento:', error.message);
        return json({ error: 'update_failed' }, 500);
      }
      return json({ ok: true, status: 'andamento' });
    }

    const { data: coachProfile } = await supaService
      .from('profiles')
      .select('full_name')
      .eq('id', caller.id)
      .maybeSingle();
    const coachName = (coachProfile?.full_name as string | null) ?? 'Seu professor';

    // 3. cancelado: o usuário continua comum. Não some da lista — vira
    //    histórico e alimenta o aviso na próxima abertura do app.
    if (body.action === 'cancelado') {
      const { error } = await supaService
        .from('coach_enrollment_requests')
        .update({
          status: 'cancelado',
          responded_at: now,
          cancel_reason: body.cancel_reason?.trim()?.slice(0, 300) || null,
        })
        .eq('id', request.id);
      if (error) {
        console.error('[coach-respond-enrollment] update cancelado:', error.message);
        return json({ error: 'update_failed' }, 500);
      }

      void sendPushAi(supaService, request.student_id, 'enrollment_declined', {
        coach_name: coachName,
      }).catch((err) => {
        console.error('[coach-respond-enrollment] push declined:', err);
      });

      return json({ ok: true, status: 'cancelado' });
    }

    // ------------------------------------------------------------------
    // 4. efetuado: é aqui que o vínculo acontece.
    // ------------------------------------------------------------------

    // 4.1 O solicitante ainda precisa ser comum. Entre o envio e o aceite
    //     ele pode ter virado aluno de outro professor — sem esta checagem,
    //     dois professores efetivariam o mesmo usuário e o último ganharia.
    const { data: student, error: studentErr } = await supaService
      .from('profiles')
      .select('id, role, full_name')
      .eq('id', request.student_id)
      .maybeSingle();
    if (studentErr || !student) {
      console.error('[coach-respond-enrollment] fetch student:', studentErr?.message);
      return json({ error: 'student_fetch_failed' }, 500);
    }
    if (student.role !== 'comum') {
      return json(
        {
          error: 'student_unavailable',
          detail:
            student.role === 'aluno'
              ? 'Este usuário já é aluno de um professor.'
              : 'Este usuário não pode virar aluno.',
        },
        409,
      );
    }

    // 4.2 Limite de alunos do tier. Mesma regra do coach-create-student —
    //     o caminho novo não pode ser um atalho pra furar o limite.
    const ent = await getEntitlement(supaAuth);
    const { count: studentsCount } = await supaService
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', caller.id)
      .eq('role', 'aluno');
    if (ent.student_limit !== null && (studentsCount ?? 0) >= ent.student_limit) {
      return needsUpgrade('student_limit', CORS);
    }

    // 4.3 Vincula. Daqui em diante o lock de rotinas (RLS por role='aluno')
    //     já congela a edição do treino que ele tinha como comum.
    const { error: linkErr } = await supaService
      .from('profiles')
      .update({ role: 'aluno', coach_id: caller.id })
      .eq('id', student.id)
      .eq('role', 'comum'); // guarda contra corrida entre a leitura e o update
    if (linkErr) {
      console.error('[coach-respond-enrollment] vincular:', linkErr.message);
      return json({ error: 'link_failed', detail: linkErr.message }, 500);
    }

    const { error: statusErr } = await supaService
      .from('coach_enrollment_requests')
      .update({ status: 'efetuado', responded_at: now })
      .eq('id', request.id);
    if (statusErr) {
      // O vínculo já valeu — reverter deixaria o usuário num limbo pior.
      // Loga alto: a fila fica dessincronizada até alguém olhar.
      console.error(
        '[coach-respond-enrollment] vínculo OK mas status não atualizou:',
        { request_id: request.id, detail: statusErr.message },
      );
    }

    // 4.4 Cancela as outras solicitações abertas desse usuário: ele já tem
    //     professor, e deixar pendências vivas colocaria a mesma pessoa na
    //     fila de vários professores.
    const { error: othersErr } = await supaService
      .from('coach_enrollment_requests')
      .update({
        status: 'cancelado',
        responded_at: now,
        seen_by_student_at: now, // não vira aviso: ele escolheu este professor
        cancel_reason: 'Você foi aceito por outro professor.',
      })
      .eq('student_id', student.id)
      .neq('id', request.id)
      .in('status', ['pendente', 'andamento']);
    if (othersErr) {
      console.error('[coach-respond-enrollment] cancelar outras:', othersErr.message);
    }

    // 4.5 Reconcilia suspensões (o novo aluno pode ocupar a última vaga).
    const { error: syncErr } = await supaService.rpc('sync_coach_student_access', {
      p_coach_id: caller.id,
    });
    if (syncErr) {
      console.error('[coach-respond-enrollment] sync:', syncErr.message);
    }

    void sendPushAi(supaService, student.id, 'enrollment_accepted', {
      coach_name: coachName,
    }).catch((err) => {
      console.error('[coach-respond-enrollment] push accepted:', err);
    });

    return json({ ok: true, status: 'efetuado' });
  } catch (err) {
    console.error('[coach-respond-enrollment] unexpected:', err);
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
