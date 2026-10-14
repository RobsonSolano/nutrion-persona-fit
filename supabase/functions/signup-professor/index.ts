// NutriOn — Edge Function signup-professor
// Promove um usuário recém-cadastrado pra role='professor' e cria a row
// correspondente em `coaches`. Chamada pelo client logo após
// `supabase.auth.signUp` na tela de signup-professor.
//
// Precisa de SERVICE_ROLE pra:
// - Driblar a trigger guard_role_changes (que bloqueia mudanças de
//   role pelo authenticated user)
// - Criar a row em coaches (RLS bloqueia INSERT pelo authenticated)

import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { validateCredential, CREF_EXAMPLE } from '../_shared/credencial.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = {
  bio?: string | null;
  cref?: string | null;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!SERVICE_ROLE_KEY) {
    return json(
      {
        error: 'missing_service_role',
        detail:
          'SUPABASE_SERVICE_ROLE_KEY não configurada nos secrets da função.',
      },
      500,
    );
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing bearer token' }, 401);
    }

    // Cliente authenticated pra identificar o caller via JWT.
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabaseAuth.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const bio = body.bio?.trim() || null;
    const cref = body.cref?.trim() || null;

    // CREF/CRN é OBRIGATÓRIO — credencial profissional valida que o user
    // é mesmo um profissional, e fica visível no painel pra distinguir
    // de um user que só marcou "sou professor" por engano.
    //
    // A validação é ESTRUTURAL (formato + UF/região + anti-degenerado). Não
    // existe API pública que prove o registro, então isto barra o lixo óbvio
    // ("999999-G/SP"), não a fraude deliberada. Ver src/lib/cref.ts.
    if (!cref) {
      return json(
        {
          error: 'cref_required',
          detail: `Informe seu CREF (Educação Física) ou CRN (Nutrição). Ex: ${CREF_EXAMPLE}.`,
        },
        400,
      );
    }
    const credencial = validateCredential(cref);
    if (!credencial.ok) {
      return json({ error: 'cref_invalid', detail: credencial.reason }, 400);
    }
    // Grava sempre a forma canônica — o painel e a busca comparam texto.
    const crefNormalizado = credencial.value;

    // Cliente service_role: dribla RLS e a trigger guard_role_changes.
    const supabaseService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verifica idempotência: se já é professor, retorna OK sem refazer.
    const { data: existing, error: existingErr } = await supabaseService
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (existingErr) {
      console.error('[signup-professor] profile fetch error:', existingErr);
      return json({ error: 'profile_fetch_failed' }, 500);
    }

    if (existing.role === 'aluno') {
      return json(
        {
          error: 'already_student',
          detail: 'Esta conta já está vinculada como aluno e não pode virar professor.',
        },
        409,
      );
    }

    if (existing.role !== 'professor') {
      // Promove + marca onboarding como completo (professor não passa
      // pelo fluxo de onboarding do app — esse é só pra usuários que
      // querem o plano gerado pela IA pra eles mesmos).
      const { error: updateErr } = await supabaseService
        .from('profiles')
        .update({
          role: 'professor',
          onboarding_completed_at: new Date().toISOString(),
          onboarding_skipped_at: null,
        })
        .eq('id', user.id);
      if (updateErr) {
        console.error('[signup-professor] role update error:', updateErr);
        return json({ error: 'role_update_failed' }, 500);
      }
    }

    // Upsert em coaches: pode rodar de novo se a primeira tentativa falhou
    // após o role já ter sido setado (tolerante a retry).
    const { data: coach, error: upsertErr } = await supabaseService
      .from('coaches')
      .upsert({
        id: user.id,
        bio,
        cref: crefNormalizado,
      })
      .select('*')
      .single();
    if (upsertErr) {
      console.error('[signup-professor] coach upsert error:', upsertErr);
      return json({ error: 'coach_create_failed' }, 500);
    }

    return json({ coach });
  } catch (err) {
    console.error('[signup-professor] unexpected error:', err);
    return json(
      {
        error: 'internal_error',
        detail: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
