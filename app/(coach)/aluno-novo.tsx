import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Mail,
  RefreshCcw,
  Send,
  Sparkles,
  Target,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  Button,
  Card,
  ConfirmModal,
  Input,
  MarkdownText,
  Screen,
  SegmentedControl,
} from '@/components/ui';
import { useAlert } from '@/components/GlobalAlertProvider';
import DisabilityFields, {
  type DisabilityValue,
} from '@/components/DisabilityFields';
import { isDisabilityValid } from '@/lib/disability';
import { colors } from '@/lib/theme';
import { isValidEmail } from '@/lib/email';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import {
  useCreateStudent,
  useGenerateStudentPlan,
  useSaveStudentPlan,
  useSendStudentCredentials,
  useStudents,
} from '@/hooks/useStudents';
import { useApplyTemplates, useTemplates } from '@/hooks/useTemplates';
import { useEntitlement, useAiCoachLocked } from '@/hooks/useEntitlement';
import TemplatePicker from '@/components/coach/TemplatePicker';
import PaywallNotice from '@/components/ui/PaywallNotice';
import { handleNeedsUpgrade, openPaywall } from '@/lib/paywall';
import { isStudentLimitReached } from '@/lib/studentLimit';
import { computeBaselineGoals } from '@/lib/baselineGoals';
import type { OnboardingPlan } from '@/services/onboarding';
import type { Profile, Sex, GoalType, WeeklyFrequency } from '@/types/database';
import { captureError } from '@/lib/sentry';

type Phase = 'form' | 'generating' | 'preview' | 'saving';
type CreationMode = 'ai' | 'templates';

const SEX_OPTIONS = [
  { value: 'm', label: 'Masc' },
  { value: 'f', label: 'Fem' },
  { value: 'o', label: 'Outro' },
] as const;

const GOAL_OPTIONS = [
  { value: 'lose_fat', label: 'Emagrecer' },
  { value: 'maintain', label: 'Manter' },
  { value: 'gain_muscle', label: 'Ganhar' },
  { value: 'reduce_body_fat', label: 'Definir' },
] as const;

const FREQ_OPTIONS = [
  { value: '1-2', label: '1-2x' },
  { value: '2-3', label: '2-3x' },
  { value: '3-4', label: '3-4x' },
  { value: '4-5', label: '4-5x' },
  { value: '5-6', label: '5-6x' },
  { value: '6-7', label: '6-7x' },
] as const;

const SPORTS = [
  { value: 'musculacao', label: '🏋️ Musculação' },
  { value: 'calistenia', label: '🤸 Calistenia' },
  { value: 'crossfit', label: '🔥 CrossFit' },
  { value: 'powerlifting', label: '💪 Powerlifting' },
  { value: 'corrida', label: '🏃 Corrida' },
  { value: 'ciclismo', label: '🚴 Ciclismo' },
  { value: 'natacao', label: '🏊 Natação' },
  { value: 'luta', label: '🥊 Luta' },
  { value: 'danca', label: '💃 Dança' },
  { value: 'outro', label: '🎯 Outro' },
];

function generatePassword(): string {
  // Sem caracteres ambíguos (0/O, 1/l/I, etc).
  const charset =
    'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += charset[Math.floor(Math.random() * charset.length)];
  }
  return pwd;
}

