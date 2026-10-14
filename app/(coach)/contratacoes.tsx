import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import {
  ArrowLeft,
  Ban,
  Inbox,
  Mail,
  MessageCircle,
  Phone,
} from 'lucide-react-native';
import { Button, Card, ConfirmModal, Screen, SegmentedControl } from '@/components/ui';
import { useAlert } from '@/components/GlobalAlertProvider';
import { colors } from '@/lib/theme';
import { formatPhoneBR, whatsappUrl } from '@/lib/phone';
import {
  useBlockUser,
  useCoachEnrollmentRequests,
  useRespondToEnrollment,
} from '@/hooks/useEnrollment';
import {
  ENROLLMENT_STATUS_LABELS,
  type CoachEnrollmentRequest,
  type EnrollmentStatus,
} from '@/services/enrollment';

type Filtro = 'abertas' | EnrollmentStatus;

const FILTROS = [
  { value: 'abertas', label: 'Abertas' },
  { value: 'andamento', label: 'Andam.' },
  { value: 'efetuado', label: 'Efetuad.' },
  { value: 'cancelado', label: 'Cancel.' },
] as const;

const STATUS_STYLE: Record<EnrollmentStatus, { chip: string; text: string }> = {
  pendente: { chip: 'bg-warn/10 border-warn/40', text: 'text-warn' },
  andamento: { chip: 'bg-info/10 border-info/30', text: 'text-info' },
  efetuado: { chip: 'bg-accent/15 border-accent/40', text: 'text-accent-soft' },
  cancelado: { chip: 'bg-danger/10 border-danger/30', text: 'text-danger' },
};

