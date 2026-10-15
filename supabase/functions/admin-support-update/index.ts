// Persona Fit — Edge function admin-support-update
// Painel admin responde ou muda a situação de uma mensagem de suporte/sugestão.
// A regra de acesso, a gravação e o "a resposta mudou?" ficam no banco
// (admin_support_update); aqui só se acrescenta o push quando ela mudou.

import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { sendExpoPush } from '../_shared/expoPush.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = { id?: string; status?: string; reply?: string | null };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'missing_token' });

  let body: Body;
  try {
    body = (await req.json()) ?? {};
  } catch {
    return json(400, { error: 'invalid_body' });
  }
  if (!body.id || !body.status) return json(400, { error: 'missing_fields' });

  // Como o próprio admin: a função do banco checa is_admin.
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabaseUser.rpc('admin_support_update', {
    p_id: body.id,
    p_status: body.status,
    p_reply: body.reply ?? null,
  });
  if (error) {
    const status = error.message === 'forbidden' ? 403 : error.message === 'not_found' ? 404 : 400;
    return json(status, { error: error.message });
  }

  const { message: row, reply_changed } = data as {
    message: { id: string; user_id: string; kind: string; title: string };
    reply_changed: boolean;
  };

  // Push só quando a resposta mudou — mudar a situação sozinha não avisa.
  let pushed = false;
  if (reply_changed) {
    const result = await sendExpoPush(supabaseService, row.user_id, {
      title: row.kind === 'sugestao' ? 'Respondemos sua sugestão' : 'Respondemos sua mensagem',
      body: row.title,
      data: { event: 'support_reply', message_id: row.id },
    });
    pushed = result.ok && !result.skipped;
  }

  return json(200, { message: row, reply_changed, pushed });
});
