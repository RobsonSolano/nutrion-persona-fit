import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  ArrowLeft,
  ChevronRight,
  LifeBuoy,
  MessageSquarePlus,
} from 'lucide-react-native';
import { Button, Card, Screen } from '@/components/ui';
import {
  NewReplyBadge,
  SupportKindBadge,
  SupportStatusText,
  formatSupportDate,
} from '@/components/support/SupportBadges';
import { colors } from '@/lib/theme';
import { hasUnseenReply } from '@/lib/support';
import { useMySupportMessages } from '@/hooks/useSupport';
import type { SupportMessage } from '@/services/support';

export default function SuporteScreen() {
  const router = useRouter();
  const q = useMySupportMessages();
  const rows = q.data ?? [];

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
          Suporte e sugestões
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 100,
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
        <Text className="text-text-dim text-sm leading-relaxed">
          Achou um problema ou tem uma ideia? Manda pra gente — respondemos por
          aqui.
        </Text>

        <Button
          label="Nova mensagem"
          onPress={() => router.push('/suporte/nova' as Href)}
          variant="primary"
          icon={<MessageSquarePlus size={18} color={colors.textInverse} />}
        />

        {q.isLoading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color={colors.violetSoft} />
          </View>
        ) : q.isError ? (
          <View className="py-10 items-center px-6">
            <Text className="text-danger text-sm text-center">
              Não consegui carregar suas mensagens. Puxe pra baixo pra tentar de
              novo.
            </Text>
          </View>
        ) : rows.length === 0 ? (
          <Card padding="md">
            <View className="items-center gap-2 py-8">
              <View className="h-12 w-12 rounded-2xl bg-violet/10 border border-violet/30 items-center justify-center">
                <LifeBuoy size={20} color={colors.violetSoft} />
              </View>
              <Text className="text-text text-sm font-semibold">
                Nenhuma mensagem ainda
              </Text>
              <Text className="text-text-muted text-xs text-center px-4 leading-relaxed">
                Quando você mandar uma dúvida, problema ou sugestão, ela aparece
                aqui junto com a nossa resposta.
              </Text>
            </View>
          </Card>
        ) : (
          rows.map((m) => (
            <MessageCard
              key={m.id}
              message={m}
              onPress={() => router.push(`/suporte/${m.id}` as Href)}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function MessageCard({
  message,
  onPress,
}: {
  message: SupportMessage;
  onPress: () => void;
}) {
  const hasNewReply = hasUnseenReply(message);

  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <Card padding="md">
        <View className="flex-row items-center justify-between mb-2 gap-2">
          <View className="flex-row items-center gap-2">
            <SupportKindBadge kind={message.kind} />
            {hasNewReply && <NewReplyBadge />}
          </View>
          <Text className="text-text-muted text-[11px]">
            {formatSupportDate(message.created_at)}
          </Text>
        </View>

        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <Text
              className="text-text text-sm font-semibold leading-relaxed"
              numberOfLines={2}
            >
              {message.title}
            </Text>
            <View className="mt-1">
              <SupportStatusText status={message.status} />
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </View>
      </Card>
    </Pressable>
  );
}
