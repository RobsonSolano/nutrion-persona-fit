import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  ArrowLeft,
  Droplet,
  Flame,
  Beef,
  Sparkles,
  RefreshCcw,
  Send,
  Dumbbell,
  Target,
  Pencil,
  Plus,
  ChevronRight,
  Trash2,
  AlertTriangle,
  NotebookPen,
  History,
  BookOpen,
  FileText,
  TrendingUp,
  Mail,
} from 'lucide-react-native';
import {
  Avatar,
  Button,
  Card,
  ConfirmModal,
  MarkdownText,
  Screen,
  SegmentedControl,
} from '@/components/ui';
import { useAlert } from '@/components/GlobalAlertProvider';
import { colors } from '@/lib/theme';
import {
  useUnlinkStudent,
  useGenerateStudentPlan,
  useSaveStudentPlan,
  useStudentDetail,
  useStudentTracking,
} from '@/hooks/useStudents';
import { useCoachNotes } from '@/hooks/useCoachNotes';
import { useApplyTemplates } from '@/hooks/useTemplates';
import StudentAnamneseCard from '@/components/coach/StudentAnamneseCard';
import TemplatePicker from '@/components/coach/TemplatePicker';
import { RoutinesReorderList } from '@/components/coach/RoutinesReorderList';
import { bmi, bmiCategory } from '@/lib/biometrics';
import { formatDisability } from '@/lib/disability';
import type { OnboardingPlan } from '@/services/onboarding';
import type { DayActivity, StudentTracking } from '@/services/studentTracking';
import { captureError } from '@/lib/sentry';

const GOAL_LABEL: Record<string, string> = {
  lose_fat: 'Emagrecer',
  maintain: 'Manter peso',
  gain_muscle: 'Ganhar massa',
  reduce_body_fat: 'Reduzir gordura',
};

type Phase =
  | 'idle'
  | 'confirm_regenerate'
  | 'generating'
  | 'preview'
  | 'saving'
  | 'confirm_unlink'
  | 'deleting';

type Tab = 'visao' | 'plano' | 'historico';

const TAB_OPTIONS = [
  { value: 'visao', label: 'Visão' },
  { value: 'plano', label: 'Plano' },
  { value: 'historico', label: 'Histórico' },
] as const;

