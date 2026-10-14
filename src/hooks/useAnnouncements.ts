import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import {
  listPendingAnnouncements,
  markAnnouncementSeen,
  type Announcement,
} from '@/services/announcements';

const pendingKey = (uid: string) => ['announcements_pending', uid] as const;

export function usePendingAnnouncements() {
  const { user } = useAuth();
  return useQuery({
    queryKey: pendingKey(user?.id ?? 'anon'),
    queryFn: listPendingAnnouncements,
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });
}

export function useMarkAnnouncementSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAnnouncementSeen,
    // Tira o aviso visto do cache em vez de buscar a lista de novo.
    onSuccess: (_r, id) => {
      qc.setQueriesData<Announcement[]>({ queryKey: ['announcements_pending'] }, (old) =>
        old?.filter((a) => a.id !== id),
      );
    },
  });
}
