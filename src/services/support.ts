import { supabase } from './supabase';
import { supportErrorMessage, type SupportKind, type SupportStatus } from '@/lib/support';
import type { ProfileRole } from '@/types/database';

export type SupportMessage = {
  id: string;
  user_id: string;
  role: ProfileRole;
  kind: SupportKind;
  title: string;
  body: string;
  status: SupportStatus;
  reply: string | null;
  replied_at: string | null;
  reply_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Mensagens da pessoa logada (RLS: só as próprias), mais recentes primeiro. */
export async function listMySupportMessages(): Promise<SupportMessage[]> {
  const { data, error } = await supabase
    .from('support_messages')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupportMessage[];
}

export async function sendSupportMessage(input: { kind: SupportKind; title: string; body: string }) {
  const { data, error } = await supabase.rpc('send_support_message', {
    p_kind: input.kind,
    p_title: input.title,
    p_body: input.body,
  });
  if (error) throw new Error(supportErrorMessage(error.message));
  return data as SupportMessage;
}

export async function markSupportReplySeen(id: string) {
  const { error } = await supabase.rpc('mark_support_reply_seen', { p_id: id });
  if (error) throw error;
}