export default function AlunoDetalheScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detailQ = useStudentDetail(id ?? null);
  const trackingQ = useStudentTracking(id ?? null);
  const notesQ = useCoachNotes(id ?? null);
  const generateMutation = useGenerateStudentPlan();
  const saveMutation = useSaveStudentPlan();
  const unlinkMutation = useUnlinkStudent();
  const applyTemplates = useApplyTemplates();
  const alert = useAlert();

  const [phase, setPhase] = useState<Phase>('idle');
  const [plan, setPlan] = useState<OnboardingPlan | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('visao');

  if (!id) return null;

  async function handleRegenerate() {
    if (!id) return;
    setPhase('generating');
    try {
      const { plan: generated } = await generateMutation.mutateAsync({
        studentId: id,
      });
      setPlan(generated);
      setPhase('preview');
    } catch (err) {
      captureError(err, { feature: 'coach_regenerate_existing_student' });
      setPhase('idle');
      alert.showError(err);
    }
  }

  async function handleSavePlan() {
    if (!id || !plan) return;
    setPhase('saving');
    try {
      await saveMutation.mutateAsync({ studentId: id, plan });
      setPhase('idle');
      setPlan(null);
      alert.showAlert({
        title: 'Plano atualizado',
        message: 'As rotinas anteriores foram arquivadas.',
        type: 'success',
      });
    } catch (err) {
      captureError(err, { feature: 'coach_save_existing_student' });
      setPhase('preview');
      alert.showError(err);
    }
  }

  async function handleUnlink() {
    if (!id) return;
    setPhase('deleting');
    try {
      await unlinkMutation.mutateAsync(id);
      router.back();
    } catch (err) {
      captureError(err, { feature: 'coach_unlink_student' });
      setPhase('idle');
      alert.showError(err);
    }
  }

  if (phase === 'generating') {
    return <FullScreenLoading title="Gerando novo plano com IA" />;
  }
  if (phase === 'saving') {
    return <FullScreenLoading title="Salvando..." />;
  }
  if (phase === 'deleting') {
    return <FullScreenLoading title="Desvinculando..." />;
  }
  if (phase === 'preview' && plan) {
    return (
      <PlanPreview
        plan={plan}
        onSave={handleSavePlan}
        onRegenerate={handleRegenerate}
        onCancel={() => {
          setPhase('idle');
          setPlan(null);
        }}
        saving={saveMutation.isPending}
      />
    );
  }

  if (detailQ.isLoading) {
    return <FullScreenLoading title="Carregando aluno..." />;
  }
  if (detailQ.error || !detailQ.data) {
    return (
      <Screen variant="hero" edges={['top', 'bottom']}>
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <Text className="text-text">Aluno não encontrado.</Text>
          <Button label="Voltar" onPress={() => router.back()} variant="ghost" />
        </View>
      </Screen>
    );
  }

  const { profile, routines } = detailQ.data;
  const age =
    profile.birth_year != null
      ? new Date().getFullYear() - profile.birth_year
      : null;
  const goalLabel = profile.goal_type
    ? GOAL_LABEL[profile.goal_type] ?? null
    : null;
  const imcValue =
    profile.weight_kg && profile.height_cm
      ? bmi(profile.weight_kg, profile.height_cm)
      : null;
  const imcCat = imcValue != null ? bmiCategory(imcValue) : null;

  return (
    <Screen variant="hero" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-5 py-3 border-b border-border-subtle">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
        >
          <ArrowLeft size={18} color={colors.textDim} />
        </Pressable>
        <Text className="text-text font-semibold text-base flex-1" numberOfLines={1}>
          {profile.full_name ?? 'Aluno'}
        </Text>
        <Pressable
          onPress={() => router.push(`/(coach)/aluno/${id}/editar` as Href)}
          hitSlop={10}
          className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
        >
          <Pencil size={16} color={colors.textDim} />
        </Pressable>
        <Pressable
          onPress={() => setPhase('confirm_unlink')}
          hitSlop={10}
          className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
        >
          <Trash2 size={16} color={colors.danger} />
        </Pressable>
      </View>

      <View className="px-5 pt-3 pb-1 border-b border-border-subtle">
        <SegmentedControl
          variant="tabs"
          options={TAB_OPTIONS}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === 'visao' && (
        <VisaoTab
          profile={profile}
          age={age}
          goalLabel={goalLabel}
          imcValue={imcValue}
          imcCat={imcCat}
          tracking={trackingQ.data ?? null}
        />
      )}
      {tab === 'plano' && (
        <PlanoTab
          studentId={id}
          profile={profile}
          routines={routines}
          onRegenerate={() => setPhase('confirm_regenerate')}
          onOpenTemplates={() => setPickerOpen(true)}
        />
      )}
      {tab === 'historico' && (
        <HistoricoTab
          studentId={id}
          notesCount={notesQ.data?.length ?? 0}
        />
      )}

      <TemplatePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Aplicar templates"
        confirmLabel="Aplicar"
        loading={applyTemplates.isPending}
        onConfirm={async (templateIds) => {
          if (!id || templateIds.length === 0) return;
          try {
            const result = await applyTemplates.mutateAsync({
              studentId: id,
              templateIds,
            });
            setPickerOpen(false);
            alert.showAlert({
              title: 'Templates aplicados',
              message: `${result.created_routine_ids.length} treino${
                result.created_routine_ids.length === 1 ? '' : 's'
              } adicionado${
                result.created_routine_ids.length === 1 ? '' : 's'
              } ao aluno.`,
              type: 'success',
            });
          } catch (err) {
            captureError(err, { feature: 'coach_apply_templates' });
            alert.showError(err);
          }
        }}
      />

      <ConfirmModal
        visible={phase === 'confirm_regenerate'}
        onClose={() => setPhase('idle')}
        title="Gerar novo plano?"
        message={
          'A IA vai gerar metas e treinos novos com base na ficha atual. As rotinas ativas serão arquivadas (histórico de execuções preservado).'
        }
        icon={<RefreshCcw size={26} color={colors.violetSoft} />}
        actions={[
          {
            label: 'Gerar com IA',
            variant: 'primary',
            onPress: handleRegenerate,
          },
          {
            label: 'Cancelar',
            variant: 'ghost',
            onPress: () => setPhase('idle'),
          },
        ]}
      />

      <ConfirmModal
        visible={phase === 'confirm_unlink'}
        onClose={() => setPhase('idle')}
        title={`Desvincular ${profile.full_name ?? 'esse aluno'}?`}
        message={
          'O aluno volta a ser usuário comum e mantém o treino prescrito. Suas notas privadas sobre ele serão apagadas e você não verá mais os dados dele aqui. Essa ação não pode ser desfeita.'
        }
        icon={<AlertTriangle size={26} color={colors.danger} />}
        dismissable={!unlinkMutation.isPending}
        actions={[
          {
            label: 'Desvincular aluno',
            variant: 'danger',
            onPress: handleUnlink,
            loading: unlinkMutation.isPending,
          },
          {
            label: 'Cancelar',
            variant: 'ghost',
            onPress: () => setPhase('idle'),
            disabled: unlinkMutation.isPending,
          },
        ]}
      />
    </Screen>
  );
}

