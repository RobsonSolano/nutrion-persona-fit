import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Ban, ShieldCheck } from 'lucide-react-native';
import { Button, Card, ConfirmModal, Screen } from '@/components/ui';
import { useAlert } from '@/components/GlobalAlertProvider';
import { colors } from '@/lib/theme';
import { useBlockedUsers, useUnblockUser } from '@/hooks/useEnrollment';
import type { BlockedUser } from '@/services/enrollment';

export default function BloqueadosScreen() {
  const router = useRouter();
  const alert = useAlert();
  const q = useBlockedUsers();
  const unblockM = useUnblockUser();
  const [desbloqueando, setDesbloqueando] = useState<BlockedUser | null>(null);

  async function desbloquear() {
    if (!desbloqueando) return;
    try {
      await unblockM.mutateAsync(desbloqueando.user_id);
      setDesbloqueando(null);
    } catch (err) {
      setDesbloqueando(null);
      alert.showError(err);
    }
  }

  const rows = q.data ?? [];

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Screen variant="hero" edges={['top', 'bottom']}>
        <View className="flex-row items-center px-5 py-3 border-b border-border-subtle">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <ArrowLeft size={18} color={colors.textDim} />
          </Pressable>
          <Text className="text-text font-semibold ml-3">Usuários bloqueados</Text>
        </View>

        {q.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 60 }}
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
            {rows.length === 0 ? (
              <View className="items-center px-8 pt-16">
                <View className="h-16 w-16 rounded-3xl bg-surface-raised border border-border items-center justify-center mb-4">
                  <ShieldCheck size={26} color={colors.textMuted} />
                </View>
                <Text className="text-text font-semibold text-center">
                  Ninguém bloqueado
                </Text>
                <Text className="text-text-muted text-xs text-center mt-2 leading-relaxed">
                  Bloquear serve pra quem insiste em solicitar depois de você
                  recusar. O bloqueado some da sua fila e não te encontra mais na
                  busca.
                </Text>
              </View>
            ) : (
              rows.map((u) => (
                <Card key={u.user_id} padding="md">
                  <View className="flex-row items-center gap-3">
                    <View className="h-10 w-10 rounded-2xl bg-danger/10 border border-danger/30 items-center justify-center">
                      <Ban size={17} color={colors.danger} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-text text-sm font-semibold" numberOfLines={1}>
                        {u.full_name ?? 'Usuário'}
                      </Text>
                      <Text className="text-text-muted text-[11px] mt-0.5">
                        Bloqueado em{' '}
                        {new Date(u.created_at).toLocaleDateString('pt-BR')}
                      </Text>
                    </View>
                    <Button
                      label="Desbloquear"
                      variant="ghost"
                      size="sm"
                      onPress={() => setDesbloqueando(u)}
                    />
                  </View>
                </Card>
              ))
            )}
          </ScrollView>
        )}

        <ConfirmModal
          visible={!!desbloqueando}
          onClose={() => setDesbloqueando(null)}
          title="Desbloquear?"
          message={`${desbloqueando?.full_name ?? 'O usuário'} volta a te ver na busca e pode solicitar de novo.`}
          dismissable={!unblockM.isPending}
          actions={[
            {
              label: 'Desbloquear',
              onPress: desbloquear,
              loading: unblockM.isPending,
            },
            { label: 'Voltar', variant: 'ghost', onPress: () => setDesbloqueando(null) },
          ]}
        />
      </Screen>
    </>
  );
}
