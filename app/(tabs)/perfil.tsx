import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  LogOut,
  Pencil,
  User as UserIcon,
  Target,
  Activity,
  Ruler,
  Droplet,
  Sparkles,
  Crown,
  Gift,
  RefreshCw,
  AlertTriangle,
  MessagesSquare,
  Search,
  UserPlus,
  Lock,
  Download,
  Bell,
  BellOff,
  TrendingUp,
  HeartPulse,
  LifeBuoy,
} from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useResetOnboarding } from '@/hooks/useOnboarding';
import { usePushToggle } from '@/hooks/usePushToggle';
import { useUnreadStudentRequests } from '@/hooks/useRequests';
import { useUnreadSupportReplies } from '@/hooks/useSupport';
import { useAlert } from '@/components/GlobalAlertProvider';
import type { ResetOnboardingMode } from '@/services/onboarding';
import { useDailyOnboardingUsage } from '@/hooks/useAiUsage';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { Button, Card, ConfirmModal, CountBadge, Screen } from '@/components/ui';
import CoachCard from '@/components/CoachCard';
import SubscriptionCard from '@/components/SubscriptionCard';
import StudentAssessmentCard from '@/components/StudentAssessmentCard';
import { Avatar } from '@/components/ui';
import Disclaimer from '@/components/Disclaimer';
import { useMyEnrollmentRequests } from '@/hooks/useEnrollment';
import { colors } from '@/lib/theme';
import { bmi, bmiCategory } from '@/lib/biometrics';

type RedoStep = 'closed' | 'choose' | 'confirmDiscard';