// =====================================================================
// Tabs
// =====================================================================

type StudentProfile = NonNullable<
  ReturnType<typeof useStudentDetail>['data']
>['profile'];
type StudentRoutine = NonNullable<
  ReturnType<typeof useStudentDetail>['data']
>['routines'][number];

function VisaoTab({
  profile,
  age,
  goalLabel,
  imcValue,
  imcCat,
  tracking,
}: {
  profile: StudentProfile;
  age: number | null;
  goalLabel: string | null;
  imcValue: number | null;
  imcCat: { label: string; color: string } | null;
  tracking: StudentTracking | null;
}) {
  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 60,
        gap: 14,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Card glow accent="violet" padding="md">
        <View className="flex-row items-center gap-3">
          <Avatar
            url={profile.avatar_url}
            name={profile.full_name}
            size={56}
            accent="violet"
          />
          <View className="flex-1">
            <Text className="text-text text-lg font-bold" numberOfLines={1}>
              {profile.full_name ?? 'Sem nome'}
            </Text>
            <View className="flex-row flex-wrap items-center gap-2 mt-1">
              {age != null && (
                <Text className="text-text-dim text-xs">{age} anos</Text>
              )}
              {profile.weight_kg != null && (
                <Text className="text-text-dim text-xs">
                  {profile.weight_kg}kg
                </Text>
              )}
              {profile.height_cm != null && (
                <Text className="text-text-dim text-xs">
                  {profile.height_cm}cm
                </Text>
              )}
            </View>
            {profile.email && (
              <View className="flex-row items-center gap-1 mt-1.5">
                <Mail size={11} color={colors.textDim} />
                {/* selectable: long-press no Android abre "Copiar" sem
                    precisar de expo-clipboard (dep nativa = APK novo). */}
                <Text
                  selectable
                  className="text-text-dim text-[11px] flex-1"
                >
                  {profile.email}
                </Text>
              </View>
            )}
            {goalLabel && (
              <View className="flex-row items-center gap-1 mt-1.5">
                <Target size={11} color={colors.violetSoft} />
                <Text className="text-violet-soft text-[11px] font-semibold">
                  {goalLabel}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Card>

      {imcValue && imcCat && (
        <Card padding="md">
          <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-2">
            IMC
          </Text>
          <View className="flex-row items-end gap-3">
            <Text className="text-text text-3xl font-bold">
              {imcValue.toFixed(1)}
            </Text>
            <View
              className="rounded-full px-2.5 py-0.5 border mb-1"
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
        </Card>
      )}

      {tracking && <TodayCard tracking={tracking} profile={profile} />}
      {tracking && <WeekAdherenceCard tracking={tracking} />}
    </ScrollView>
  );
}

function PlanoTab({
  studentId,
  profile,
  routines,
  onRegenerate,
  onOpenTemplates,
}: {
  studentId: string;
  profile: StudentProfile;
  routines: StudentRoutine[];
  onRegenerate: () => void;
  onOpenTemplates: () => void;
}) {
  const router = useRouter();
  const deficiencia = formatDisability(profile);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 60,
        gap: 14,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Card padding="md">
        <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
          Metas atuais
        </Text>
        <View className="gap-2.5">
          <MetaRow
            icon={<Flame size={14} color={colors.accent} />}
            label="Calorias"
            value={`${(profile.daily_calorie_goal ?? 0).toLocaleString('pt-BR')} kcal`}
          />
          <MetaRow
            icon={<Beef size={14} color={colors.violetSoft} />}
            label="Proteína"
            value={`${profile.protein_goal_g ?? 0} g`}
          />
          <MetaRow
            icon={<Droplet size={14} color={colors.info} />}
            label="Água"
            value={`${((profile.water_goal_ml ?? 0) / 1000).toFixed(1)} L`}
          />
        </View>
      </Card>

      {(deficiencia ||
        profile.allergies ||
        profile.physical_limitations ||
        profile.bio) && (
        <Card padding="md">
          <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
            Saúde / contexto
          </Text>
          <View className="gap-2">
            {/* Primeiro da lista: é o que mais muda a prescrição. */}
            {deficiencia && (
              <InfoLine label="Deficiência" value={deficiencia} />
            )}
            {profile.allergies && (
              <InfoLine label="Alergias" value={profile.allergies} />
            )}
            {profile.physical_limitations && (
              <InfoLine
                label="Limitações"
                value={profile.physical_limitations}
              />
            )}
            {profile.bio && <InfoLine label="Bio" value={profile.bio} />}
          </View>
        </Card>
      )}

      <Card padding="md">
        <View className="flex-row items-center justify-between mb-1">
          <View className="flex-row items-center gap-2 flex-1">
            <Dumbbell size={14} color={colors.accent} />
            <Text className="text-text-dim text-[11px] uppercase tracking-widest">
              Treinos prescritos ({routines.length})
            </Text>
          </View>
          <Pressable
            onPress={() =>
              router.push(
                `/(coach)/aluno/${studentId}/rotina/nova` as Href,
              )
            }
            hitSlop={8}
            className="h-8 w-8 rounded-xl border border-accent/40 bg-accent/10 items-center justify-center active:opacity-70"
          >
            <Plus size={14} color={colors.accent} strokeWidth={3} />
          </Pressable>
        </View>
        {routines.length === 0 ? (
          <Text className="text-text-muted text-xs py-3">
            Sem rotinas ativas. Adicione manualmente pelo + acima ou gere
            um plano com IA abaixo.
          </Text>
        ) : (
          <>
            <Text className="text-text-muted text-[10px] mb-2">
              Segure no ícone à esquerda pra arrastar e reordenar.
            </Text>
            <RoutinesReorderList
              studentId={studentId}
              routines={routines}
              onItemPress={(routineId) =>
                router.push(
                  `/(coach)/aluno/${studentId}/rotina/${routineId}` as Href,
                )
              }
            />
          </>
        )}
      </Card>

      <Button
        label="Gerar novo plano com IA"
        onPress={onRegenerate}
        variant="primary"
        icon={<Sparkles size={16} color={colors.textInverse} />}
      />
      <Text className="text-text-muted text-[11px] text-center px-2 leading-relaxed">
        Gerar novo plano arquiva as rotinas atuais (histórico preservado) e
        cria as novas baseadas na ficha.
      </Text>

      <Button
        label="Aplicar template da biblioteca"
        onPress={onOpenTemplates}
        variant="secondary"
        icon={<BookOpen size={16} color={colors.text} />}
      />
      <Text className="text-text-muted text-[11px] text-center px-2 leading-relaxed">
        Os treinos do template são copiados pro aluno como rotinas novas (não
        arquiva as atuais — soma).
      </Text>

      <Button
        label="Importar treino via IA (foto/texto)"
        onPress={() =>
          router.push(
            `/(coach)/import-workout?destination=aluno&student_id=${studentId}` as Href,
          )
        }
        variant="secondary"
        icon={<Sparkles size={16} color={colors.text} />}
      />
      <Text className="text-text-muted text-[11px] text-center px-2 leading-relaxed">
        Envie fotos da ficha ou cole a descrição. A IA monta o treino e você
        revisa antes de salvar.
      </Text>
    </ScrollView>
  );
}

