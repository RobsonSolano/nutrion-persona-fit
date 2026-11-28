// PersonaFit — popula histórico realista no aluno de teste (aluno1@nutrion.test)
//
// Serve pra prints e demos: as telas de painel, diário, treinos e evolução
// saem preenchidas. Rode antes o `npm run seed:test-users` se a conta não existir.
//
// Uso:
//   npm run seed:aluno-historico
// ou
//   node --env-file=.env.local scripts/seed-historico-aluno.mjs [email]
//
// Idempotente: apaga o histórico e as rotinas do aluno e recria tudo.
// Só mexe na conta passada (padrão aluno1@nutrion.test). Recusa qualquer
// e-mail que não seja @nutrion.test, porque o banco é o mesmo do app publicado.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Faltam EXPO_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local');
  process.exit(1);
}

const EMAIL = process.argv[2] ?? 'aluno1@nutrion.test';
if (!EMAIL.endsWith('@nutrion.test')) {
  console.error(`❌ ${EMAIL} não é conta de teste (@nutrion.test). Abortando.`);
  process.exit(1);
}

const DAYS = 21;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- HELPERS ----
function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysAgo(n, h = 12, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d;
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(list) {
  return list[rand(0, list.length - 1)];
}

async function must(promise, label) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

// ---- DADOS ----
const PROFILE = {
  sex: 'm',
  birth_year: new Date().getFullYear() - 29,
  weight_kg: 82.4,
  height_cm: 176,
  goal_weight_kg: 78,
  goal_type: 'lose_fat',
  practices_sport: true,
  sports: ['musculacao', 'corrida'],
  weekly_frequency: '4-5',
  daily_calorie_goal: 2300,
  protein_goal_g: 160,
  carbs_goal_g: 250,
  water_goal_ml: 3000,
  allergies: 'Nenhuma',
  physical_limitations: 'Desconforto leve no ombro esquerdo em cargas altas acima da cabeça',
  bio: 'Analista, 29 anos. Treino de manhã antes do trabalho e corro aos fins de semana.',
};

const ROUTINES_SPEC = [
  {
    name: 'Treino A · Peito e Tríceps',
    group_slug: 'chest',
    description: 'Foco em força no supino e volume de tríceps',
    exercises: [
      { name: 'Supino reto (barra)', sets: 4, reps_min: 6, reps_max: 10, weight_min_kg: 50, weight_max_kg: 65 },
      { name: 'Supino inclinado (halteres)', sets: 4, reps_min: 8, reps_max: 12, weight_min_kg: 20, weight_max_kg: 24 },
      { name: 'Crucifixo reto (halteres)', sets: 3, reps_min: 10, reps_max: 12, weight_min_kg: 12, weight_max_kg: 16 },
      { name: 'Tríceps corda (pulley)', sets: 3, reps_min: 10, reps_max: 15, weight_min_kg: 20, weight_max_kg: 30 },
    ],
  },
  {
    name: 'Treino B · Costas e Bíceps',
    group_slug: 'back',
    description: 'Puxadas pesadas e finalização de bíceps',
    exercises: [
      { name: 'Puxada frontal (pulley)', sets: 4, reps_min: 8, reps_max: 12, weight_min_kg: 45, weight_max_kg: 60 },
      { name: 'Remada baixa (pulley)', sets: 4, reps_min: 8, reps_max: 12, weight_min_kg: 45, weight_max_kg: 55 },
      { name: 'Rosca direta (barra)', sets: 3, reps_min: 8, reps_max: 12, weight_min_kg: 20, weight_max_kg: 30 },
      { name: 'Rosca martelo (halteres)', sets: 3, reps_min: 10, reps_max: 12, weight_min_kg: 10, weight_max_kg: 14 },
    ],
  },
  {
    name: 'Treino C · Pernas',
    group_slug: 'legs',
    description: 'Compostos pesados e isolamento',
    exercises: [
      { name: 'Agachamento livre (barra)', sets: 4, reps_min: 6, reps_max: 10, weight_min_kg: 60, weight_max_kg: 80 },
      { name: 'Leg press 45°', sets: 4, reps_min: 10, reps_max: 15, weight_min_kg: 140, weight_max_kg: 200 },
      { name: 'Cadeira extensora', sets: 3, reps_min: 12, reps_max: 15, weight_min_kg: 35, weight_max_kg: 50 },
      { name: 'Mesa flexora', sets: 3, reps_min: 10, reps_max: 12, weight_min_kg: 30, weight_max_kg: 45 },
    ],
  },
  {
    name: 'Treino D · Ombros e Core',
    group_slug: 'shoulders',
    description: 'Ombro com cuidado na amplitude + abdômen',
    exercises: [
      { name: 'Desenvolvimento (halteres)', sets: 4, reps_min: 8, reps_max: 12, weight_min_kg: 14, weight_max_kg: 20 },
      { name: 'Elevação lateral (halteres)', sets: 4, reps_min: 12, reps_max: 15, weight_min_kg: 8, weight_max_kg: 12 },
      { name: 'Face pull (cabo)', sets: 3, reps_min: 12, reps_max: 15, weight_min_kg: 15, weight_max_kg: 25 },
      { name: 'Prancha (frontal)', sets: 3, duration_min: 1, notes: 'Segurar 45 a 60s' },
    ],
  },
];

const MEALS = {
  'Café da manhã': [
    { description: '3 ovos mexidos, 1 pão francês e café com leite', calories: 430, protein_g: 26, carbs_g: 38, fats_g: 18 },
    { description: 'Iogurte natural, 40g de granola e 1 banana', calories: 380, protein_g: 16, carbs_g: 62, fats_g: 8 },
    { description: 'Tapioca com queijo branco e peito de peru', calories: 360, protein_g: 24, carbs_g: 44, fats_g: 9 },
  ],
  Almoço: [
    { description: '150g de frango grelhado, 120g de arroz, feijão e salada', calories: 680, protein_g: 48, carbs_g: 78, fats_g: 14 },
    { description: '150g de patinho moído, purê de batata e legumes', calories: 640, protein_g: 42, carbs_g: 60, fats_g: 22 },
    { description: '160g de tilápia, arroz integral, feijão e brócolis', calories: 610, protein_g: 46, carbs_g: 70, fats_g: 12 },
  ],
  Lanche: [
    { description: 'Whey com leite e 1 maçã', calories: 290, protein_g: 30, carbs_g: 30, fats_g: 5 },
    { description: 'Sanduíche natural de atum', calories: 340, protein_g: 26, carbs_g: 36, fats_g: 9 },
    { description: '30g de castanhas e 1 iogurte proteico', calories: 320, protein_g: 20, carbs_g: 14, fats_g: 21 },
  ],
  Jantar: [
    { description: 'Omelete de 3 ovos com espinafre e 1 batata-doce', calories: 470, protein_g: 28, carbs_g: 40, fats_g: 20 },
    { description: '150g de carne magra, arroz e salada', calories: 590, protein_g: 44, carbs_g: 55, fats_g: 18 },
    { description: 'Wrap integral de frango com salada', calories: 480, protein_g: 38, carbs_g: 42, fats_g: 14 },
  ],
};

const MEAL_HOURS = { 'Café da manhã': [7, 15], Almoço: [12, 40], Lanche: [16, 20], Jantar: [20, 10] };

// Semana: seg A, ter B, qua descanso, qui C, sex D, sáb corrida, dom descanso
const WEEK_PLAN = { 1: 0, 2: 1, 4: 2, 5: 3, 6: 'run' };

const PROGRESS_NOTES = [
  { daysAgo: 20, content: 'Comecei o plano novo com o professor. Meta: perder 4 kg até o fim do ano sem perder força.' },
  { daysAgo: 13, content: 'Primeira semana fechada sem faltar. Fome controlada, dormindo melhor.' },
  { daysAgo: 6, content: 'Supino subiu de 55 para 60 kg nas 4 séries. Cintura já caiu 2 cm.' },
  { daysAgo: 1, content: 'Corrida de 6 km em 34 minutos, melhor tempo do ano.' },
];

const ASSESSMENTS = [
  {
    daysAgo: 42,
    weight_kg: 84.6,
    perim_waist_cm: 91.5, perim_hip_cm: 101, perim_chest_cm: 103, perim_arm_r_cm: 35.5, perim_arm_l_cm: 35, perim_thigh_r_cm: 58, perim_thigh_l_cm: 57.5,
    skin_chest_mm: 16, skin_abdominal_mm: 28, skin_thigh_mm: 20,
    notes: 'Avaliação inicial. Foco em déficit leve e manter volume de treino.',
  },
  {
    daysAgo: 2,
    weight_kg: 82.4,
    perim_waist_cm: 88.5, perim_hip_cm: 99.5, perim_chest_cm: 103.5, perim_arm_r_cm: 36, perim_arm_l_cm: 35.5, perim_thigh_r_cm: 58, perim_thigh_l_cm: 57.5,
    skin_chest_mm: 13, skin_abdominal_mm: 23, skin_thigh_mm: 17,
    notes: 'Boa evolução: -2,2 kg com ganho de braço. Manter estratégia por mais 6 semanas.',
  },
];

// ---- ETAPAS ----
async function findUser() {
  const profile = await must(
    supabase.from('profiles').select('id, full_name, role, coach_id').eq('email', EMAIL).single(),
    'buscar aluno',
  );
  if (profile.role !== 'aluno' || !profile.coach_id) {
    throw new Error(`${EMAIL} precisa ser aluno vinculado a um professor (rode npm run seed:test-users)`);
  }
  return profile;
}

async function clearOldData(userId) {
  for (const table of ['food_logs', 'water_logs', 'workout_sessions', 'workout_logs', 'progress_entries']) {
    await must(supabase.from(table).delete().eq('user_id', userId), `limpar ${table}`);
  }
  await must(supabase.from('physical_assessments').delete().eq('student_id', userId), 'limpar avaliações');
  const routines = await must(supabase.from('workout_routines').select('id').eq('user_id', userId), 'listar rotinas');
  if (routines.length > 0) {
    const ids = routines.map((r) => r.id);
    await must(supabase.from('workout_routine_exercises').delete().in('routine_id', ids), 'limpar exercícios');
    await must(supabase.from('workout_routines').delete().in('id', ids), 'limpar rotinas');
  }
}

async function createRoutines(userId) {
  const groups = await must(supabase.from('exercise_groups').select('id, slug'), 'grupos');
  const groupBySlug = Object.fromEntries(groups.map((g) => [g.slug, g.id]));
  const exercises = await must(supabase.from('exercises').select('id, name, equipment'), 'exercícios');
  const exerciseByName = Object.fromEntries(exercises.map((e) => [e.name, e]));

  const created = [];
  for (const spec of ROUTINES_SPEC) {
    const routine = await must(
      supabase
        .from('workout_routines')
        .insert({ user_id: userId, name: spec.name, group_id: groupBySlug[spec.group_slug] ?? null, description: spec.description })
        .select('id, name')
        .single(),
      `rotina ${spec.name}`,
    );
    const rows = spec.exercises
      .map((ex, i) => {
        const found = exerciseByName[ex.name];
        if (!found) {
          console.warn(`  ⚠️  exercício fora do catálogo: ${ex.name}`);
          return null;
        }
        return {
          routine_id: routine.id,
          exercise_id: found.id,
          exercise_name: found.name,
          equipment: found.equipment,
          sort_order: i,
          sets: ex.sets ?? null,
          reps_min: ex.reps_min ?? null,
          reps_max: ex.reps_max ?? null,
          weight_min_kg: ex.weight_min_kg ?? null,
          weight_max_kg: ex.weight_max_kg ?? null,
          duration_min: ex.duration_min ?? null,
          notes: ex.notes ?? null,
        };
      })
      .filter(Boolean);
    if (rows.length > 0) await must(supabase.from('workout_routine_exercises').insert(rows), 'exercícios da rotina');
    created.push({ ...routine, spec });
  }
  return created;
}

async function createHistory(userId, routines) {
  const foodLogs = [];
  const waterLogs = [];
  const sessions = [];
  const workoutLogs = [];

  for (let n = DAYS - 1; n >= 0; n--) {
    const day = daysAgo(n);
    const isToday = n === 0;

    // Hoje só café e almoço, pra o painel mostrar o dia "em andamento"
    const meals = isToday ? ['Café da manhã', 'Almoço'] : Object.keys(MEALS);
    for (const meal of meals) {
      const [h, m] = MEAL_HOURS[meal];
      foodLogs.push({
        user_id: userId,
        meal_name: meal,
        ...pick(MEALS[meal]),
        macros_source: 'manual',
        created_at: daysAgo(n, h, m).toISOString(),
      });
    }

    waterLogs.push({
      user_id: userId,
      day: ymd(day),
      volume_ml: isToday ? 1250 : rand(2200, 3300),
      updated_at: daysAgo(n, isToday ? 13 : 22).toISOString(),
    });

    const plan = WEEK_PLAN[day.getDay()];
    // Uma falta na primeira semana deixa o histórico verossímil
    if (plan === undefined || n === 17) continue;

    if (plan === 'run') {
      sessions.push({
        user_id: userId,
        routine_id: null,
        routine_name: 'Corrida',
        day: ymd(day),
        duration_min: rand(32, 40),
        notes: `${rand(5, 7)} km no parque`,
        created_at: daysAgo(n, 8).toISOString(),
      });
      continue;
    }

    const routine = routines[plan];
    // Progressão: cargas sobem do mínimo ao máximo ao longo do período
    const progress = (DAYS - 1 - n) / (DAYS - 1);
    sessions.push({
      user_id: userId,
      routine_id: routine.id,
      routine_name: routine.name,
      day: ymd(day),
      duration_min: rand(48, 65),
      notes: n < 7 && plan === 0 ? 'Supino com 60 kg nas 4 séries' : null,
      created_at: daysAgo(n, 6, 45).toISOString(),
    });
    for (const ex of routine.spec.exercises) {
      if (ex.weight_min_kg == null) continue;
      const weight = ex.weight_min_kg + (ex.weight_max_kg - ex.weight_min_kg) * progress;
      workoutLogs.push({
        user_id: userId,
        exercise_name: ex.name,
        sets: ex.sets,
        reps: ex.reps_max,
        weight_kg: Math.round(weight * 2) / 2,
        intensity_rpe: rand(7, 9),
        created_at: daysAgo(n, 7, 30).toISOString(),
      });
    }
  }

  await must(supabase.from('food_logs').insert(foodLogs), 'refeições');
  await must(supabase.from('water_logs').insert(waterLogs), 'água');
  await must(supabase.from('workout_sessions').insert(sessions), 'sessões');
  await must(supabase.from('workout_logs').insert(workoutLogs), 'cargas');

  const notes = PROGRESS_NOTES.map((p) => ({
    user_id: userId,
    content: p.content,
    created_at: daysAgo(p.daysAgo, 21).toISOString(),
    updated_at: daysAgo(p.daysAgo, 21).toISOString(),
  }));
  await must(supabase.from('progress_entries').insert(notes), 'evolução');

  return { food: foodLogs.length, water: waterLogs.length, sessions: sessions.length, loads: workoutLogs.length, notes: notes.length };
}

async function createAssessments(userId, coachId) {
  const rows = ASSESSMENTS.map(({ daysAgo: n, ...a }) => ({
    student_id: userId,
    coach_id: coachId,
    assessed_at: ymd(daysAgo(n)),
    protocol: 'pollock_3',
    height_cm: PROFILE.height_cm,
    ...a,
  }));
  await must(supabase.from('physical_assessments').insert(rows), 'avaliações físicas');
  return rows.length;
}

// ---- MAIN ----
async function main() {
  console.log(`🌱 Populando histórico de ${EMAIL}\n`);
  const profile = await findUser();

  console.log('  ⏳ atualizando perfil...');
  await must(supabase.from('profiles').update(PROFILE).eq('id', profile.id), 'perfil');

  console.log('  🧹 limpando histórico e rotinas anteriores...');
  await clearOldData(profile.id);

  console.log('  🏋️  criando rotinas...');
  const routines = await createRoutines(profile.id);

  console.log(`  📅 criando ${DAYS} dias de histórico...`);
  const stats = await createHistory(profile.id, routines);

  console.log('  📏 criando avaliações físicas do professor...');
  const assessments = await createAssessments(profile.id, profile.coach_id);

  console.log('\n🎉 Pronto!');
  console.log(`  Rotinas:    ${routines.map((r) => r.name).join(', ')}`);
  console.log(`  Refeições:  ${stats.food} · Água: ${stats.water} dias · Treinos: ${stats.sessions} · Cargas: ${stats.loads}`);
  console.log(`  Evolução:   ${stats.notes} anotações · ${assessments} avaliações físicas`);
}

main().catch((err) => {
  console.error('\n❌ Falhou:', err.message ?? err);
  process.exit(1);
});