export default function PerfilScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const profileQ = useProfile();
  const profile = profileQ.data;
  const resetOnboardingM = useResetOnboarding();
  const resetOnboardingStore = useOnboardingStore((s) => s.reset);
  const onboardingUsage = useDailyOnboardingUsage();

  const [redoStep, setRedoStep] = useState<RedoStep>('closed');
  const [logoutOpen, setLogoutOpen] = useState(false);

  const push = usePushToggle();
  const unreadQ = useUnreadStudentRequests();
  const unreadSupport = useUnreadSupportReplies();
  const alert = useAlert();

  const hasCompletedOnboarding = !!profile?.onboarding_completed_at;
  const refazerBlocked =
    hasCompletedOnboarding && onboardingUsage.limitReached;
  const isEarlyAdopter = profile?.is_early_adopter === true;
  const isStudent = profile?.role === 'aluno';
  const isComum = profile?.role === 'comum';
  // Só o usuário comum contrata: aluno já tem professor, professor não usa
  // estas tabs.
  const myRequestsQ = useMyEnrollmentRequests();
  const solicitacoesAbertas = (myRequestsQ.data ?? []).filter(
    (r) => r.status === 'pendente' || r.status === 'andamento',
  ).length;

  async function executeReset(mode: ResetOnboardingMode) {
    setRedoStep('closed');
    try {
      resetOnboardingStore();
      await resetOnboardingM.mutateAsync(mode);
      router.push('/onboarding' as Href);
    } catch (err) {
      alert.showError(err);
    }
  }

  function handleRedoOnboarding() {
    if (refazerBlocked) {
      alert.showAlert({
        title: 'Limite diário',
        message: 'Você já refez seu plano hoje. Tenta de novo amanhã.',
        type: 'info',
      });
      return;
    }
    if (!hasCompletedOnboarding) {
      void executeReset('merge');
      return;
    }
    setRedoStep('choose');
  }

  const displayName =
    profile?.full_name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email ??
    'Atleta Persona Fit';

  const formatKg = (v: number | null | undefined) =>
    v == null ? '—' : `${v.toLocaleString('pt-BR')} kg`;
  const formatCm = (v: number | null | undefined) =>
    v == null ? '—' : `${v.toLocaleString('pt-BR')} cm`;

  const imcValue =
    profile?.weight_kg && profile?.height_cm
      ? bmi(profile.weight_kg, profile.height_cm)
      : null;
  const imcCat = imcValue != null ? bmiCategory(imcValue) : null;

  const resetPending = resetOnboardingM.isPending;

  return (
    <Screen variant="violet">
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 140 }}>
        <View className="items-center mt-4 mb-2">
          <View
            style={{
              shadowColor: colors.violet,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.4,
              shadowRadius: 18,
              elevation: 8,
              borderRadius: 48,
            }}
          >
            <Avatar
              url={profile?.avatar_url}
              name={displayName}
              size={96}
              accent="green"
            />
          </View>
          <Text className="text-text text-xl font-bold mt-4">{displayName}</Text>
          {user?.email && (
            <Text className="text-text-dim text-sm mt-1">{user.email}</Text>
          )}
          {isEarlyAdopter && (
            <View
              className="mt-3 flex-row items-center gap-1.5 rounded-full border px-3 py-1"
              style={{
                borderColor: `${colors.accent}55`,
                backgroundColor: `${colors.accent}15`,
              }}
            >
              <Crown size={12} color={colors.accent} />
              <Text className="text-accent text-[11px] font-bold tracking-wide">
                Founding User #{profile?.user_number}
              </Text>
            </View>
          )}
        </View>

        <Card glow accent="violet" padding="md">
          <View className="flex-row items-start gap-3">
            <View className="h-10 w-10 rounded-xl bg-violet/15 border border-violet/40 items-center justify-center">
              <Gift size={18} color={colors.violetSoft} />
            </View>
            <View className="flex-1">
              <Text className="text-text font-semibold">
                Recursos de IA gratuitos
              </Text>
              <Text className="text-text-dim text-xs mt-1 leading-relaxed">
                Chat (10/dia · 255 chars), Sanity Check (5/dia) e onboarding
                inteligente são <Text className="text-violet-soft font-semibold">temporariamente gratuitos</Text>.
                {isEarlyAdopter
                  ? ' Como early adopter, você continua com acesso quando virarem premium.'
                  : ' Aproveita enquanto está aberto.'}
              </Text>
            </View>
          </View>
        </Card>

        <SubscriptionCard />

        <Card padding="md">
          <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
            Conta
          </Text>
          {/* Ação principal do usuário comum: linha inteira. Em meia largura o
              rótulo não cabia e quebrava em duas linhas. */}
          {isComum && (
            <View className="mb-2">
              <Button
                label="Encontre um professor"
                onPress={() => router.push('/encontrar-professor' as Href)}
                variant="primary"
                size="md"
                icon={<Search size={16} color={colors.textInverse} />}
              />
            </View>
          )}
          <View className="flex-row flex-wrap gap-2">
            <View style={{ width: '48.5%' }}>
              <Button
                label="Editar perfil"
                onPress={() => router.push('/editar-perfil' as Href)}
                variant="secondary"
                size="md"
                icon={<Pencil size={14} color={colors.text} />}
              />
            </View>
            {isComum && solicitacoesAbertas > 0 && (
              <View style={{ width: '48.5%' }}>
                <Button
                  label={`Solicitações (${solicitacoesAbertas})`}
                  onPress={() => router.push('/minhas-solicitacoes' as Href)}
                  variant="secondary"
                  size="md"
                  icon={<UserPlus size={14} color={colors.violetSoft} />}
                />
              </View>
            )}
            {isStudent && (
              <View style={{ width: '48.5%', position: 'relative' }}>
                <Button
                  label="Solicitações"
                  onPress={() => router.push('/solicitacoes' as Href)}
                  variant="secondary"
                  size="md"
                  icon={<MessagesSquare size={14} color={colors.violetSoft} />}
                />
                <CountBadge count={unreadQ.data ?? 0} />
              </View>
            )}
            <View style={{ width: '48.5%' }}>
              <Button
                label="Trocar senha"
                onPress={() => router.push('/trocar-senha' as Href)}
                variant="secondary"
                size="md"
                icon={<Lock size={14} color={colors.text} />}
              />
            </View>
            <View style={{ width: '48.5%' }}>
              <Button
                label={push.enabled ? 'Desativar push' : 'Ativar push'}
                onPress={push.toggle}
                loading={push.loading}
                variant="secondary"
                size="md"
                icon={
                  push.enabled ? (
                    <BellOff size={14} color={colors.text} />
                  ) : (
                    <Bell size={14} color={colors.text} />
                  )
                }
              />
            </View>
            <View style={{ width: '48.5%' }}>
              <Button
                label="Minha evolução"
                onPress={() => router.push('/evolucao' as Href)}
                variant="secondary"
                size="md"
                icon={<TrendingUp size={14} color={colors.accent} />}
              />
            </View>
            <View style={{ width: '48.5%' }}>
              <Button
                label="Exportar dados"
                onPress={() => router.push('/exportar-dados' as Href)}
                variant="ghost"
                size="md"
                icon={<Download size={14} color={colors.textDim} />}
              />
            </View>
            <View style={{ width: '48.5%' }}>
              <Button
                label="Notificações"
                onPress={() => router.push('/notificacoes' as Href)}
                variant="ghost"
                size="md"
                icon={<Bell size={14} color={colors.textDim} />}
              />
            </View>
            <View style={{ width: '48.5%' }}>
              <Button
                label="Anamnese clínica"
                onPress={() => router.push('/anamnese' as Href)}
                variant="ghost"
                size="md"
                icon={<HeartPulse size={14} color={colors.violetSoft} />}
              />
            </View>
            <View style={{ width: '100%', position: 'relative' }}>
              <Button
                label="Suporte e sugestões"
                onPress={() => router.push('/suporte' as Href)}
                variant="ghost"
                size="md"
                icon={<LifeBuoy size={14} color={colors.textDim} />}
              />
              <CountBadge count={unreadSupport} />
            </View>
          </View>
        </Card>

        <Card>
          <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-4">
            Medidas
          </Text>
          <View className="gap-4">
            <MetricRow
              icon={<Ruler size={16} color={colors.textDim} />}
              label="Peso atual"
              value={formatKg(profile?.weight_kg)}
            />
            <MetricRow
              icon={<Ruler size={16} color={colors.textDim} />}
              label="Altura"
              value={formatCm(profile?.height_cm)}
            />
            <MetricRow
              icon={<Target size={16} color={colors.violetSoft} />}
              label="Meta de peso"
              value={formatKg(profile?.goal_weight_kg)}
            />
          </View>
        </Card>

        {imcValue && imcCat && (
          <Card>
            <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
              Índice de massa corporal
            </Text>
            <View className="flex-row items-end gap-3">
              <Text className="text-text text-4xl font-bold">
                {imcValue.toFixed(1)}
              </Text>
              <View
                className="rounded-full px-3 py-1 border mb-1.5"
                style={{
                  backgroundColor: `${imcCat.color}15`,
                  borderColor: `${imcCat.color}60`,
                }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: imcCat.color }}
                >
                  {imcCat.label}
                </Text>
              </View>
            </View>
            <Text className="text-text-muted text-xs mt-3 leading-relaxed">
              {imcCat.description}
            </Text>
          </Card>
        )}

        <Card glow accent="green">
          <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-4">
            Metas diárias
          </Text>
          <View className="gap-4">
            <MetricRow
              icon={<Activity size={16} color={colors.accent} />}
              label="Calorias"
              value={`${(profile?.daily_calorie_goal ?? 2500).toLocaleString('pt-BR')} kcal`}
            />
            <MetricRow
              icon={<Target size={16} color={colors.violetSoft} />}
              label="Proteína"
              value={`${profile?.protein_goal_g ?? 180} g`}
            />
            <MetricRow
              icon={<Droplet size={16} color={colors.info} />}
              label="Hidratação"
              value={`${((profile?.water_goal_ml ?? 4000) / 1000).toLocaleString('pt-BR')} L`}
            />
          </View>
        </Card>

        <Card padding="md">
          <View className="flex-row items-start gap-3">
            <View className="h-9 w-9 rounded-xl bg-accent/10 border border-accent/30 items-center justify-center">
              <UserIcon size={16} color={colors.accent} />
            </View>
            <View className="flex-1">
              <Text className="text-text font-semibold">Conta conectada</Text>
              <Text className="text-text-dim text-xs mt-1">
                Sessão ativa. Dados protegidos por Row Level Security.
              </Text>
            </View>
          </View>
        </Card>

        {!isStudent && (
          <Button
            label={
              !profile?.onboarding_completed_at
                ? 'Completar onboarding com IA'
                : refazerBlocked
                  ? 'Refazer disponível amanhã'
                  : 'Gerar novo plano com IA'
            }
            onPress={handleRedoOnboarding}
            loading={resetPending}
            disabled={refazerBlocked}
            variant="secondary"
            size="md"
            icon={<Sparkles size={16} color={colors.accent} />}
          />
        )}

        <Button
          label="Sair da conta"
          onPress={() => setLogoutOpen(true)}
          variant="danger"
          size="md"
          icon={<LogOut size={16} color={colors.danger} />}
        />

        {isStudent && profile?.coach_id && (
          <CoachCard coachId={profile.coach_id} />
        )}

        {isStudent && profile?.id && (
          <StudentAssessmentCard studentId={profile.id} />
        )}

        <Disclaimer />
      </ScrollView>

      <ConfirmModal
        visible={redoStep === 'choose'}
        onClose={() => setRedoStep('closed')}
        title="Refazer plano?"
        message="O que fazer com o plano atual? Mesclar arquiva as rotinas (mantém histórico) e cria as novas ao lado. Descartar apaga todas as rotinas — sessões já registradas continuam no histórico."
        icon={<RefreshCw size={26} color={colors.violetSoft} />}
        dismissable={!resetPending}
        actions={[
          {
            label: 'Mesclar com o atual',
            variant: 'primary',
            onPress: () => {
              void executeReset('merge');
            },
            loading: resetPending,
          },
          {
            label: 'Descartar e começar do zero',
            variant: 'danger',
            onPress: () => setRedoStep('confirmDiscard'),
            disabled: resetPending,
          },
          {
            label: 'Cancelar',
            variant: 'ghost',
            onPress: () => setRedoStep('closed'),
            disabled: resetPending,
          },
        ]}
      />

      <ConfirmModal
        visible={redoStep === 'confirmDiscard'}
        onClose={() => setRedoStep('choose')}
        title="Descartar tudo?"
        message="Todas as suas rotinas serão apagadas. Sessões já registradas continuam no histórico, mas as referências de rotina serão perdidas."
        icon={<AlertTriangle size={26} color={colors.danger} />}
        dismissable={!resetPending}
        actions={[
          {
            label: 'Sim, descartar',
            variant: 'danger',
            onPress: () => {
              void executeReset('discard');
            },
            loading: resetPending,
          },
          {
            label: 'Voltar',
            variant: 'ghost',
            onPress: () => setRedoStep('choose'),
            disabled: resetPending,
          },
        ]}
      />

      <ConfirmModal
        visible={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Sair da conta?"
        message="Você precisará fazer login de novo para acessar seus dados."
        icon={<LogOut size={26} color={colors.danger} />}
        actions={[
          {
            label: 'Sair',
            variant: 'danger',
            onPress: () => {
              setLogoutOpen(false);
              void logout();
            },
          },
          {
            label: 'Cancelar',
            variant: 'ghost',
            onPress: () => setLogoutOpen(false),
          },
        ]}
      />
    </Screen>
  );
}

function MetricRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-3">
        {icon}
        <Text className="text-text text-sm">{label}</Text>
      </View>
      <Text className="text-text-dim text-sm font-semibold">{value}</Text>
    </View>
  );
}