function HistoricoTab({
  studentId,
  notesCount,
}: {
  studentId: string;
  notesCount: number;
}) {
  const router = useRouter();
  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 60,
        gap: 14,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        onPress={() => router.push(`/(coach)/aluno/${studentId}/notas` as Href)}
        className="active:opacity-80"
      >
        <Card padding="md">
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 rounded-2xl bg-violet/10 border border-violet/30 items-center justify-center">
              <NotebookPen size={20} color={colors.violetSoft} />
            </View>
            <View className="flex-1">
              <Text className="text-text text-sm font-semibold">
                Anotações privadas
              </Text>
              <Text className="text-text-muted text-[11px] mt-0.5">
                {notesCount > 0
                  ? `${notesCount} anotação${notesCount === 1 ? '' : 'ões'} · só você vê`
                  : 'Nenhuma anotação · só você vê'}
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textDim} />
          </View>
        </Card>
      </Pressable>

      <StudentAnamneseCard studentId={studentId} />

      <Pressable
        onPress={() =>
          router.push(`/(coach)/aluno/${studentId}/historico` as Href)
        }
        className="active:opacity-80"
      >
        <Card padding="md">
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 rounded-2xl bg-accent/10 border border-accent/30 items-center justify-center">
              <History size={20} color={colors.accent} />
            </View>
            <View className="flex-1">
              <Text className="text-text text-sm font-semibold">
                Histórico de planos
              </Text>
              <Text className="text-text-muted text-[11px] mt-0.5">
                Cada plano gerado fica registrado pra consulta
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textDim} />
          </View>
        </Card>
      </Pressable>

      <Pressable
        onPress={() =>
          router.push(`/(coach)/aluno/${studentId}/contrato` as Href)
        }
        className="active:opacity-80"
      >
        <Card padding="md">
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 rounded-2xl bg-violet/10 border border-violet/30 items-center justify-center">
              <FileText size={20} color={colors.violetSoft} />
            </View>
            <View className="flex-1">
              <Text className="text-text text-sm font-semibold">Contrato</Text>
              <Text className="text-text-muted text-[11px] mt-0.5">
                Tipo de contratação, valor e pagamento
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textDim} />
          </View>
        </Card>
      </Pressable>

      <Pressable
        onPress={() =>
          router.push(`/(coach)/aluno/${studentId}/evolucao` as Href)
        }
        className="active:opacity-80"
      >
        <Card padding="md">
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 rounded-2xl bg-accent/10 border border-accent/30 items-center justify-center">
              <TrendingUp size={20} color={colors.accent} />
            </View>
            <View className="flex-1">
              <Text className="text-text text-sm font-semibold">Evolução</Text>
              <Text className="text-text-muted text-[11px] mt-0.5">
                Linha do tempo de conquistas e marcos do aluno
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textDim} />
          </View>
        </Card>
      </Pressable>
    </ScrollView>
  );
}


