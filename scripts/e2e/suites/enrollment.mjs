// E2E da contratação de professor (comum → aluno).
//
// Cobre o caminho que NÃO dá pra testar em SQL puro: a edge function
// coach-respond-enrollment, que é a única capaz de mexer em role/coach_id
// (a trigger guard_role_changes bloqueia todo o resto).
//
// As RPCs (request_coach, search_coaches, rate_coach) entram aqui também
// porque dependem de auth.uid() — em SQL sem sessão elas só devolvem
// unauthorized.

import { suite, expect } from '../lib/runner.mjs';
import {
  adminClient,
  callFn,
  cleanupUser,
  createTestUser,
  TEST_CREF,
} from '../lib/clients.mjs';

const PHONE = '11999998888';

/** Professor premium, público e completo — o único estado que aparece na busca. */
async function createDiscoverableCoach(ctx, overrides = {}) {
  const coach = await createTestUser({ prefix: 'coach-enr' });
  ctx.defer(() => cleanupUser(coach));

  const res = await callFn('signup-professor', coach.accessToken, {
    bio: 'Professor de teste e2e',
    cref: overrides.cref ?? TEST_CREF,
  });
  expect(res.ok).toBe(true);

  await adminClient
    .from('coaches')
    .update({
      is_public: true,
      state_uf: 'SP',
      city: 'Campinas',
      specialties: ['musculacao', 'crossfit'],
      service_mode: 'presencial',
      ...overrides.coach,
    })
    .eq('id', coach.id);

  // Premium: sem isso o professor não aparece na busca ([DESC]-03).
  await adminClient.from('subscriptions').upsert({
    user_id: coach.id,
    tier: overrides.tier ?? 'premium',
    source: 'store_play',
    status: 'active',
    period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
  });

  return coach;
}

// -------------------------------------------------------------------
// Ciclo de vida do vínculo: o que acontece com plano (assinatura),
// metas, treinos, registros e acesso do professor ao vincular e ao
// desvincular — pelos dois lados.
// -------------------------------------------------------------------

/** Usuário comum com meta, registro de refeição e treino próprio. */
async function usuarioComDados(ctx) {
  const u = await createTestUser({ prefix: 'aluno-ciclo' });
  ctx.defer(() => cleanupUser(u));
  await adminClient.from('profiles').update({ daily_calorie_goal: 2100 }).eq('id', u.id);
  const { error: logErr } = await u.client
    .from('food_logs')
    .insert({ user_id: u.id, meal_name: 'Almoço antes do professor', calories: 650 });
  expect(logErr).toBe(null);
  const { data: routine } = await u.client
    .from('workout_routines')
    .insert({ user_id: u.id, name: 'Treino próprio' })
    .select('id')
    .single();
  return { ...u, routineId: routine.id };
}

async function vincular(coach, student) {
  const { data: req } = await student.client.rpc('request_coach', {
    p_coach_id: coach.id,
    p_contact_phone: PHONE,
  });
  expect(req.ok).toBe(true);
  const res = await callFn('coach-respond-enrollment', coach.accessToken, {
    request_id: req.id,
    action: 'efetuado',
  });
  expect(res.ok).toBe(true);
  return req.id;
}

async function tierDe(user) {
  const { data, error } = await user.client.rpc('resolve_entitlement');
  expect(error).toBe(null);
  return data.tier;
}

