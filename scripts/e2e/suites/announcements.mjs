// E2E dos avisos remotos e da config de versão (2026-10-13).
// Spec: .specs/features/2026-10-13-avisos-remotos/spec.md
//
// Os avisos são criados com o service role (como no Table Editor) e
// apagados no fim — nada fica no banco.

import { suite, expect } from '../lib/runner.mjs';
import {
  adminClient,
  anonClient,
  cleanupUser,
  createTestUser,
  promoteToCoach,
} from '../lib/clients.mjs';

const HORA = 3600_000;

async function criarAviso(ctx, fields) {
  const { data, error } = await adminClient
    .from('announcements')
    .insert({ body: 'Texto do aviso de teste.', ...fields })
    .select('id')
    .single();
  expect(error).toBe(null);
  ctx.defer(() => adminClient.from('announcements').delete().eq('id', data.id));
  return data.id;
}

async function pendentes(user) {
  const { data, error } = await user.client.rpc('my_pending_announcements');
  expect(error).toBe(null);
  return data.map((a) => a.title);
}

suite('Avisos remotos', ({ test }) => {
  test('público: comum vê o de todos e o dele, não o do professor', async (ctx) => {
    const tag = `e2e-${Date.now()}`;
    await criarAviso(ctx, { title: `${tag} todos`, audience: 'todos' });
    await criarAviso(ctx, { title: `${tag} comum`, audience: 'comum' });
    await criarAviso(ctx, { title: `${tag} professor`, audience: 'professor' });

    const comum = await createTestUser({ prefix: 'aviso-comum' });
    ctx.defer(() => cleanupUser(comum));
    const coach = await createTestUser({ prefix: 'aviso-prof' });
    ctx.defer(() => cleanupUser(coach));
    await promoteToCoach(coach);

    const doComum = (await pendentes(comum)).filter((t) => t.startsWith(tag));
    expect(doComum.includes(`${tag} todos`)).toBe(true);
    expect(doComum.includes(`${tag} comum`)).toBe(true);
    expect(doComum.includes(`${tag} professor`)).toBe(false);

    const doCoach = (await pendentes(coach)).filter((t) => t.startsWith(tag));
    expect(doCoach.includes(`${tag} professor`)).toBe(true);
    expect(doCoach.includes(`${tag} comum`)).toBe(false);
  });

  test('uma vez por usuário: visto some só pra quem viu', async (ctx) => {
    const tag = `e2e-${Date.now()}`;
    const id = await criarAviso(ctx, { title: `${tag} uma vez`, audience: 'todos' });
    const a = await createTestUser({ prefix: 'aviso-a' });
    ctx.defer(() => cleanupUser(a));
    const b = await createTestUser({ prefix: 'aviso-b' });
    ctx.defer(() => cleanupUser(b));

    const { error } = await a.client.rpc('mark_announcement_seen', { p_id: id });
    expect(error).toBe(null);
    expect((await pendentes(a)).includes(`${tag} uma vez`)).toBe(false);
    expect((await pendentes(b)).includes(`${tag} uma vez`)).toBe(true);

    // Ninguém lê as views dos outros nem a tabela de avisos direto.
    const { data: views } = await b.client.from('announcement_views').select('user_id');
    expect(views.length).toBe(0);
    const { data: direto } = await b.client.from('announcements').select('id');
    expect(direto.length).toBe(0);
  });

  test('período e ativo: futuro, encerrado e desativado não aparecem', async (ctx) => {
    const tag = `e2e-${Date.now()}`;
    const agora = Date.now();
    await criarAviso(ctx, {
      title: `${tag} futuro`,
      starts_at: new Date(agora + HORA).toISOString(),
    });
    await criarAviso(ctx, {
      title: `${tag} encerrado`,
      starts_at: new Date(agora - 3 * HORA).toISOString(),
      ends_at: new Date(agora - HORA).toISOString(),
    });
    await criarAviso(ctx, { title: `${tag} desativado`, active: false });
    const u = await createTestUser({ prefix: 'aviso-periodo' });
    ctx.defer(() => cleanupUser(u));

    expect((await pendentes(u)).filter((t) => t.startsWith(tag)).length).toBe(0);
  });

  test('app_config é legível deslogado e não editável pelo app', async (ctx) => {
    const { data, error } = await anonClient.from('app_config').select('min_version');
    expect(error).toBe(null);
    expect(data.length).toBe(1);

    const u = await createTestUser({ prefix: 'aviso-cfg' });
    ctx.defer(() => cleanupUser(u));
    const { data: alterado } = await u.client
      .from('app_config')
      .update({ min_version: '99.0.0' })
      .eq('id', true)
      .select('min_version');
    expect((alterado ?? []).length).toBe(0);
  });
});