function MetaRow({
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
      <View className="flex-row items-center gap-2">
        {icon}
        <Text className="text-text-dim text-sm">{label}</Text>
      </View>
      <Text className="text-text text-sm font-bold">{value}</Text>
    </View>
  );
}

function TodayCard({
  tracking,
  profile,
}: {
  tracking: StudentTracking;
  profile: { daily_calorie_goal: number | null; protein_goal_g: number | null; water_goal_ml: number | null };
}) {
  const { today } = tracking;
  const sessionLabel =
    today.workoutSessions.length > 0
      ? today.workoutSessions.map((s) => s.routine_name).join(', ')
      : null;

  return (
    <Card padding="md">
      <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
        Hoje
      </Text>
      <View className="gap-3">
        <ProgressRow
          icon={<Flame size={14} color={colors.accent} />}
          label="Calorias"
          current={today.calories}
          goal={profile.daily_calorie_goal ?? 0}
          unit="kcal"
        />
        <ProgressRow
          icon={<Beef size={14} color={colors.violetSoft} />}
          label="Proteína"
          current={today.protein}
          goal={profile.protein_goal_g ?? 0}
          unit="g"
        />
        <ProgressRow
          icon={<Droplet size={14} color={colors.info} />}
          label="Água"
          current={today.waterMl}
          goal={profile.water_goal_ml ?? 0}
          unit="ml"
        />
        <View className="flex-row items-center justify-between pt-1">
          <View className="flex-row items-center gap-2">
            <Dumbbell size={14} color={colors.accent} />
            <Text className="text-text-dim text-sm">Treino</Text>
          </View>
          <Text
            className="text-sm font-bold flex-1 text-right"
            numberOfLines={1}
            style={{
              color: sessionLabel ? colors.text : colors.textMuted,
            }}
          >
            {sessionLabel ?? 'sem registro'}
          </Text>
        </View>
        <View className="mt-1">
          <Text className="text-text-muted text-[11px]">
            {today.foodLogs.length} refeição
            {today.foodLogs.length === 1 ? '' : 'ões'} registrada
            {today.foodLogs.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function ProgressRow({
  icon,
  label,
  current,
  goal,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  current: number;
  goal: number;
  unit: string;
}) {
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          {icon}
          <Text className="text-text-dim text-sm">{label}</Text>
        </View>
        <Text className="text-text text-xs font-semibold">
          {current.toLocaleString('pt-BR')} / {goal.toLocaleString('pt-BR')} {unit}
        </Text>
      </View>
      <View className="h-1.5 rounded-full bg-surface-muted overflow-hidden border border-border-subtle">
        <View
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor:
              pct >= 100 ? colors.accent : pct >= 50 ? colors.violetSoft : colors.warn,
          }}
        />
      </View>
    </View>
  );
}

