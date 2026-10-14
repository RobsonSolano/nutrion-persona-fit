// NutriOn — Seeder de usuários de teste pra feature account-deletion
//
// Cria 4 usuários:
//   1. comum@nutrion.test    (role='comum')
//   2. coach@nutrion.test    (role='professor', linha em coaches)
//   3. aluno1@nutrion.test   (role='aluno',  coach_id=coach)
//   4. aluno2@nutrion.test   (role='aluno',  coach_id=coach)
//
// Senha igual pra todos: 123456789 (não usar em produção).
//
// Uso:
//   node --env-file=.env.local scripts/seed-test-users.mjs
//
// Idempotente: se algum user já existe, atualiza dados e relinka.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '❌ Faltam EXPO_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = '123456789';

const USERS = [
  {
    key: 'comum',
    email: 'comum@nutrion.test',
    fullName: 'Comum Teste',
    role: 'comum',
  },
  {
    key: 'coach',
    email: 'coach@nutrion.test',
    fullName: 'Coach Teste',
    role: 'professor',
    coach: { bio: 'Coach de teste pra LGPD', cref: '045821-G/SP' },
  },
  {
    key: 'aluno1',
    email: 'aluno1@nutrion.test',
    fullName: 'Aluno Um',
    role: 'aluno',
    linkToKey: 'coach',
  },
  {
    key: 'aluno2',
    email: 'aluno2@nutrion.test',
    fullName: 'Aluno Dois',
    role: 'aluno',
    linkToKey: 'coach',
  },
];

async function findUserByEmail(email) {
  // Paginação pra cobrir bases grandes
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const found = data?.users?.find((u) => u.email === email);
    if (found) return found;
    if (!data?.users || data.users.length < 200) return null;
    page++;
  }
}

async function getOrCreateUser(email, fullName) {
  const existing = await findUserByEmail(email);
  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, name: fullName },
    });
    return { id: existing.id, created: false };
  }
  const { data: created, error: createErr } =
    await supabase.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, name: fullName },
    });
  if (createErr) throw createErr;
  return { id: created.user.id, created: true };
}

async function setProfile(userId, fullName, role, coachId) {
  // O trigger handle_new_user já cria a row em profiles. Atualizamos.
  // onboarding_completed_at preenchido pra evitar que o gate em
  // (tabs)/_layout.tsx mande o user pra /onboarding (que faz loop
  // infinito com onboarding/_layout.tsx em alguns roles).
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      role,
      coach_id: coachId ?? null,
      onboarding_completed_at: new Date().toISOString(),
      onboarding_skipped_at: null,
    })
    .eq('id', userId);
  if (error) throw error;
}

async function upsertCoachRow(userId, coachData) {
  const { error } = await supabase.from('coaches').upsert({
    id: userId,
    bio: coachData?.bio ?? null,
    cref: coachData?.cref ?? null,
  });
  if (error) throw error;
}

async function main() {
  console.log('🌱 Seeding usuários de teste pra account-deletion\n');

  const userIds = {};

  // 1ª passada: cria/atualiza auth.users + profiles básicos (sem coach_id)
  for (const u of USERS) {
    process.stdout.write(`  ➜ ${u.email.padEnd(28)}`);
    const { id, created } = await getOrCreateUser(u.email, u.fullName);
    userIds[u.key] = id;
    process.stdout.write(created ? ' ✨ criado\n' : ' ↺ atualizado\n');
  }

  // 2ª passada: seta role + coach_id + linha em coaches
  for (const u of USERS) {
    const coachId = u.linkToKey ? userIds[u.linkToKey] : null;
    await setProfile(userIds[u.key], u.fullName, u.role, coachId);
    if (u.role === 'professor' && u.coach) {
      await upsertCoachRow(userIds[u.key], u.coach);
    }
  }

  console.log('\n🎉 Seed completo!\n');
  console.log('Credenciais (senha igual pra todos: 123456789):\n');
  console.log('| Tipo       | Email                 | User ID                              |');
  console.log('|------------|-----------------------|--------------------------------------|');
  for (const u of USERS) {
    console.log(
      `| ${u.role.padEnd(10)} | ${u.email.padEnd(21)} | ${userIds[u.key]} |`,
    );
  }
  console.log();
  console.log('🔗 Vínculos:');
  console.log(`  - ${USERS[2].email} é aluno de ${USERS[1].email}`);
  console.log(`  - ${USERS[3].email} é aluno de ${USERS[1].email}`);
  console.log();
  console.log('📋 Roteiro de teste:');
  console.log('  1. Logar como comum@ → editar perfil → excluir conta → tentar logar de novo');
  console.log('  2. Logar como coach@ → entrar no aluno1@ → desvincular → logar como aluno1@ (deve estar como comum)');
  console.log('  3. Logar como aluno2@ → editar perfil → excluir conta');
  console.log('  4. Logar como coach@ → ver que aluno1 não aparece mais (virou comum) e aluno2 também não (excluiu) → excluir conta do coach');
}

main().catch((err) => {
  console.error('\n❌ Falhou:', err);
  process.exit(1);
});