/** Pós-condições de qualquer desvínculo, venha de quem vier. */
async function conferirDesvinculado(coach, student) {
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role, coach_id, coach_linked_at, daily_calorie_goal')
    .eq('id', student.id)
    .single();
  expect(profile.role).toBe('comum');
  expect(profile.coach_id).toBe(null);
  expect(profile.coach_linked_at).toBe(null);
  // Metas ficam com ele.
  expect(profile.daily_calorie_goal).toBe(2100);

  // Registros ficam com ele.
  const { data: logs } = await student.client.from('food_logs').select('id');
  expect(logs.length).toBe(1);

  // Treino fica com ele e volta a ser editável.
  const { data: edited } = await student.client
    .from('workout_routines')
    .update({ name: 'Editado depois de sair' })
    .eq('id', student.routineId)
    .select('id');
  expect(edited.length).toBe(1);

  // O professor perde o acesso aos dados dele.
  const { data: perfilVisto } = await coach.client
    .from('profiles')
    .select('id')
    .eq('id', student.id);
  expect(perfilVisto.length).toBe(0);
  const { data: logsVistos } = await coach.client
    .from('food_logs')
    .select('id')
    .eq('user_id', student.id);
  expect(logsVistos.length).toBe(0);

  // Notas privadas do professor sobre ele são apagadas.
  const { data: notas } = await adminClient
    .from('coach_notes')
    .select('id')
    .eq('student_id', student.id);
  expect(notas.length).toBe(0);

  // Histórico de planos fica com o aluno e sai do alcance do professor.
  const { data: revs } = await adminClient
    .from('student_plan_revisions')
    .select('coach_id')
    .eq('student_id', student.id);
  expect(revs.length).toBe(1);
  expect(revs[0].coach_id).toBe(null);
  const { data: revsDoAluno } = await student.client
    .from('student_plan_revisions')
    .select('id');
  expect(revsDoAluno.length).toBe(1);
  const { data: revsDoCoach } = await coach.client
    .from('student_plan_revisions')
    .select('id')
    .eq('student_id', student.id);
  expect(revsDoCoach.length).toBe(0);
}

/** O que o professor produz durante o acompanhamento. */
async function professorTrabalha(coach, student) {
  const { error: noteErr } = await coach.client
    .from('coach_notes')
    .insert({ coach_id: coach.id, student_id: student.id, body: 'Joelho sensível.' });
  expect(noteErr).toBe(null);
  const { error: revErr } = await adminClient
    .from('student_plan_revisions')
    .insert({ student_id: student.id, coach_id: coach.id, calorie_goal: 1900 });
  expect(revErr).toBe(null);
}

