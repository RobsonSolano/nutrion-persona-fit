import { supabase } from './supabase';

/** Aviso remoto ([AVI]): título + texto, botão opcional. */
export type Announcement = {
  id: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_url: string | null;
};

/** Avisos ativos, do público do usuário, que ele ainda não viu — mais antigo primeiro. */
export async function listPendingAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase.rpc('my_pending_announcements');
  if (error) throw error;
  return (data ?? []) as Announcement[];
}

export async function markAnnouncementSeen(id: string): Promise<void> {
  const { error } = await supabase.rpc('mark_announcement_seen', { p_id: id });
  if (error) throw error;
}
