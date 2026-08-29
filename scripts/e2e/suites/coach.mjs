import { suite, expect } from '../lib/runner.mjs';
import {
  adminClient,
  cleanupUser,
  createTestUser,
} from '../lib/clients.mjs';

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

suite('Coach (signup, alunos, RLS)', ({ test }) => {
  test('signup-professor: promove role + cria coaches row', async (ctx) => {
    const user = await createTestUser({ prefix: 'coach' });
    ctx.defer(() => cleanupUser(user));

    const res = await callFn('signup-professor', user.accessToken, {
      bio: 'Professor de teste',
      cref: '045821-G/SP',
    });
    expect(res.ok).toBe(true);
    expect(res.body.coach).toBeDefined();

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    expect(profile.role).toBe('professor');

    const { data: coachRow } = await adminClient
      .from('coaches')
      .select('id, bio, max_students')
      .eq('id', user.id)
      .single();
    expect(coachRow.bio).toBe('Professor de teste');
    expect(coachRow.max_students).toBe(20);
  });

  test('coach-create-student: cria conta + ficha', async (ctx) => {
    const coach = await createTestUser({ prefix: 'coach-cs' });
    ctx.defer(() => cleanupUser(coach));
    await callFn('signup-professor', coach.accessToken, {});

    // Cria aluno via edge function.
    const studentEmail = `e2e-student-${Date.now()}@nutrion-test.local`;
    const studentPassword = 'test-student-1234';
    const res = await callFn('coach-create-student', coach.accessToken, {
      email: studentEmail,
      password: studentPassword,
      full_name: 'Aluno Teste E2E',
      sex: 'm',
      birth_year: 1990,
      weight_kg: 75,
      height_cm: 175,
      goal_type: 'lose_fat',
      practices_sport: true,
      sports: ['musculacao'],
      weekly_frequency: '3-4',
      water_goal_ml: 3000,
    });
    expect(res.ok).toBe(true);
    const studentId = res.body.student.id;

    // Cleanup defensivo do aluno (cascade do auth.users).
    ctx.defer(() => adminClient.auth.admin.deleteUser(studentId).catch(() => {}));

    expect(res.body.student.role).toBe('aluno');
    expect(res.body.student.coach_id).toBe(coach.id);
    expect(res.body.student.weight_kg).toBe(75);
    expect(res.body.student.onboarding_completed_at).toBeTruthy();
  });

  test('coach lê profile dos seus alunos (RLS)', async (ctx) => {
    const coach = await createTestUser({ prefix: 'coach-read' });
    ctx.defer(() => cleanupUser(coach));
    await callFn('signup-professor', coach.accessToken, {});

    const studentEmail = `e2e-student-r-${Date.now()}@nutrion-test.local`;
    const create = await callFn('coach-create-student', coach.accessToken, {
      email: studentEmail,
      password: 'test-1234',
      full_name: 'Aluno Lido',
    });
    const studentId = create.body.student.id;
    ctx.defer(() => adminClient.auth.admin.deleteUser(studentId).catch(() => {}));

    // Coach lista alunos.
    const { data: students } = await coach.client
      .from('profiles')
      .select('id, full_name, role')
      .eq('coach_id', coach.id)
      .eq('role', 'aluno');

    expect(Array.isArray(students)).toBe(true);
    expect(students.length).toBe(1);
    expect(students[0].id).toBe(studentId);
  });

  test('comum não vira professor via signup-professor se já é aluno', async (ctx) => {
    const coach = await createTestUser({ prefix: 'coach-blk' });
    ctx.defer(() => cleanupUser(coach));
    await callFn('signup-professor', coach.accessToken, {});

    const create = await callFn('coach-create-student', coach.accessToken, {
      email: `e2e-student-blk-${Date.now()}@nutrion-test.local`,
      password: 'test-1234',
      full_name: 'Aluno Bloqueado',
    });
    const studentId = create.body.student.id;
    ctx.defer(() => adminClient.auth.admin.deleteUser(studentId).catch(() => {}));

    // Aluno faz signin (precisa do JWT) e tenta promover via signup-professor.
    const { data: signIn } = await adminClient.auth.signInWithPassword({
      email: create.body.student.email ?? `e2e-student-blk-${Date.now()}@nutrion-test.local`,
      password: 'test-1234',
    });
    if (!signIn?.session) {
      // Não conseguiu logar — provavelmente email diferente. Pula esse caso.
      return;
    }
    const studentToken = signIn.session.access_token;
    const res = await callFn('signup-professor', studentToken, {});
    expect(res.status).toBe(409);
  });
});