suite('Enrollment (contratação de professor)', ({ test }) => {
  test('search_coaches acha o professor premium e público', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    const { data, error } = await student.client.rpc('search_coaches', {
      p_uf: 'SP',
      p_city: 'Campinas',
    });
    expect(error).toBe(null);
    const found = (data ?? []).find((c) => c.coach_id === coach.id);
    expect(!!found).toBe(true);
    expect(found.service_mode).toBe('presencial');
    expect(found.rating_count).toBe(0);
  });

  test('professor free NÃO aparece na busca', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx, { tier: 'free' });
    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    const { data } = await student.client.rpc('search_coaches', { p_uf: 'SP' });
    const found = (data ?? []).find((c) => c.coach_id === coach.id);
    expect(!!found).toBe(false);
  });

  test('request_coach abre solicitação e barra a segunda', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    const { data: first } = await student.client.rpc('request_coach', {
      p_coach_id: coach.id,
      p_message: 'Quero treinar com você',
      p_contact_phone: PHONE,
    });
    expect(first.ok).toBe(true);

    const { data: second } = await student.client.rpc('request_coach', {
      p_coach_id: coach.id,
      p_contact_phone: PHONE,
    });
    expect(second.ok).toBe(false);
    expect(second.error).toBe('already_requested');

    // A lista do aluno traz o nome do professor na MESMA query (sem N+1).
    const { data: minhas } = await student.client.rpc(
      'list_my_enrollment_requests',
    );
    expect(minhas.length).toBe(1);
    expect(minhas[0].coach_id).toBe(coach.id);
    expect(typeof minhas[0].coach_name).toBe('string');
    expect(minhas[0].status).toBe('pendente');
  });

  test('request_coach exige telefone de contato', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    for (const phone of [null, '', '119999', 'abcdefghij']) {
      const { data } = await student.client.rpc('request_coach', {
        p_coach_id: coach.id,
        p_contact_phone: phone,
      });
      expect(data.ok).toBe(false);
      expect(data.error).toBe('invalid_phone');
    }

    // Com telefone válido passa, e o número chega na fila do professor.
    const { data: ok } = await student.client.rpc('request_coach', {
      p_coach_id: coach.id,
      p_contact_phone: '(11) 99999-8888',
    });
    expect(ok.ok).toBe(true);

    const { data: fila } = await coach.client.rpc(
      'list_coach_enrollment_requests',
    );
    expect(fila[0].contact_phone).toBe(PHONE);
  });

  test('efetuado vincula o aluno e trava a edição de treino', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    // O usuário cria uma rotina ENQUANTO é comum — o "refém" do backlog.
    const { data: routine, error: routineErr } = await student.client
      .from('workout_routines')
      .insert({ user_id: student.id, name: 'Treino do usuário comum' })
      .select('id')
      .single();
    expect(routineErr).toBe(null);

    const { data: req } = await student.client.rpc('request_coach', {
      p_coach_id: coach.id,
      p_contact_phone: PHONE,
    });
    expect(req.ok).toBe(true);

    const res = await callFn('coach-respond-enrollment', coach.accessToken, {
      request_id: req.id,
      action: 'efetuado',
    });
    expect(res.ok).toBe(true);
    expect(res.body.status).toBe('efetuado');

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role, coach_id')
      .eq('id', student.id)
      .single();
    expect(profile.role).toBe('aluno');
    expect(profile.coach_id).toBe(coach.id);

    // Mantém o treino…
    const { data: kept } = await student.client
      .from('workout_routines')
      .select('id')
      .eq('id', routine.id);
    expect(kept.length).toBe(1);

    // …mas não edita mais (RLS por role='aluno').
    const { data: updated } = await student.client
      .from('workout_routines')
      .update({ name: 'Tentando editar' })
      .eq('id', routine.id)
      .select('id');
    expect((updated ?? []).length).toBe(0);
  });

  test('professor no limite não consegue efetivar', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx, { tier: 'free' });
    // free = 2 alunos. Deixa público de novo pra permitir a solicitação
    // antes de rebaixar o tier na checagem do aceite.
    await adminClient.from('subscriptions').upsert({
      user_id: coach.id,
      tier: 'premium',
      source: 'store_play',
      status: 'active',
      period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
    });

    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    const { data: req } = await student.client.rpc('request_coach', {
      p_coach_id: coach.id,
      p_contact_phone: PHONE,
    });
    expect(req.ok).toBe(true);

    // Enche o limite do free (2) e rebaixa o tier.
    const filler1 = await createTestUser({ prefix: 'aluno-fill' });
    const filler2 = await createTestUser({ prefix: 'aluno-fill' });
    ctx.defer(() => cleanupUser(filler1));
    ctx.defer(() => cleanupUser(filler2));
    await adminClient
      .from('profiles')
      .update({ role: 'aluno', coach_id: coach.id })
      .in('id', [filler1.id, filler2.id]);
    await adminClient
      .from('subscriptions')
      .update({ tier: 'free', source: 'grandfather' })
      .eq('user_id', coach.id);

    const res = await callFn('coach-respond-enrollment', coach.accessToken, {
      request_id: req.id,
      action: 'efetuado',
    });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('needs_upgrade');

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', student.id)
      .single();
    expect(profile.role).toBe('comum');
  });

  test('cancelado mantém o usuário comum e deixa aviso não visto', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    const { data: req } = await student.client.rpc('request_coach', {
      p_coach_id: coach.id,
      p_contact_phone: PHONE,
    });
    const res = await callFn('coach-respond-enrollment', coach.accessToken, {
      request_id: req.id,
      action: 'cancelado',
      cancel_reason: 'Agenda cheia',
    });
    expect(res.ok).toBe(true);

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', student.id)
      .single();
    expect(profile.role).toBe('comum');

    const { data: rows } = await student.client
      .from('coach_enrollment_requests')
      .select('status, seen_by_student_at, cancel_reason')
      .eq('id', req.id);
    expect(rows[0].status).toBe('cancelado');
    expect(rows[0].seen_by_student_at).toBe(null);
    expect(rows[0].cancel_reason).toBe('Agenda cheia');
  });

  test('outro professor não responde solicitação alheia', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const intruso = await createDiscoverableCoach(ctx);
    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    const { data: req } = await student.client.rpc('request_coach', {
      p_coach_id: coach.id,
      p_contact_phone: PHONE,
    });
    const res = await callFn('coach-respond-enrollment', intruso.accessToken, {
      request_id: req.id,
      action: 'efetuado',
    });
    expect(res.status).toBe(404);

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', student.id)
      .single();
    expect(profile.role).toBe('comum');
  });

  test('rate_coach só depois do vínculo efetivado', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    const { data: semVinculo } = await student.client.rpc('rate_coach', {
      p_coach_id: coach.id,
      p_stars: 5,
    });
    expect(semVinculo.ok).toBe(false);
    expect(semVinculo.error).toBe('not_eligible');

    const { data: req } = await student.client.rpc('request_coach', {
      p_coach_id: coach.id,
      p_contact_phone: PHONE,
    });
    await callFn('coach-respond-enrollment', coach.accessToken, {
      request_id: req.id,
      action: 'efetuado',
    });

    const { data: comVinculo } = await student.client.rpc('rate_coach', {
      p_coach_id: coach.id,
      p_stars: 4,
    });
    expect(comVinculo.ok).toBe(true);

    // Reavaliar sobrescreve em vez de duplicar.
    await student.client.rpc('rate_coach', { p_coach_id: coach.id, p_stars: 2 });
    const { data: ratings } = await adminClient
      .from('coach_ratings')
      .select('stars')
      .eq('coach_id', coach.id);
    expect(ratings.length).toBe(1);
    expect(ratings[0].stars).toBe(2);
  });

  test('aluno vinculado herda o tier premium do professor', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    const { data: req } = await student.client.rpc('request_coach', {
      p_coach_id: coach.id,
      p_contact_phone: PHONE,
    });
    await callFn('coach-respond-enrollment', coach.accessToken, {
      request_id: req.id,
      action: 'efetuado',
    });

    const { data: ent } = await student.client.rpc('resolve_entitlement');
    expect(ent.tier).toBe('premium');
    expect(ent.ai_personal).toBe(true);
  });

  test('bloqueio esconde o professor e encerra a solicitação aberta', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    const { data: req } = await student.client.rpc('request_coach', {
      p_coach_id: coach.id,
      p_contact_phone: PHONE,
    });
    expect(req.ok).toBe(true);

    const { error: blockErr } = await coach.client
      .from('coach_blocks')
      .insert({ coach_id: coach.id, user_id: student.id });
    expect(blockErr).toBe(null);

    const { data: rows } = await student.client
      .from('coach_enrollment_requests')
      .select('status')
      .eq('id', req.id);
    expect(rows[0].status).toBe('cancelado');

    // Some da busca e do perfil público pra ele.
    const { data: search } = await student.client.rpc('search_coaches', {
      p_uf: 'SP',
    });
    expect((search ?? []).some((c) => c.coach_id === coach.id)).toBe(false);

    const { data: profile } = await student.client.rpc(
      'get_coach_public_profile',
      { p_coach_id: coach.id },
    );
    expect(profile).toBe(null);

    // E não consegue mais solicitar.
    const { data: retry } = await student.client.rpc('request_coach', {
      p_coach_id: coach.id,
      p_contact_phone: PHONE,
    });
    expect(retry.ok).toBe(false);
    expect(retry.error).toBe('coach_unavailable');
  });

  test('desvínculo deixa aviso pro ex-aluno e encerra o aceite não visto', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    const reqId = await vincular(coach, student);

    // O professor desvincula antes de o aluno abrir o app.
    const unlink = await callFn('coach-unlink-student', coach.accessToken, {
      student_id: student.id,
    });
    expect(unlink.ok).toBe(true);

    // O aviso de desvínculo fica pro ex-aluno, com o nome do professor.
    const { data: notices } = await student.client
      .from('coach_unlink_notices')
      .select('coach_id, coach_name, seen_by_student_at');
    expect(notices.length).toBe(1);
    expect(notices[0].coach_id).toBe(coach.id);
    expect(!!notices[0].coach_name).toBe(true);
    expect(notices[0].seen_by_student_at).toBe(null);

    // O aceite que ele nunca viu deixa de ser notícia.
    const { data: outcome } = await adminClient
      .from('coach_enrollment_requests')
      .select('seen_by_student_at')
      .eq('id', reqId)
      .single();
    expect(!!outcome.seen_by_student_at).toBe(true);
  });

  test('aceite cancela as outras solicitações abertas sem virar aviso', async (ctx) => {
    const coachA = await createDiscoverableCoach(ctx);
    const coachB = await createDiscoverableCoach(ctx, { cref: '098765-P/SP' });
    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    const { data: reqA } = await student.client.rpc('request_coach', {
      p_coach_id: coachA.id,
      p_contact_phone: PHONE,
    });
    const { data: reqB } = await student.client.rpc('request_coach', {
      p_coach_id: coachB.id,
      p_contact_phone: PHONE,
    });
    expect(reqB.ok).toBe(true);

    const accept = await callFn('coach-respond-enrollment', coachA.accessToken, {
      request_id: reqA.id,
      action: 'efetuado',
    });
    expect(accept.ok).toBe(true);

    const { data: other } = await adminClient
      .from('coach_enrollment_requests')
      .select('status, seen_by_student_at')
      .eq('id', reqB.id)
      .single();
    expect(other.status).toBe('cancelado');
    expect(!!other.seen_by_student_at).toBe(true);
  });

  test('aluno encerra o acompanhamento com motivo e o professor é avisado', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const outro = await createDiscoverableCoach(ctx, { cref: '098765-P/SP' });
    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    await vincular(coach, student);

    // Aluno não troca de professor sem sair do atual ([SOLI]-13).
    const { data: blocked } = await student.client.rpc('request_coach', {
      p_coach_id: outro.id,
      p_contact_phone: PHONE,
    });
    expect(blocked.error).toBe('already_student');

    const motivo = 'Mudei de cidade e vou treinar com alguém daqui.';
    const leave = await callFn('student-leave-coach', student.accessToken, { reason: motivo });
    expect(leave.ok).toBe(true);

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role, coach_id, coach_linked_at')
      .eq('id', student.id)
      .single();
    expect(profile.role).toBe('comum');
    expect(profile.coach_id).toBe(null);
    expect(profile.coach_linked_at).toBe(null);

    // O professor vê a saída com o motivo; pro aluno não vira aviso (ele fez).
    const { data: notices } = await adminClient
      .from('coach_unlink_notices')
      .select('coach_id, initiated_by, reason, student_name, seen_by_coach_at, seen_by_student_at')
      .eq('student_id', student.id);
    expect(notices.length).toBe(1);
    expect(notices[0].coach_id).toBe(coach.id);
    expect(notices[0].initiated_by).toBe('student');
    expect(notices[0].reason).toBe(motivo);
    expect(!!notices[0].student_name).toBe(true); // o professor já não lê o perfil dele
    expect(notices[0].seen_by_coach_at).toBe(null);
    expect(!!notices[0].seen_by_student_at).toBe(true);

    // Agora livre, pode solicitar outro professor.
    const { data: again } = await student.client.rpc('request_coach', {
      p_coach_id: outro.id,
      p_contact_phone: PHONE,
    });
    expect(again.ok).toBe(true);
  });

  test('encerrar acompanhamento exige motivo e só vale pra aluno', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await createTestUser({ prefix: 'aluno-enr' });
    ctx.defer(() => cleanupUser(student));

    // Comum não tem professor pra deixar.
    const naoAluno = await callFn('student-leave-coach', student.accessToken, {
      reason: 'Quero sair do professor.',
    });
    expect(naoAluno.status).toBe(409);
    expect(naoAluno.body.error).toBe('not_student');

    await vincular(coach, student);

    for (const reason of [undefined, '', '   ', 'curto']) {
      const res = await callFn('student-leave-coach', student.accessToken, { reason });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('reason_required');
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role, coach_id')
      .eq('id', student.id)
      .single();
    expect(profile.role).toBe('aluno');
    expect(profile.coach_id).toBe(coach.id);
  });

  test('vínculo: aluno ganha o plano do professor, mantém metas e dados, professor passa a ver', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await usuarioComDados(ctx);
    expect((await tierDe(student)) !== 'premium').toBe(true);

    await vincular(coach, student);

    expect(await tierDe(student)).toBe('premium');
    const { data: profile } = await adminClient
      .from('profiles')
      .select('daily_calorie_goal, coach_linked_at')
      .eq('id', student.id)
      .single();
    expect(profile.daily_calorie_goal).toBe(2100);
    expect(!!profile.coach_linked_at).toBe(true);

    // O professor passa a ver inclusive o que foi registrado antes do vínculo.
    const { data: logs } = await coach.client
      .from('food_logs')
      .select('meal_name')
      .eq('user_id', student.id);
    expect(logs.length).toBe(1);
  });

  test('desvínculo pelo professor: volta ao plano próprio (trial), dados ficam, professor perde acesso', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await usuarioComDados(ctx);
    await vincular(coach, student);
    await professorTrabalha(coach, student);

    const res = await callFn('coach-unlink-student', coach.accessToken, { student_id: student.id });
    expect(res.ok).toBe(true);
    expect(res.body.trial_granted).toBe(true);

    expect(await tierDe(student)).toBe('pro'); // trial de servidor de 7 dias
    await conferirDesvinculado(coach, student);
  });

  test('saída pelo aluno: mesmos efeitos do desvínculo pelo professor', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await usuarioComDados(ctx);
    await vincular(coach, student);
    await professorTrabalha(coach, student);

    const res = await callFn('student-leave-coach', student.accessToken, {
      reason: 'Quero seguir sozinho por enquanto.',
    });
    expect(res.ok).toBe(true);

    expect(await tierDe(student)).toBe('pro');
    await conferirDesvinculado(coach, student);
  });

  test('assinatura própria: vínculo dá o melhor plano e a saída devolve o que ele paga', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await usuarioComDados(ctx);
    await adminClient.from('subscriptions').upsert({
      user_id: student.id,
      tier: 'pro',
      source: 'store_play',
      status: 'active',
      period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
    });
    expect(await tierDe(student)).toBe('pro');

    await vincular(coach, student);
    expect(await tierDe(student)).toBe('premium');

    const res = await callFn('student-leave-coach', student.accessToken, {
      reason: 'Quero seguir sozinho por enquanto.',
    });
    expect(res.ok).toBe(true);
    // Não ganha trial por cima da assinatura da loja, e a assinatura continua.
    expect(res.body.trial_granted).toBe(false);
    expect(await tierDe(student)).toBe('pro');
    const { data: sub } = await adminClient
      .from('subscriptions')
      .select('source, status')
      .eq('user_id', student.id)
      .single();
    expect(sub.source).toBe('store_play');
    expect(sub.status).toBe('active');
  });

  test('desvínculo libera a vaga: professor no limite volta a aceitar', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const ocupante = await usuarioComDados(ctx);
    await vincular(coach, ocupante);
    const filler = await createTestUser({ prefix: 'aluno-fill' });
    ctx.defer(() => cleanupUser(filler));
    await adminClient
      .from('profiles')
      .update({ role: 'aluno', coach_id: coach.id })
      .eq('id', filler.id);

    const novo = await createTestUser({ prefix: 'aluno-ciclo' });
    ctx.defer(() => cleanupUser(novo));
    const { data: req } = await novo.client.rpc('request_coach', {
      p_coach_id: coach.id,
      p_contact_phone: PHONE,
    });
    expect(req.ok).toBe(true);

    // Free = 2 alunos: com 2 vinculados, o aceite esbarra no limite.
    await adminClient.from('subscriptions').update({ tier: 'free' }).eq('user_id', coach.id);
    const cheio = await callFn('coach-respond-enrollment', coach.accessToken, {
      request_id: req.id,
      action: 'efetuado',
    });
    expect(cheio.status).toBe(402);

    // O ocupante sai; a vaga abre e o mesmo aceite passa.
    const saiu = await callFn('student-leave-coach', ocupante.accessToken, {
      reason: 'Abrindo vaga pro teste de limite.',
    });
    expect(saiu.ok).toBe(true);
    const aceito = await callFn('coach-respond-enrollment', coach.accessToken, {
      request_id: req.id,
      action: 'efetuado',
    });
    expect(aceito.ok).toBe(true);
  });

  test('avaliação com comentário: média é pública, comentário só o professor lê', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await createTestUser({ prefix: 'aluno-aval' });
    ctx.defer(() => cleanupUser(student));
    await vincular(coach, student);

    const comentario = 'Treinos bem explicados, responde rápido.';
    const { data: rated } = await student.client.rpc('rate_coach', {
      p_coach_id: coach.id,
      p_stars: 4,
      p_comment: comentario,
    });
    expect(rated.ok).toBe(true);

    // O professor lê a avaliação, com comentário e nome do aluno.
    const { data: minhas, error } = await coach.client.rpc('list_my_coach_ratings');
    expect(error).toBe(null);
    expect(minhas.length).toBe(1);
    expect(minhas[0].stars).toBe(4);
    expect(minhas[0].comment).toBe(comentario);
    expect(!!minhas[0].student_name).toBe(true);

    // Um terceiro vê a média, mas não o comentário — nem no perfil, nem na busca.
    const visitante = await createTestUser({ prefix: 'visitante' });
    ctx.defer(() => cleanupUser(visitante));
    const { data: perfil } = await visitante.client.rpc('get_coach_public_profile', {
      p_coach_id: coach.id,
    });
    expect(Number(perfil.rating_avg)).toBe(4);
    expect(perfil.rating_count).toBe(1);
    expect(JSON.stringify(perfil).includes(comentario)).toBe(false);
    const { data: busca } = await visitante.client.rpc('search_coaches', { p_uf: 'SP' });
    expect(JSON.stringify(busca).includes(comentario)).toBe(false);
    const { data: linhas } = await visitante.client.from('coach_ratings').select('comment');
    expect(linhas.length).toBe(0);
  });

  test('aluno cadastrado pelo professor também avalia', async (ctx) => {
    const coach = await createDiscoverableCoach(ctx);
    const student = await createTestUser({ prefix: 'aluno-aval' });
    ctx.defer(() => cleanupUser(student));
    // Vínculo direto, sem contratação (como o coach-create-student faz).
    await adminClient
      .from('profiles')
      .update({ role: 'aluno', coach_id: coach.id })
      .eq('id', student.id);

    const { data: rated } = await student.client.rpc('rate_coach', {
      p_coach_id: coach.id,
      p_stars: 5,
    });
    expect(rated.ok).toBe(true);
  });

  test('CREF inválido barra o cadastro de professor', async (ctx) => {
    const user = await createTestUser({ prefix: 'coach-bad' });
    ctx.defer(() => cleanupUser(user));

    for (const cref of ['999999-G/SP', '111111-G/SP', 'sou professor', '123456-G/SP']) {
      const res = await callFn('signup-professor', user.accessToken, { cref });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('cref_invalid');
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    expect(profile.role).toBe('comum');
  });
});
