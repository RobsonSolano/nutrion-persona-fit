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
import { adminClient, cleanupUser, createTestUser } from '../lib/clients.mjs';

const FN_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function callFn(name, accessToken, body) {
  const res = await fetch(`${FN_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: ANON,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

/** Professor premium, público e completo — o único estado que aparece na busca. */
async function createDiscoverableCoach(ctx, overrides = {}) {
  const coach = await createTestUser({ prefix: 'coach-enr' });
  ctx.defer(() => cleanupUser(coach));

  const res = await callFn('signup-professor', coach.accessToken, {
    bio: 'Professor de teste e2e',
    cref: overrides.cref ?? '045821-G/SP',
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
      p_contact_phone: '11999998888',
    });
    expect(first.ok).toBe(true);

    const { data: second } = await student.client.rpc('request_coach', {
      p_coach_id: coach.id,
      p_contact_phone: '11999998888',
    });
    expect(second.ok).toBe(false);
    expect(second.error).toBe('already_requested');
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
    expect(fila[0].contact_phone).toBe('11999998888');
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
      p_contact_phone: '11999998888',
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
      p_contact_phone: '11999998888',
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
      p_contact_phone: '11999998888',
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
      p_contact_phone: '11999998888',
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
      p_contact_phone: '11999998888',
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
      p_contact_phone: '11999998888',
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
      p_contact_phone: '11999998888',
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
      p_contact_phone: '11999998888',
    });
    expect(retry.ok).toBe(false);
    expect(retry.error).toBe('coach_unavailable');
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