function WeekAdherenceCard({ tracking }: { tracking: StudentTracking }) {
  const tone =
    tracking.adherenceLast7 >= 70
      ? colors.accent
      : tracking.adherenceLast7 >= 40
        ? colors.warn
        : colors.danger;

  return (
    <Card padding="md">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-text-dim text-[11px] uppercase tracking-widest">
          Aderência (7d)
        </Text>
        <Text className="text-2xl font-bold" style={{ color: tone }}>
          {tracking.adherenceLast7}%
        </Text>
      </View>
      <View className="flex-row gap-1.5">
        {tracking.weekActivity.map((d) => (
          <DayDot key={d.day} day={d} />
        ))}
      </View>
      <View className="flex-row gap-3 mt-3">
        <Legend color={colors.accent} label="comida" />
        <Legend color={colors.info} label="água" />
        <Legend color={colors.violetSoft} label="treino" />
      </View>
    </Card>
  );
}

function DayDot({ day }: { day: DayActivity }) {
  const date = new Date(day.day + 'T12:00:00');
  const label = date.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3);
  return (
    <View className="flex-1 items-center gap-1">
      <View className="flex-row gap-0.5">
        <Pip active={day.hasFood} color={colors.accent} />
        <Pip active={day.hasWater} color={colors.info} />
        <Pip active={day.hasWorkout} color={colors.violetSoft} />
      </View>
      <Text className="text-text-muted text-[10px]">{label}</Text>
    </View>
  );
}

