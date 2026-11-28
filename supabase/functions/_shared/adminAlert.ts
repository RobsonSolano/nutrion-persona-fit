// Aviso aos admins do Persona Fit (tabela admin_users) por e-mail e push.
//
// O e-mail é o canal que chega mesmo sem push habilitado no celular: em
// 2026-11-10 o único admin não tinha token, e o alerta de IA nunca tinha sido
// entregue. Movido do cron-ai-quota-alert para servir também ao
// cron-instagram-publish (falha ou atraso de publicação).

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { sendExpoPush } from './expoPush.ts';

const GMAIL_USER = Deno.env.get('GMAIL_USER');
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD');

/** Manda o alerta por e-mail (Gmail SMTP, mesmos secrets do
 *  coach-send-credentials) para o e-mail de conta de cada admin, um envio por
 *  destinatário. Falha de SMTP não lança: volta em `emailError` para dar pra
 *  diagnosticar sem acesso aos logs. */
export async function emailAdmins(
  // deno-lint-ignore no-explicit-any
  supa: any,
  adminIds: string[],
  title: string,
  body: string,
): Promise<{ emailed: number; emailError: string | null }> {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return { emailed: 0, emailError: 'missing_smtp_secret' };
  }
  const users = await Promise.all(adminIds.map((id) => supa.auth.admin.getUserById(id)));
  const failed = users.find((u) => u.error);
  if (failed) return { emailed: 0, emailError: `get_user: ${failed.error.message}` };
  const emails: string[] = users.map((u) => u.data?.user?.email).filter(Boolean);
  if (emails.length === 0) return { emailed: 0, emailError: 'no_admin_email' };

  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 465,
      tls: true,
      auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
    },
  });
  let emailed = 0;
  let emailError: string | null = null;
  try {
    for (const to of emails) {
      await client.send({
        from: `Persona Fit <${GMAIL_USER}>`,
        to,
        subject: title,
        content: body,
        html: `<p>${body}</p>`,
      });
      emailed++;
    }
  } catch (err) {
    console.error('[adminAlert] falha no e-mail:', err);
    emailError = `smtp: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300);
  } finally {
    // close() pode ser void ou Promise conforme a versão, e pode lançar.
    try {
      await client.close();
    } catch {
      // conexão já fechada — nada a fazer
    }
  }
  return { emailed, emailError };
}

/** IDs de quem está em admin_users. Fonte única de "quem é admin" para os
 *  alertas (cron-ai-quota-alert e cron-instagram-publish). */
export async function listAdminIds(
  // deno-lint-ignore no-explicit-any
  supa: any,
): Promise<{ ids: string[]; error: string | null }> {
  const { data, error } = await supa.from('admin_users').select('id');
  if (error) return { ids: [], error: error.message };
  return { ids: (data ?? []).map((r: { id: string }) => r.id).filter(Boolean), error: null };
}

/** Busca os admins e avisa por e-mail e push. Nunca lança: aviso é
 *  secundário e não pode derrubar quem chama. */
export async function alertAdmins(
  // deno-lint-ignore no-explicit-any
  supa: any,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<{ emailed: number; pushed: number; error: string | null }> {
  try {
    const { ids: adminIds, error } = await listAdminIds(supa);
    if (error) return { emailed: 0, pushed: 0, error: `admins: ${error}` };
    if (adminIds.length === 0) return { emailed: 0, pushed: 0, error: 'no_admins' };

    const [{ emailed, emailError }, pushes] = await Promise.all([
      emailAdmins(supa, adminIds, title, body),
      Promise.all(adminIds.map((id: string) => sendExpoPush(supa, id, { title, body, data }))),
    ]);
    const pushed = pushes.filter((r) => r.ok && !r.skipped).length;
    return { emailed, pushed, error: emailError };
  } catch (err) {
    return { emailed: 0, pushed: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
