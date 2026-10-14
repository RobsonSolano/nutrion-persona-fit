// Desvínculo professor↔aluno — comum aos dois caminhos:
//   coach-unlink-student → o professor desvincula o aluno
//   student-leave-coach  → o aluno encerra o acompanhamento ([TRAN]-10)
//
// Os passos de privacidade (perfil volta a comum, notas e histórico de
// planos saem do alcance do professor, aviso pro outro lado, aceite não
// visto encerrado) rodam numa transação só, na RPC unlink_coach_student:
// ou acontece tudo, ou nada. Depois, best-effort e em paralelo, o trial de
// servidor ([TRIAL]-03) e a reconciliação de vagas do professor.
//
// Precisa do client service_role — o trigger guard_role_changes reverte
// role/coach_id vindos de authenticated.

import type { SupabaseClient } from '@supabase/supabase-js';

export type DesvinculoInput = {
  studentId: string;
  coachId: string;
  coachName: string | null;
  studentName: string | null;
  initiatedBy: 'coach' | 'student';
  reason?: string | null;
};

export type DesvinculoResult =
  | { ok: true; trialGranted: boolean }
  | { ok: false; error: string };

export async function desvincular(
  // deno-lint-ignore no-explicit-any
  supa: SupabaseClient<any, 'public', any>,
  input: DesvinculoInput,
  logTag: string,
): Promise<DesvinculoResult> {
  const { error } = await supa.rpc('unlink_coach_student', {
    p_student_id: input.studentId,
    p_coach_id: input.coachId,
    p_initiated_by: input.initiatedBy,
    p_reason: input.reason ?? null,
    p_coach_name: input.coachName,
    p_student_name: input.studentName,
  });
  if (error) return { ok: false, error: error.message };

  const [trial, sync] = await Promise.allSettled([
    supa.rpc('grant_server_trial', { p_uid: input.studentId }),
    supa.rpc('sync_coach_student_access', { p_coach_id: input.coachId }),
  ]);
  if (trial.status === 'rejected') console.error(`[${logTag}] grant_server_trial:`, trial.reason);
  if (sync.status === 'rejected') console.error(`[${logTag}] sync_coach_student_access:`, sync.reason);
  else if (sync.value.error) console.error(`[${logTag}] sync_coach_student_access:`, sync.value.error.message);

  return {
    ok: true,
    trialGranted: trial.status === 'fulfilled' && trial.value.data === 'granted',
  };
}

/** Dias inteiros desde um timestamp ISO (0 se nulo ou no futuro). */
export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
