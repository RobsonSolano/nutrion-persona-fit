import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, LifeBuoy, MessageCircleReply } from 'lucide-react-native';
import { Card, Screen } from '@/components/ui';
import {
  SupportKindBadge,
  SupportStatusText,
  formatSupportDate,
} from '@/components/support/SupportBadges';
import { colors } from '@/lib/theme';
import { hasUnseenReply } from '@/lib/support';
import {
  useMarkSupportReplySeen,
  useMySupportMessages,
} from '@/hooks/useSupport';

export default function SuporteDetalheScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useMySupportMessages();
  const { mutate: markSeen } = useMarkSupportReplySeen();
  const markedRef = useRef(false);

  const message = (q.data ?? []).find((m) => m.id === id) ?? null;
  const unseen = !!message && hasUnseenReply(message);

  // Abriu a resposta → marca como vista uma vez (zera o badge do Perfil).
  useEffect(() => {
    if (!id || !unseen || markedRef.current) return;
    markedRef.current = true;
    markSeen(id);
  }, [id, unseen, markSeen]);

  return (
    <Screen variant="hero" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-3 px-5 py-3 border-b border-border-subtle">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
        >
          <ArrowLeft size={18} color={colors.textDim} />
        </Pressable>
        <Text className="text-text font-semibold text-base flex-1">
          Sua mensagem
        </Text>
      </View>

      {q.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.violetSoft} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 60,
            gap: 14,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching}
              onRefresh={() => void q.refetch()}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        >
          {q.isError ? (
            <View className="py-10 items-center px-6">
              <Text className="text-danger text-sm text-center">
                Não consegui carregar sua mensagem. Puxe pra baixo pra tentar de
                novo.
              </Text>
            </View>
          ) : !message ? (
            <Card padding="md">
              <View className="items-center gap-2 py-8">
                <View className="h-12 w-12 rounded-2xl bg-violet/10 border border-violet/30 items-center justify-center">
                  <LifeBuoy size={20} color={colors.violetSoft} />
                </View>
                <Text className="text-text text-sm font-semibold">
                  Mensagem não encontrada
                </Text>
                <Text className="text-text-muted text-xs text-center px-4 leading-relaxed">
                  Ela pode ter sido removida. Volte pra lista de mensagens e
                  tente de novo.
                </Text>
              </View>
            </Card>
          ) : (
            <>
              <Card padding="md">
                <View className="flex-row items-center justify-between mb-3">
                  <SupportKindBadge kind={message.kind} />
                  <Text className="text-text-muted text-[11px]">
                    {formatSupportDate(message.created_at)}
                  </Text>
                </View>
                <Text className="text-text text-base font-semibold leading-snug">
                  {message.title}
                </Text>
                <View className="mt-1 mb-3">
                  <SupportStatusText status={message.status} />
                </View>
                <Text className="text-text-dim text-sm leading-relaxed">
                  {message.body}
                </Text>
              </Card>

              {message.reply ? (
                <View className="rounded-3xl border border-accent/30 bg-accent/5 p-5">
                  <View className="flex-row items-center gap-2 mb-2">
                    <MessageCircleReply size={16} color={colors.accent} />
                    <Text className="text-accent text-[10px] uppercase tracking-widest font-semibold flex-1">
                      Resposta da equipe Persona Fit
                    </Text>
                    {message.replied_at && (
                      <Text className="text-text-muted text-[11px]">
                        {formatSupportDate(message.replied_at)}
                      </Text>
                    )}
                  </View>
                  <Text className="text-text text-sm leading-relaxed">
                    {message.reply}
                  </Text>
                </View>
              ) : (
                <Text className="text-text-muted text-xs text-center leading-relaxed px-4">
                  A gente ainda não respondeu. Você recebe uma notificação assim
                  que tiver resposta.
                </Text>
              )}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
