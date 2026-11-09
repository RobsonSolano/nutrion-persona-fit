import { supabase } from './supabase';

export const MAX_MESSAGE_CHARS = 255;
/** Quantas msgs históricas mostrar na UI (msgs antigas continuam no banco). */
export const HISTORY_VISIBLE_LIMIT = 100;

export type StoredChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  day: string;
  created_at: string;
};

export async function listChatMessages(
  userId: string,
): Promise<StoredChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, day, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_VISIBLE_LIMIT);
  if (error) throw error;
  return (data ?? []) as StoredChatMessage[];
}

export async function countTodayUserMessages(userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('day', today)
    .eq('role', 'user');
  if (error) throw error;
  return count ?? 0;
}
