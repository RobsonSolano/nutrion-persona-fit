import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { ArrowLeft, Search, UserPlus } from 'lucide-react-native';
import { Button, Card, ConfirmModal, Screen } from '@/components/ui';
import { useAlert } from '@/components/GlobalAlertProvider';
import { colors } from '@/lib/theme';
import {
  useCancelMyRequest,
  useMyEnrollmentRequests,
} from '@/hooks/useEnrollment';
import {
  ENROLLMENT_STATUS_LABELS,
  type EnrollmentStatus,
  type MyEnrollmentRequest,
} from '@/services/enrollment';

/** Verde no efetuado, vermelho no cancelado — pedido explícito do produto. */
const STATUS_STYLE: Record<
  EnrollmentStatus,
  { chip: string; text: string }
> = {
  pendente: { chip: 'bg-surface-raised border-border', text: 'text-text-dim' },
  andamento: { chip: 'bg-info/10 border-info/30', text: 'text-info' },
  efetuado: { chip: 'bg-accent/15 border-accent/40', text: 'text-accent-soft' },
  cancelado: { chip: 'bg-danger/10 border-danger/30', text: 'text-danger' },
};

export default function MinhasSolicitacoesScreen() {
  const router = useRouter();
  const alert = useAlert();
  const q = useMyEnrollmentRequests();
  const cancelM = useCancelMyRequest();
  const [cancelando, setCancelando] = useState<string | null>(null);

  async function confirmarCancelamento() {
    if (!cancelando) return;
    try {
      await cancelM.mutateAsync(cancelando);
      setCancelando(null);
    } catch (err) {
      setCancelando(null);
      alert.showError(err);
    }
  }

  const rows = q.data ?? [];

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Screen variant="hero" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-border-subtle">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <ArrowLeft size={18} color={colors.textDim} />
          </Pressable>
          <Text className="text-text font-semibold">Minhas solicitações</Text>
          <Pressable
            onPress={() => router.push('/encontrar-professor' as Href)}
            hitSlop={12}
            className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <Search size={18} color={colors.textDim} />
          </Pressable>
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
              <Empty onBuscar={() => router.push('/encontrar-professor' as Href)} />
            ) : (
              rows.map((r) => (
                <RequestCard
                  key={r.id}
                  request={r}
                  onCancel={() => setCancelando(r.id)}
                />
              ))
            )}
          </ScrollView>
        )}

        <ConfirmModal
          visible={!!cancelando}
          onClose={() => setCancelando(null)}
          title="Cancelar solicitação?"
          message="O professor deixa de ver seu pedido. Você pode solicitar de novo depois."
          dismissable={!cancelM.isPending}
          actions={[
            {
              label: 'Cancelar solicitação',
              variant: 'danger',
              onPress: confirmarCancelamento,
              loading: cancelM.isPending,
            },
            { label: 'Voltar', variant: 'ghost', onPress: () => setCancelando(null) },
          ]}
        />
      </Screen>
    </>
  );
}

function RequestCard({
  request,
  onCancel,
}: {
  request: MyEnrollmentRequest;
  onCancel: () => void;
}) {
  const style = STATUS_STYLE[request.status];
  const data = new Date(request.created_at).toLocaleDateString('pt-BR');

  return (
    <Card padding="md">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-text font-semibold text-sm" numberOfLines={1}>
            {request.coach_name ?? 'Professor'}
          </Text>
          <Text className="text-text-muted text-[11px] mt-0.5">
            Enviada em {data}
          </Text>
        </View>
        <View className={`px-2.5 py-1 rounded-full border ${style.chip}`}>
          <Text className={`text-[11px] font-bold ${style.text}`}>
            {ENROLLMENT_STATUS_LABELS[request.status]}
          </Text>
        </View>
      </View>

      {request.status === 'cancelado' && request.cancel_reason ? (
        <Text className="text-text-dim text-xs mt-3 leading-relaxed">
          {request.cancel_reason}
        </Text>
      ) : null}

      {request.status === 'efetuado' ? (
        <Text className="text-text-dim text-xs mt-3 leading-relaxed">
          Você agora é aluno deste professor. O plano e os treinos passam a ser
          acompanhados por ele.
        </Text>
      ) : null}

      {request.status === 'pendente' && (
        <View className="mt-3">
          <Button label="Cancelar" variant="ghost" size="sm" onPress={onCancel} />
        </View>
      )}
    </Card>
  );
}

function Empty({ onBuscar }: { onBuscar: () => void }) {
  return (
    <View className="items-center px-6 pt-16">
      <View className="h-16 w-16 rounded-3xl bg-surface-raised border border-border items-center justify-center mb-4">
        <UserPlus size={26} color={colors.textMuted} />
      </View>
      <Text className="text-text font-semibold text-center">
        Você ainda não pediu pra ser aluno
      </Text>
      <Text className="text-text-muted text-xs text-center mt-2 leading-relaxed">
        Encontre um professor pela região, especialidade e tipo de atendimento.
      </Text>
      <View className="mt-5 self-stretch">
        <Button label="Encontre um professor" onPress={onBuscar} fullWidth />
      </View>
    </View>
  );
}
