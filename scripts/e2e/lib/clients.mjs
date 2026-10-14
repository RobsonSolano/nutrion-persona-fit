// Helpers de Supabase pra e2e: cria client admin (service_role) e
// cria/destrói usuários temporários sem afetar dados reais.

import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY são obrigatórios em .env.local',
  );
}
if (!SERVICE_ROLE) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY é obrigatório pra e2e. Adiciona em .env.local (não commitar). Pega em Supabase Dashboard → Project Settings → API → service_role key.',
  );
}

export const adminClient = createClient(URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const anonClient = createClient(URL, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Cria um cliente authenticated com JWT do user — usado pra simular
 * chamadas do app real (RLS é avaliada com a uid do JWT).
 */
export function userClient(accessToken) {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Gera email único pra teste — descartável e identificável. */
export function testEmail(prefix = 'e2e') {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${stamp}-${rand}@nutrion-test.local`;
}

/**
 * Cria um user de teste (auth.users + profile). Retorna { id, email,
 * password, accessToken, client }.
 *
 * Importante: o caller é responsável por chamar `cleanupUser(user)`
 * (ou usar `ctx.defer`) pra deletar tudo no fim. Como
 * `auth.admin.deleteUser` cascateia FK profiles, basta deletar o
 * auth.users — todo o resto vem junto.
 */
export async function createTestUser(opts = {}) {
  const email = opts.email ?? testEmail(opts.prefix ?? 'e2e');
  const password = opts.password ?? 'test-password-1234';
  const fullName = opts.fullName ?? 'E2E Test User';

  const { data: created, error: createErr } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
  if (createErr || !created.user) {
    throw new Error(`createUser falhou: ${createErr?.message ?? 'sem user'}`);
  }

  try {
    return { id: created.user.id, email, password, ...(await signInAs(email, password)) };
  } catch (err) {
    await adminClient.auth.admin.deleteUser(created.user.id).catch(() => {});
    throw err;
  }
}

/**
 * Loga um user e devolve { accessToken, client }. O login acontece num
 * client descartável: `signInWithPassword` grava a sessão no client que o
 * chama, e fazer isso no `adminClient` compartilhado trocava o service role
 * pelo JWT do user — toda consulta "admin" seguinte rodava sob RLS.
 */
export async function signInAs(email, password) {
  const throwaway = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await throwaway.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`signIn falhou: ${error?.message ?? 'sem session'}`);
  }
  const accessToken = data.session.access_token;
  return { accessToken, client: userClient(accessToken) };
}

/** Chama uma edge function como o user dono do token. */
export async function callFn(name, accessToken, body) {
  const res = await fetch(`${URL}/functions/v1/${name}`, {
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

/** CREF de formato válido — o signup-professor recusa cadastro sem um. */
export const TEST_CREF = '045821-G/SP';

/**
 * Promove o user a professor via signup-professor. Falha aqui, e não lá na
 * frente, se o cadastro for recusado.
 */
export async function promoteToCoach(user, extra = {}) {
  const res = await callFn('signup-professor', user.accessToken, { cref: TEST_CREF, ...extra });
  if (!res.ok) {
    throw new Error(`signup-professor falhou: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res;
}

export async function cleanupUser(user) {
  if (!user?.id) return;
  await adminClient.auth.admin.deleteUser(user.id).catch(() => {});
}

/** Retry simples — útil quando RLS/trigger pode levar 1 tick pra propagar. */
export async function eventually(fn, { tries = 5, interval = 100 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const result = await fn();
      if (result !== undefined) return result;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  if (lastErr) throw lastErr;
  throw new Error('eventually: condição não satisfeita');
}