export default function AlunoNovo() {
  const router = useRouter();
  const kbHeight = useKeyboardHeight();
  const alert = useAlert();

  const createMutation = useCreateStudent();
  const generateMutation = useGenerateStudentPlan();
  const saveMutation = useSaveStudentPlan();
  const sendCredsMutation = useSendStudentCredentials();
  const applyTemplatesMutation = useApplyTemplates();
  const templatesQ = useTemplates({ archived: false });
  const entQ = useEntitlement();
  const studentsQ = useStudents();
  // C6: só bloqueia com entitlement resolvido. IA de coach (gera plano/metas) exige ai_coach.
  const aiCoachLocked = useAiCoachLocked();
  const studentLimitReached = entQ.data
    ? isStudentLimitReached(studentsQ.data?.length ?? 0, entQ.data.student_limit)
    : false;

  const [phase, setPhase] = useState<Phase>('form');
  // Coach FREE não tem IA de professor: só cadastra por template, com metas
  // determinísticas. Começa (e fica) em 'templates'.
  const [creationMode, setCreationMode] = useState<CreationMode>('ai');
  useEffect(() => {
    if (aiCoachLocked) setCreationMode('templates');
  }, [aiCoachLocked]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Identidade
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // Ficha
  const [sex, setSex] = useState<Sex | null>(null);
  const [birthYear, setBirthYear] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [goalWeight, setGoalWeight] = useState('');
  const [sports, setSports] = useState<string[]>([]);
  const [frequency, setFrequency] = useState<WeeklyFrequency | null>(null);
  const [allergies, setAllergies] = useState('');
  const [limitations, setLimitations] = useState('');
  const [bio, setBio] = useState('');
  const [disability, setDisability] = useState<DisabilityValue>({
    hasDisability: null,
    types: [],
    notes: '',
  });

  // Resultado
  const [studentId, setStudentId] = useState<string | null>(null);
  const [studentPassword, setStudentPassword] = useState<string | null>(null);
  const [plan, setPlan] = useState<OnboardingPlan | null>(null);
  const [confirmEmailOpen, setConfirmEmailOpen] = useState(false);

  function toggleSport(s: string) {
    setSports((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  const isTemplatesMode = creationMode === 'templates';

  // Só marca erro depois que o usuário digitou algo — campo vazio não fica
  // vermelho antes da hora. Formato inválido bloqueia o submit e pinta a borda.
  const emailInvalid = email.trim().length > 0 && !isValidEmail(email);

  const canSubmitForm =
    isValidEmail(email) &&
    password.length >= 8 &&
    fullName.trim().length >= 2 &&
    sex !== null &&
    weight.length > 0 &&
    height.length > 0 &&
    goalType !== null &&
    sports.length > 0 &&
    frequency !== null &&
    isDisabilityValid(disability) &&
    (!isTemplatesMode || selectedTemplateIds.length > 0);

  async function handleCreateAndGenerate() {
    if (!canSubmitForm) return;
    // Gating proativo (C6): limite de alunos tem prioridade (bloqueia criar);
    // depois IA de coach (a tela gera metas por IA nos dois modos).
    if (studentLimitReached) {
      openPaywall('student_limit');
      return;
    }
    // Só o modo IA exige ai_coach. Template funciona no free (metas
    // determinísticas + rotinas copiadas do template).
    if (creationMode === 'ai' && aiCoachLocked) {
      openPaywall('coach_generate_plan');
      return;
    }
    setPhase('generating');
    try {
      // 1. Cria a conta + ficha completa
      const { student } = await createMutation.mutateAsync({
        email: email.trim().toLowerCase(),
        password,
        full_name: fullName.trim(),
        sex,
        birth_year: birthYear ? Number(birthYear) : null,
        weight_kg: weight ? Number(weight) : null,
        height_cm: height ? Number(height) : null,
        goal_type: goalType,
        goal_weight_kg: goalWeight ? Number(goalWeight) : null,
        practices_sport: true,
        sports,
        weekly_frequency: frequency,
        water_goal_ml: 2500,
        allergies: allergies.trim() || null,
        physical_limitations: limitations.trim() || null,
        has_disability: disability.hasDisability,
        disability_types: disability.types,
        disability_notes: disability.notes.trim() || null,
        bio: bio.trim() || null,
      });
      setStudentId(student.id);
      setStudentPassword(password);

      // Metas: coach free (sem IA) calcula localmente; premium usa a IA.
      const generated =
        creationMode === 'templates' && aiCoachLocked
          ? {
              ...computeBaselineGoals({
                sex,
                birthYear: birthYear ? Number(birthYear) : null,
                weightKg: weight ? Number(weight) : null,
                heightCm: height ? Number(height) : null,
                goalType,
              }),
              routines: [],
              rationale:
                'Metas calculadas pela fórmula de Mifflin-St Jeor. Treinos aplicados a partir dos templates selecionados.',
            }
          : (
              await generateMutation.mutateAsync({
                studentId: student.id,
                skipRoutines: creationMode === 'templates',
              })
            ).plan;

      if (creationMode === 'templates') {
        // Ordem importa: coach-save-student-plan ARQUIVA todas as
        // rotinas do coach pra esse aluno antes de criar as do plan.
        // Se rodasse em paralelo com applyTemplates, as rotinas
        // recém-criadas pelo template seriam arquivadas junto.
        await saveMutation.mutateAsync({
          studentId: student.id,
          plan: generated,
        });
        await applyTemplatesMutation.mutateAsync({
          studentId: student.id,
          templateIds: selectedTemplateIds,
        });
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        setPlan(generated);
        setPhase('preview');
        setConfirmEmailOpen(true);
        return;
      }

      setPlan(generated);
      setPhase('preview');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setPhase('form');
      // Gating do billing-core: 402 (student_limit ou coach_generate_plan) → paywall.
      if (handleNeedsUpgrade(err)) return;
      captureError(err, { feature: 'coach_create_student' });
      alert.showError(err);
    }
  }

  async function handleRegenerate() {
    if (!studentId) return;
    setPhase('generating');
    try {
      const { plan: regenerated } = await generateMutation.mutateAsync({
        studentId,
      });
      setPlan(regenerated);
      setPhase('preview');
    } catch (err) {
      setPhase('preview');
      if (handleNeedsUpgrade(err)) return;
      captureError(err, { feature: 'coach_regenerate_plan' });
      alert.showError(err);
    }
  }

  async function handleSave() {
    if (!studentId || !plan) return;
    setPhase('saving');
    try {
      await saveMutation.mutateAsync({ studentId, plan });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Volta pra 'preview' antes de abrir o modal: o ConfirmModal só
      // está renderizado dentro do bloco `phase === 'preview'`, então
      // sem voltar a tela ficava travada em <SavingScreen /> e o modal
      // nunca aparecia.
      setPhase('preview');
      setConfirmEmailOpen(true);
    } catch (err) {
      captureError(err, { feature: 'coach_save_plan' });
      setPhase('preview');
      alert.showError(err);
    }
  }

  async function handleSendEmail() {
    if (!studentId || !studentPassword) return;
    setConfirmEmailOpen(false);
    try {
      await sendCredsMutation.mutateAsync({
        studentId,
        password: studentPassword,
      });
      alert.showAlert({
        title: 'Email enviado',
        message: 'O aluno recebeu os dados de acesso.',
        type: 'success',
        onConfirm: () => router.back(),
      });
    } catch (err) {
      alert.showError(err);
    }
  }

  function skipEmail() {
    setConfirmEmailOpen(false);
    router.back();
  }

  if (phase === 'generating') {
    return <GeneratingScreen />;
  }
  if (phase === 'saving') {
    return <SavingScreen />;
  }
  if (phase === 'preview' && plan) {
    return (
      <>
        <PreviewScreen
          plan={plan}
          studentName={fullName.trim()}
          onSave={handleSave}
          onRegenerate={handleRegenerate}
          saving={saveMutation.isPending}
        />
        <ConfirmModal
          visible={confirmEmailOpen}
          onClose={skipEmail}
          title="Encaminhar dados pro email?"
          message={`Enviar email pro aluno (${email}) com email + senha de acesso?`}
          icon={<Mail size={26} color={colors.violetSoft} />}
          actions={[
            {
              label: 'Enviar email',
              variant: 'primary',
              onPress: handleSendEmail,
              loading: sendCredsMutation.isPending,
            },
            {
              label: 'Pular',
              variant: 'ghost',
              onPress: skipEmail,
            },
          ]}
        />
      </>
    );
  }

  return (
    <Screen variant="hero" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={0}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 32 + (Platform.OS === 'android' ? kbHeight : 0),
            gap: 14,
          }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="self-start h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <ArrowLeft size={18} color={colors.textDim} />
          </Pressable>

          <View>
            <Text className="text-text text-2xl font-bold">Novo aluno</Text>
            <Text className="text-text-dim text-sm mt-1 leading-relaxed">
              Preencha a ficha. A IA vai gerar metas e treinos baseados nesses
              dados.
            </Text>
          </View>

          <Section title="Identidade">
            <Input
              value={fullName}
              onChangeText={setFullName}
              placeholder="Nome completo do aluno"
              autoCapitalize="words"
            />
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="email@exemplo.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              error={
                emailInvalid
                  ? 'E-mail inválido. Confira o endereço (ex: nome@dominio.com).'
                  : undefined
              }
            />
            <View className="gap-2">
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder="Senha (mín. 8 caracteres)"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                onPress={() => setPassword(generatePassword())}
                className="self-start flex-row items-center gap-1.5 rounded-full border border-violet/40 bg-violet/10 px-3 py-1.5 active:opacity-70"
              >
                <RefreshCcw size={11} color={colors.violetSoft} />
                <Text className="text-violet-soft text-[11px] font-semibold">
                  Gerar senha aleatória
                </Text>
              </Pressable>
            </View>
          </Section>

          <Section title="Biometria">
            <Label>Sexo</Label>
            <SegmentedControl
              options={SEX_OPTIONS}
              value={sex ?? ''}
              onChange={(v) => setSex(v as Sex)}
            />
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Input
                  value={birthYear}
                  onChangeText={setBirthYear}
                  placeholder="Ano nasc. (ex: 1990)"
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
              <View className="flex-1">
                <Input
                  value={weight}
                  onChangeText={setWeight}
                  placeholder="Peso (kg)"
                  keyboardType="decimal-pad"
                />
              </View>
              <View className="flex-1">
                <Input
                  value={height}
                  onChangeText={setHeight}
                  placeholder="Altura (cm)"
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </Section>

          <Section title="Objetivo">
            <SegmentedControl
              options={GOAL_OPTIONS}
              value={goalType ?? ''}
              onChange={(v) => setGoalType(v as GoalType)}
            />
            <Input
              value={goalWeight}
              onChangeText={setGoalWeight}
              placeholder="Meta de peso (kg) — opcional"
              keyboardType="decimal-pad"
              leftIcon={<Target size={16} color={colors.textMuted} />}
            />
          </Section>

          <Section title="Treino">
            <Label>Modalidades (múltipla escolha)</Label>
            <View className="flex-row flex-wrap gap-2">
              {SPORTS.map((s) => {
                const selected = sports.includes(s.value);
                return (
                  <Pressable
                    key={s.value}
                    onPress={() => toggleSport(s.value)}
                    className={`rounded-full border px-3 py-1.5 ${
                      selected
                        ? 'border-accent/60 bg-accent/15'
                        : 'border-border bg-surface-muted'
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        selected ? 'text-accent' : 'text-text-dim'
                      }`}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Label>Frequência semanal</Label>
            <SegmentedControl
              options={FREQ_OPTIONS}
              value={frequency ?? ''}
              onChange={(v) => setFrequency(v as WeeklyFrequency)}
            />
          </Section>

          <Section title="Saúde (opcional)">
            <Input
              value={allergies}
              onChangeText={setAllergies}
              placeholder="Alergias (ex: lactose, glúten...)"
              multiline
              numberOfLines={2}
              style={{ minHeight: 60, textAlignVertical: 'top' }}
            />
            <Input
              value={limitations}
              onChangeText={setLimitations}
              placeholder="Limitações físicas (ex: dor no joelho)"
              multiline
              numberOfLines={2}
              style={{ minHeight: 60, textAlignVertical: 'top' }}
            />
            <Input
              value={bio}
              onChangeText={setBio}
              placeholder="Bio / contexto (rotina, sono, trabalho)"
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
            <DisabilityFields
              {...disability}
              onChange={(patch) =>
                setDisability((prev) => ({ ...prev, ...patch }))
              }
            />
          </Section>

          <Section title="Como gerar os treinos">
            <SegmentedControl
              options={[
                {
                  value: 'ai',
                  label: aiCoachLocked ? 'IA gera tudo 🔒' : 'IA gera tudo',
                },
                { value: 'templates', label: 'Usar templates' },
              ]}
              value={creationMode}
              onChange={(v) => {
                // Free não entra no modo IA — toca e vê o upsell.
                if (v === 'ai' && aiCoachLocked) {
                  openPaywall('coach_generate_plan');
                  return;
                }
                setCreationMode(v);
              }}
            />

            {isTemplatesMode && (
              <View className="gap-2 mt-2">
                <Pressable
                  onPress={() => setPickerOpen(true)}
                  className="rounded-2xl border border-violet/40 bg-violet/10 px-3 py-2.5 active:opacity-70"
                >
                  <Text className="text-violet-soft text-xs font-semibold text-center">
                    {selectedTemplateIds.length === 0
                      ? 'Selecionar templates da biblioteca'
                      : `${selectedTemplateIds.length} template${
                          selectedTemplateIds.length === 1 ? '' : 's'
                        } selecionado${
                          selectedTemplateIds.length === 1 ? '' : 's'
                        } · trocar`}
                  </Text>
                </Pressable>
                {selectedTemplateIds.length === 0 &&
                  templatesQ.data &&
                  templatesQ.data.length === 0 && (
                    <Text className="text-text-muted text-[11px] text-center px-2 leading-relaxed">
                      Você ainda não tem templates. Crie pela &quot;Biblioteca
                      de treinos&quot; no menu inicial do professor.
                    </Text>
                  )}
              </View>
            )}
          </Section>

          {studentLimitReached ? (
            <PaywallNotice
              feature="student_limit"
              title="Limite de alunos atingido"
              description="Você atingiu o limite de alunos do seu plano. Assine pra adicionar mais. Toque pra ver os planos."
            />
          ) : aiCoachLocked ? (
            <PaywallNotice
              feature="coach_generate_plan"
              title="Gerar treino com IA é um recurso Pro"
              description="No plano free você cadastra o aluno aplicando seus templates de treino. Pra IA montar treino e metas automaticamente, assine. Toque pra ver os planos."
            />
          ) : null}

          <Button
            label={
              isTemplatesMode
                ? 'Cadastrar e aplicar templates'
                : 'Cadastrar e gerar plano com IA'
            }
            onPress={handleCreateAndGenerate}
            disabled={!canSubmitForm}
            size="lg"
            icon={
              isTemplatesMode ? (
                <BookOpen size={18} color={colors.textInverse} />
              ) : (
                <Sparkles size={18} color={colors.textInverse} />
              )
            }
          />

          <Text className="text-text-muted text-[11px] text-center leading-relaxed px-2">
            {isTemplatesMode
              ? 'A IA gera só as metas (kcal, proteína, água). Os treinos vão ser copiados dos templates selecionados.'
              : 'A IA vai gerar metas (kcal, proteína, água) e ~3-5 treinos baseados na ficha. Você poderá revisar antes de salvar.'}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <TemplatePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Escolher templates"
        confirmLabel="Confirmar"
        onConfirm={(ids) => {
          setSelectedTemplateIds(ids);
          setPickerOpen(false);
        }}
      />
    </Screen>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card padding="md">
      <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
        {title}
      </Text>
      <View className="gap-2.5">{children}</View>
    </Card>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-text-muted text-[11px] uppercase tracking-wider mb-1">
      {children}
    </Text>
  );
}

function GeneratingScreen() {
  return (
    <Screen variant="hero" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8 gap-6">
        <Card glow accent="violet" padding="lg">
          <View className="items-center gap-4">
            <View className="h-14 w-14 rounded-2xl bg-violet/15 border border-violet/40 items-center justify-center">
              <Sparkles size={24} color={colors.violetSoft} />
            </View>
            <Text className="text-text text-lg font-bold text-center">
              Gerando o plano com IA
            </Text>
            <Text className="text-text-dim text-sm text-center">
              Cadastrando o aluno e montando metas + treinos sob medida.
            </Text>
            <ActivityIndicator color={colors.violetSoft} />
          </View>
        </Card>
      </View>
    </Screen>
  );
}

function SavingScreen() {
  return (
    <Screen variant="hero" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8 gap-6">
        <Card padding="lg">
          <View className="items-center gap-4">
            <ActivityIndicator color={colors.accent} />
            <Text className="text-text text-base font-semibold">
              Salvando o plano...
            </Text>
          </View>
        </Card>
      </View>
    </Screen>
  );
}

function PreviewScreen({
  plan,
  studentName,
  onSave,
  onRegenerate,
  saving,
}: {
  plan: OnboardingPlan;
  studentName: string;
  onSave: () => void;
  onRegenerate: () => void;
  saving: boolean;
}) {
  return (
    <Screen variant="hero" edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 40,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center">
          <View className="h-12 w-12 rounded-2xl bg-accent/10 border border-accent/30 items-center justify-center mb-2">
            <Sparkles size={22} color={colors.accent} />
          </View>
          <Text className="text-text text-xl font-bold text-center">
            Plano de {studentName}
          </Text>
          {plan.rationale && (
            <View className="mt-3 px-2">
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
            Metas diárias
          </Text>
          <View className="gap-2">
            <GoalRow label="Calorias" value={`${plan.calorie_goal} kcal`} />
            <GoalRow label="Proteína" value={`${plan.protein_goal_g} g`} />
            <GoalRow label="Água" value={`${plan.water_goal_ml} ml`} />
          </View>
        </Card>

        {plan.routines.length > 0 && (
          <View className="gap-2">
            <Text className="text-text-dim text-[11px] uppercase tracking-widest px-1">
              {plan.routines.length} treinos sugeridos
            </Text>
            {plan.routines.map((r, i) => (
              <Card key={i} padding="md">
                <Text className="text-text text-sm font-semibold">
                  {r.name}
                </Text>
                {r.description && (
                  <Text className="text-text-muted text-[11px] mt-0.5">
                    {r.description}
                  </Text>
                )}
                <View className="gap-1 mt-2">
                  {r.exercises.slice(0, 6).map((ex, j) => (
                    <Text
                      key={j}
                      className="text-text-dim text-[12px]"
                      numberOfLines={1}
                    >
                      • {ex.exercise_name} — {ex.sets}×{ex.reps_min}-
                      {ex.reps_max}
                    </Text>
                  ))}
                  {r.exercises.length > 6 && (
                    <Text className="text-text-muted text-[11px]">
                      + {r.exercises.length - 6} outros
                    </Text>
                  )}
                </View>
              </Card>
            ))}
          </View>
        )}

        <Card padding="sm">
          <Text className="text-text-muted text-[11px] leading-relaxed">
            💡 Você pode editar metas e treinos depois pelo perfil do aluno
            (em construção). Por enquanto, salve esse plano gerado.
          </Text>
        </Card>

        <Button
          label="Salvar e enviar pro aluno"
          onPress={onSave}
          loading={saving}
          size="lg"
          icon={<Send size={18} color={colors.textInverse} />}
        />
        <Button
          label="Gerar outro plano"
          onPress={onRegenerate}
          variant="ghost"
          icon={<RefreshCcw size={16} color={colors.textDim} />}
        />
      </ScrollView>
    </Screen>
  );
}

function GoalRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-text-dim text-sm">{label}</Text>
      <Text className="text-text text-base font-bold">{value}</Text>
    </View>
  );
}
