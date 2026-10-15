import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unreadReplies } from '@/lib/support';
import {
  listMySupportMessages,
  markSupportReplySeen,
  sendSupportMessage,
} from '@/services/support';
import { useAuth } from './useAuth';

const key = (userId: string) => ['support_messages', 'mine', userId];

export function useMySupportMessages() {
  const { user } = useAuth();
  return useQuery({
    queryKey: key(user?.id ?? 'anon'),
    queryFn: listMySupportMessages,
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

/** Quantas respostas a pessoa ainda não abriu (badge no Perfil). */
export function useUnreadSupportReplies(): number {
  const { data } = useMySupportMessages();
  return data ? unreadReplies(data) : 0;
}

// Enviar e marcar como lida mexem na mesma lista: recarrega tudo de suporte.
const ALL = ['support_messages'];

export function useSendSupportMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sendSupportMessage,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ALL }),
  });
}

export function useMarkSupportReplySeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markSupportReplySeen,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ALL }),
  });
}