export default function ContratacoesScreen() {
  const router = useRouter();
  const alert = useAlert();
  const q = useCoachEnrollmentRequests();
  const respondM = useRespondToEnrollment();
  const blockM = useBlockUser();

  const [filtro, setFiltro] = useState<Filtro>('abertas');
  const [recusando, setRecusando] = useState<CoachEnrollmentRequest | null>(null);
  const [motivo, setMotivo] = useState('');
  const [bloqueando, setBloqueando] = useState<CoachEnrollmentRequest | null>(null);
  const [efetivando, setEfetivando] = useState<CoachEnrollmentRequest | null>(null);

  const rows = q.data ?? [];
  const visiveis =
    filtro === 'abertas'
      ? rows.filter((r) => r.status === 'pendente')
      : rows.filter((r) => r.status === filtro);

  async function responder(
    request: CoachEnrollmentRequest,
    action: 'andamento' | 'efetuado' | 'cancelado',
    cancelReason?: string,
  ) {
    try {
      await respondM.mutateAsync({ requestId: request.id, action, cancelReason });
      setRecusando(null);
      setEfetivando(null);
      setMotivo('');
      if (action === 'efetuado') {
        alert.showAlert({
          title: 'Aluno vinculado',
          message: `${request.student_name ?? 'O aluno'} agora aparece na sua lista. O treino e as metas passam a ser seus.`,
          type: 'success',
        });
      }
    } catch (err) {
      setRecusando(null);
      setEfetivando(null);
      alert.showError(err);
    }
  }

  async function bloquear() {
    if (!bloqueando) return;
    try {
      await blockM.mutateAsync(bloqueando.student_id);
      setBloqueando(null);
      alert.showAlert({
        title: 'Usuário bloqueado',
        message: 'Ele não te encontra mais na busca e não consegue solicitar de novo.',
        type: 'success',
      });
    } catch (err) {
      setBloqueando(null);
      alert.showError(err);
    }
  }

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
          <Text className="text-text font-semibold">Contratações</Text>
          <Pressable
            onPress={() => router.push('/(coach)/bloqueados' as Href)}
            hitSlop={12}
            className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <Ban size={17} color={colors.textDim} />
          </Pressable>
        </View>

        <View className="px-5 pt-4">
          <SegmentedControl
            options={FILTROS.map((f) => ({ value: f.value, label: f.label }))}
            value={filtro}
            onChange={(v) => setFiltro(v as Filtro)}
          />
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
            {visiveis.length === 0 ? (
              <Empty filtro={filtro} />
            ) : (
              visiveis.map((r) => (
                <RequestCard
                  key={r.id}
                  request={r}
                  busy={respondM.isPending}
                  onAndamento={() => void responder(r, 'andamento')}
                  onEfetivar={() => setEfetivando(r)}
                  onRecusar={() => {
                    setMotivo('');
                    setRecusando(r);
                  }}
                  onBloquear={() => setBloqueando(r)}
                />
              ))
            )}
          </ScrollView>
        )}

        {/* Efetivar é irreversível pelo app: o vínculo passa a valer na hora. */}
        <ConfirmModal
          visible={!!efetivando}
          onClose={() => setEfetivando(null)}
          title="Aceitar como aluno?"
          message={`${efetivando?.student_name ?? 'O usuário'} vira seu aluno agora. Você passa a ver todo o histórico dele e a controlar o treino e as metas. Para desfazer, é preciso desvincular.`}
          dismissable={!respondM.isPending}
          actions={[
            {
              label: 'Aceitar',
              onPress: () => {
                if (efetivando) void responder(efetivando, 'efetuado');
              },
              loading: respondM.isPending,
            },
            { label: 'Voltar', variant: 'ghost', onPress: () => setEfetivando(null) },
          ]}
        />

        <ConfirmModal
          visible={!!recusando}
          onClose={() => setRecusando(null)}
          title="Recusar solicitação?"
          message="O usuário continua como está e é avisado. Você pode escrever um motivo — ele vê o texto."
          dismissable={!respondM.isPending}
          content={
            <View className="w-full mt-2">
              <TextInput
                value={motivo}
                onChangeText={setMotivo}
                placeholder="Motivo (opcional)"
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.accent}
                multiline
                maxLength={300}
                className="rounded-2xl border border-border bg-surface px-4 py-3 text-text text-sm"
                style={{ minHeight: 72, textAlignVertical: 'top' }}
              />
            </View>
          }
          actions={[
            {
              label: 'Recusar',
              variant: 'danger',
              onPress: () => {
                if (recusando) {
                  void responder(recusando, 'cancelado', motivo.trim() || undefined);
                }
              },
              loading: respondM.isPending,
            },
            { label: 'Voltar', variant: 'ghost', onPress: () => setRecusando(null) },
          ]}
        />

        <ConfirmModal
          visible={!!bloqueando}
          onClose={() => setBloqueando(null)}
          title="Bloquear usuário?"
          message="Ele deixa de te ver na busca e não consegue mandar solicitação de novo. A solicitação aberta é encerrada. Ele não é avisado do bloqueio."
          dismissable={!blockM.isPending}
          actions={[
            {
              label: 'Bloquear',
              variant: 'danger',
              onPress: bloquear,
              loading: blockM.isPending,
            },
            { label: 'Voltar', variant: 'ghost', onPress: () => setBloqueando(null) },
          ]}
        />
      </Screen>
    </>
  );
}

