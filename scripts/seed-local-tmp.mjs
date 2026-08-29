// Semeia o Supabase LOCAL com um professor premium público e um usuário comum,
// pra validar a contratação no emulador.
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SERVICE = process.env.LOCAL_SERVICE_KEY;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function upsertUser(email, password, fullName) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = list.users.find((u) => u.email === email);
  if (existing) {
    await admin.auth.admin.deleteUser(existing.id);
  }
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  return data.user.id;
}

const coachId = await upsertUser('prof@teste.local', 'teste1234', 'Marcos Personal');
const userId = await upsertUser('aluno@teste.local', 'teste1234', 'Rita Usuária');

await admin.from('profiles').update({
  role: 'professor', full_name: 'Marcos Personal',
  onboarding_completed_at: new Date().toISOString(),
}).eq('id', coachId);

await admin.from('coaches').upsert({
  id: coachId,
  cref: '045821-G/SP',
  bio: 'Treino de força e preparação para competição. Atendo presencial em Campinas e online para o resto do Brasil.',
  is_public: true,
  state_uf: 'SP',
  city: 'Campinas',
  city_ibge_code: '3509502',
  specialties: ['musculacao', 'powerlifting', 'hipertrofia'],
  service_mode: 'hibrido',
});

await admin.from('subscriptions').upsert({
  user_id: coachId, tier: 'premium', source: 'store_play', status: 'active',
  period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
});

await admin.from('profiles').update({
  role: 'comum', full_name: 'Rita Usuária',
  onboarding_completed_at: new Date().toISOString(),
  weight_kg: 68, height_cm: 165, daily_calorie_goal: 2100, protein_goal_g: 120,
}).eq('id', userId);

// Rotina criada pela própria usuária — vira o "refém" depois do vínculo.
await admin.from('workout_routines').insert({
  user_id: userId, name: 'Meu treino de casa', modality: 'musculacao',
});

// Um segundo professor pra lista não ficar com 1 item só.
const coach2 = await upsertUser('prof2@teste.local', 'teste1234', 'Ana Treinadora');
await admin.from('profiles').update({ role: 'professor', full_name: 'Ana Treinadora',
  onboarding_completed_at: new Date().toISOString() }).eq('id', coach2);
await admin.from('coaches').upsert({
  id: coach2, cref: '098765-P/SP', bio: 'CrossFit e condicionamento. Só online.',
  is_public: true, state_uf: 'SP', city: 'São Paulo', city_ibge_code: '3550308',
  specialties: ['crossfit', 'condicionamento'], service_mode: 'online',
});
await admin.from('subscriptions').upsert({ user_id: coach2, tier: 'premium',
  source: 'store_play', status: 'active',
  period_end: new Date(Date.now() + 30 * 864e5).toISOString() });

console.log('professor:', coachId, '| usuário:', userId, '| professora2:', coach2);
console.log('login professor: prof@teste.local / teste1234');
console.log('login usuário:   aluno@teste.local / teste1234');
