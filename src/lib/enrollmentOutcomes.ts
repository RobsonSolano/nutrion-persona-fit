// Quais desfechos de solicitação o aviso de abertura do app anuncia.
//
// Lógica pura, fora do hook, pra ser testável sem client do Supabase.

type OutcomeLike = {
  coach_id: string;
  status: 'pendente' | 'andamento' | 'efetuado' | 'cancelado';
  seen_by_student_at: string | null;
};

/**
 * Desfechos não vistos que ainda são verdade. Um aceite só é notícia se o
 * aluno continua com aquele professor: aceito e desvinculado antes de abrir
 * o app, "você agora tem professor" seria mentira — quem conta o desvínculo
 * é o aviso de desvínculo. Recusa vale sempre.
 */
export function outcomesToAnnounce<T extends OutcomeLike>(
  requests: T[],
  currentCoachId: string | null,
): T[] {
  return requests.filter((r) => {
    if (r.seen_by_student_at) return false;
    if (r.status === 'cancelado') return true;
    return r.status === 'efetuado' && r.coach_id === currentCoachId;
  });
}