function RequestCard({
  request,
  busy,
  onAndamento,
  onEfetivar,
  onRecusar,
  onBloquear,
}: {
  request: CoachEnrollmentRequest;
  busy: boolean;
  onAndamento: () => void;
  onEfetivar: () => void;
  onRecusar: () => void;
  onBloquear: () => void;
}) {
  const style = STATUS_STYLE[request.status];
  const aberta = request.status === 'pendente' || request.status === 'andamento';
  const data = new Date(request.created_at).toLocaleDateString('pt-BR');

  return (
    <Card padding="md">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-text font-semibold text-sm" numberOfLines={1}>
            {request.student_name ?? 'Usuário'}
          </Text>
          {request.student_email ? (
            <View className="flex-row items-center gap-1.5 mt-1">
              <Mail size={11} color={colors.textMuted} />
              <Text className="text-text-muted text-[11px]" numberOfLines={1}>
                {request.student_email}
              </Text>
            </View>
          ) : null}
          <Text className="text-text-muted text-[11px] mt-0.5">Em {data}</Text>
        </View>
        <View className={`px-2.5 py-1 rounded-full border ${style.chip}`}>
          <Text className={`text-[11px] font-bold ${style.text}`}>
            {ENROLLMENT_STATUS_LABELS[request.status]}
          </Text>
        </View>
      </View>

      {request.contact_phone ? (
        <View className="mt-3 rounded-2xl border border-border bg-surface-muted p-3">
          <View className="flex-row items-center gap-2">
            <Phone size={13} color={colors.textDim} />
            <Text className="text-text text-sm font-semibold flex-1">
              {formatPhoneBR(request.contact_phone)}
            </Text>
          </View>
          {/* O combinado acontece fora do app — não existe chat aqui. */}
          <View className="flex-row gap-2 mt-3">
            <Pressable
              onPress={() => void Linking.openURL(whatsappUrl(request.contact_phone!))}
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl border border-accent/40 bg-accent/10 py-2.5 active:opacity-70"
            >
              <MessageCircle size={14} color={colors.accent} />
              <Text className="text-accent text-xs font-semibold">WhatsApp</Text>
            </Pressable>
            <Pressable
              onPress={() => void Linking.openURL(`tel:${request.contact_phone}`)}
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface py-2.5 active:opacity-70"
            >
              <Phone size={14} color={colors.textDim} />
              <Text className="text-text-dim text-xs font-semibold">Ligar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {request.message ? (
        <View className="mt-3 rounded-2xl border border-border bg-surface-muted p-3">
          <Text className="text-text-dim text-xs leading-relaxed">
            {request.message}
          </Text>
        </View>
      ) : null}

      {request.status === 'cancelado' && request.cancel_reason ? (
        <Text className="text-text-muted text-[11px] mt-3 leading-relaxed">
          Motivo: {request.cancel_reason}
        </Text>
      ) : null}

      {aberta && (
        <View className="mt-4 gap-2">
          <Button
            label="Aceitar como aluno"
            onPress={onEfetivar}
            disabled={busy}
            size="md"
            fullWidth
          />
          <View className="flex-row gap-2">
            {request.status === 'pendente' && (
              <View className="flex-1">
                <Button
                  label="Em andamento"
                  variant="secondary"
                  size="md"
                  onPress={onAndamento}
                  disabled={busy}
                  fullWidth
                />
              </View>
            )}
            <View className="flex-1">
              <Button
                label="Recusar"
                variant="danger"
                size="md"
                onPress={onRecusar}
                disabled={busy}
                fullWidth
              />
            </View>
          </View>
          <Pressable
            onPress={onBloquear}
            className="self-center pt-1 active:opacity-70"
          >
            <Text className="text-text-muted text-[11px]">
              Recusar e bloquear este usuário
            </Text>
          </Pressable>
        </View>
      )}
    </Card>
  );
}

function Empty({ filtro }: { filtro: Filtro }) {
  const texto: Record<Filtro, string> = {
    abertas: 'Nenhuma solicitação nova. Quando alguém pedir pra ser seu aluno, aparece aqui.',
    pendente: 'Nenhuma pendente.',
    andamento: 'Nenhuma em andamento. Marque assim as que você já está conversando.',
    efetuado: 'Nenhuma contratação efetivada ainda.',
    cancelado: 'Nenhuma recusada.',
  };
  return (
    <View className="items-center px-8 pt-16">
      <View className="h-16 w-16 rounded-3xl bg-surface-raised border border-border items-center justify-center mb-4">
        <Inbox size={26} color={colors.textMuted} />
      </View>
      <Text className="text-text-muted text-xs text-center leading-relaxed">
        {texto[filtro]}
      </Text>
    </View>
  );
}