function Pip({ active, color }: { active: boolean; color: string }) {
  return (
    <View
      className="h-2 w-2 rounded-full"
      style={{
        backgroundColor: active ? color : 'transparent',
        borderWidth: 1,
        borderColor: active ? color : colors.border,
      }}
    />
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <View
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <Text className="text-text-muted text-[10px]">{label}</Text>
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-text-muted text-[10px] uppercase tracking-widest">
        {label}
      </Text>
      <Text className="text-text-dim text-xs mt-0.5 leading-relaxed">
        {value}
      </Text>
    </View>
  );
}

function FullScreenLoading({ title }: { title: string }) {
  return (
    <Screen variant="hero" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8 gap-4">
        <ActivityIndicator color={colors.violetSoft} />
        <Text className="text-text-dim text-sm">{title}</Text>
      </View>
    </Screen>
  );
}

function PlanPreview({
  plan,
  onSave,
  onRegenerate,
  onCancel,
  saving,
}: {
  plan: OnboardingPlan;
  onSave: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <Screen variant="hero" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-3 px-5 py-3 border-b border-border-subtle">
        <Pressable
          onPress={onCancel}
          hitSlop={12}
          className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
        >
          <ArrowLeft size={18} color={colors.textDim} />
        </Pressable>
        <Text className="text-text font-semibold text-base flex-1">
          Revisar plano novo
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 60,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center">
          <View className="h-12 w-12 rounded-2xl bg-accent/10 border border-accent/30 items-center justify-center mb-2">
            <Sparkles size={22} color={colors.accent} />
          </View>
          {plan.rationale && (
            <View className="mt-2 px-2">
              <MarkdownText
                value={plan.rationale}
                textColor={colors.textDim}
                fontSize={13}
              />
            </View>
          )}
        </View>

        <Card glow accent="green" padding="md">
          <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
            Novas metas
          </Text>
          <View className="gap-2">
            <MetaRow
              icon={<Flame size={14} color={colors.accent} />}
              label="Calorias"
              value={`${plan.calorie_goal} kcal`}
            />
            <MetaRow
              icon={<Beef size={14} color={colors.violetSoft} />}
              label="Proteína"
              value={`${plan.protein_goal_g} g`}
            />
            <MetaRow
              icon={<Droplet size={14} color={colors.info} />}
              label="Água"
              value={`${plan.water_goal_ml} ml`}
            />
          </View>
        </Card>

        {plan.routines.length > 0 && (
          <View className="gap-2">
            <Text className="text-text-dim text-[11px] uppercase tracking-widest px-1">
              {plan.routines.length} treinos sugeridos
            </Text>
            {plan.routines.map((r, i) => (
              <Card key={i} padding="md">
                <Text className="text-text text-sm font-semibold">{r.name}</Text>
                {r.description && (
                  <Text className="text-text-muted text-[11px] mt-0.5">
                    {r.description}
                  </Text>
                )}
                <View className="gap-1 mt-2">
                  {r.exercises.slice(0, 5).map((ex, j) => (
                    <Text
                      key={j}
                      className="text-text-dim text-[12px]"
                      numberOfLines={1}
                    >
                      • {ex.exercise_name} — {ex.sets}×{ex.reps_min}-{ex.reps_max}
                    </Text>
                  ))}
                  {r.exercises.length > 5 && (
                    <Text className="text-text-muted text-[11px]">
                      + {r.exercises.length - 5} outros
                    </Text>
                  )}
                </View>
              </Card>
            ))}
          </View>
        )}

        <Button
          label="Salvar plano novo"
          onPress={onSave}
          loading={saving}
          icon={<Send size={18} color={colors.textInverse} />}
        />
        <Button
          label="Gerar outro"
          onPress={onRegenerate}
          variant="ghost"
          icon={<RefreshCcw size={16} color={colors.textDim} />}
        />
      </ScrollView>
    </Screen>
  );
}
