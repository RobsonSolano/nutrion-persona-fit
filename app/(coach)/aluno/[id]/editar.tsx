import { useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Save, Target } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  Button,
  Card,
  Input,
  Screen,
  SegmentedControl,
} from '@/components/ui';
import DisabilityFields, {
  type DisabilityValue,
} from '@/components/DisabilityFields';
import { colors } from '@/lib/theme';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useStudentDetail, useUpdateStudent } from '@/hooks/useStudents';
import type {
  GoalType,
  Sex,
  WeeklyFrequency,
} from '@/types/database';
import { captureError } from '@/lib/sentry';

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

export default function EditarAlunoScreen() {
  const router = useRouter();
  const kbHeight = useKeyboardHeight();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detailQ = useStudentDetail(id ?? null);
  const updateMutation = useUpdateStudent();

  if (!id) return null;

  if (detailQ.isLoading) {
    return (
      <Screen variant="hero" edges={['top', 'bottom']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.violetSoft} />
        </View>
      </Screen>
    );
  }

  if (!detailQ.data) {
    return (
      <Screen variant="hero" edges={['top', 'bottom']}>
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <Text className="text-text-dim">Aluno não encontrado.</Text>
          <Button
            label="Voltar"
            onPress={() => router.back()}
            variant="ghost"
          />
        </View>
      </Screen>
    );
  }

  return (
    <EditForm
      profile={detailQ.data.profile}
      onCancel={() => router.back()}
      onSave={async (patch) => {
        try {
          await updateMutation.mutateAsync({ studentId: id, patch });
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
          router.back();
        } catch (err) {
          captureError(err, { feature: 'coach_update_student' });
          Alert.alert(
            'Não consegui salvar',
            err instanceof Error ? err.message : 'Tenta de novo.',
          );
        }
      }}
      saving={updateMutation.isPending}
      kbHeight={kbHeight}
    />
  );
}

function EditForm({
  profile,
  onCancel,
  onSave,
  saving,
  kbHeight,
}: {
  profile: import('@/types/database').Profile;
  onCancel: () => void;
  onSave: (patch: import('@/services/students').UpdateStudentPatch) => Promise<void>;
  saving: boolean;
  kbHeight: number;
}) {
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [sex, setSex] = useState<Sex | null>(profile.sex);
  const [birthYear, setBirthYear] = useState(
    profile.birth_year != null ? String(profile.birth_year) : '',
  );
  const [weight, setWeight] = useState(
    profile.weight_kg != null ? String(profile.weight_kg) : '',
  );
  const [height, setHeight] = useState(
    profile.height_cm != null ? String(profile.height_cm) : '',
  );
  const [goalType, setGoalType] = useState<GoalType | null>(profile.goal_type);
  const [goalWeight, setGoalWeight] = useState(
    profile.goal_weight_kg != null ? String(profile.goal_weight_kg) : '',
  );
  const [sports, setSports] = useState<string[]>(profile.sports ?? []);
  const [frequency, setFrequency] = useState<WeeklyFrequency | null>(
    profile.weekly_frequency,
  );
  const [allergies, setAllergies] = useState(profile.allergies ?? '');
  const [limitations, setLimitations] = useState(
    profile.physical_limitations ?? '',
  );
  const [bio, setBio] = useState(profile.bio ?? '');
  const [disability, setDisability] = useState<DisabilityValue>({
    hasDisability: profile.has_disability,
    types: profile.disability_types ?? [],
    notes: profile.disability_notes ?? '',
  });

  const [calorieGoal, setCalorieGoal] = useState(
    profile.daily_calorie_goal != null ? String(profile.daily_calorie_goal) : '',
  );
  const [proteinGoal, setProteinGoal] = useState(
    profile.protein_goal_g != null ? String(profile.protein_goal_g) : '',
  );
  const [waterGoal, setWaterGoal] = useState(
    profile.water_goal_ml != null ? String(profile.water_goal_ml) : '',
  );

  function toggleSport(s: string) {
    setSports((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function handleSave() {
    void onSave({
      full_name: fullName.trim() || null,
      sex,
      birth_year: birthYear ? Number(birthYear) : null,
      weight_kg: weight ? Number(weight) : null,
      height_cm: height ? Number(height) : null,
      goal_type: goalType,
      goal_weight_kg: goalWeight ? Number(goalWeight) : null,
      practices_sport: sports.length > 0,
      sports: sports.length ? sports : null,
      weekly_frequency: frequency,
      allergies: allergies.trim() || null,
      physical_limitations: limitations.trim() || null,
      has_disability: disability.hasDisability,
      disability_types: disability.types,
      disability_notes: disability.notes.trim() || null,
      bio: bio.trim() || null,
      daily_calorie_goal: calorieGoal ? Number(calorieGoal) : null,
      protein_goal_g: proteinGoal ? Number(proteinGoal) : null,
      water_goal_ml: waterGoal ? Number(waterGoal) : null,
    });
  }

  return (
    <Screen variant="hero" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={0}
        className="flex-1"
      >
        <View className="flex-row items-center gap-3 px-5 py-3 border-b border-border-subtle">
          <Pressable
            onPress={onCancel}
            hitSlop={12}
            className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <ArrowLeft size={18} color={colors.textDim} />
          </Pressable>
          <Text className="text-text font-semibold text-base flex-1">
            Editar ficha
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 32 + (Platform.OS === 'android' ? kbHeight : 0),
            gap: 14,
          }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <Section title="Identidade">
            <Input
              value={fullName}
              onChangeText={setFullName}
              placeholder="Nome completo"
              autoCapitalize="words"
            />
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
            <Label>Modalidades</Label>
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

          <Section title="Metas diárias">
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Input
                  value={calorieGoal}
                  onChangeText={setCalorieGoal}
                  placeholder="kcal"
                  keyboardType="number-pad"
                />
              </View>
              <View className="flex-1">
                <Input
                  value={proteinGoal}
                  onChangeText={setProteinGoal}
                  placeholder="proteína (g)"
                  keyboardType="number-pad"
                />
              </View>
              <View className="flex-1">
                <Input
                  value={waterGoal}
                  onChangeText={setWaterGoal}
                  placeholder="água (ml)"
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </Section>

          <Section title="Saúde / contexto">
            <Input
              value={allergies}
              onChangeText={setAllergies}
              placeholder="Alergias"
              multiline
              numberOfLines={2}
              style={{ minHeight: 60, textAlignVertical: 'top' }}
            />
            <Input
              value={limitations}
              onChangeText={setLimitations}
              placeholder="Limitações físicas"
              multiline
              numberOfLines={2}
              style={{ minHeight: 60, textAlignVertical: 'top' }}
            />
            <Input
              value={bio}
              onChangeText={setBio}
              placeholder="Bio / contexto"
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

          <Button
            label="Salvar alterações"
            onPress={handleSave}
            loading={saving}
            size="lg"
            icon={<Save size={18} color={colors.textInverse} />}
          />

          <Text className="text-text-muted text-[11px] text-center px-2 leading-relaxed">
            Estas alterações afetam a ficha do aluno mas NÃO regeneram o plano
            automaticamente. Use "Gerar novo plano com IA" no detalhe se
            quiser que a IA reaja a mudanças significativas (peso/objetivo).
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
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
