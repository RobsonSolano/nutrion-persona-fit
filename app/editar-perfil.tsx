import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { X, Save, User as UserIcon, Mail, Wand2 } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { Button, Card, Input, Screen } from '@/components/ui';
import AvatarPicker from '@/components/AvatarPicker';
import DangerZone from '@/components/DangerZone';
import { useAlert } from '@/components/GlobalAlertProvider';
import { colors } from '@/lib/theme';
import {
  suggestedCalories,
  suggestedProtein,
  suggestedWater,
} from '@/lib/biometrics';

function toNum(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toInt(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Math.round(Number(v.replace(',', '.')));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function EditarPerfilScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const profileQ = useProfile();
  const updateM = useUpdateProfile();
  const kbHeight = useKeyboardHeight();
  const alert = useAlert();

  const [fullName, setFullName] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [calGoal, setCalGoal] = useState('');
  const [proteinGoal, setProteinGoal] = useState('');
  const [waterGoal, setWaterGoal] = useState('');

  const weightRef = useRef<TextInput>(null);
  const heightRef = useRef<TextInput>(null);
  const goalWRef = useRef<TextInput>(null);
  const calRef = useRef<TextInput>(null);
  const proteinRef = useRef<TextInput>(null);
  const waterRef = useRef<TextInput>(null);

  useEffect(() => {
    const p = profileQ.data;
    if (!p) return;
    setFullName(p.full_name ?? '');
    setWeight(p.weight_kg?.toString() ?? '');
    setHeight(p.height_cm?.toString() ?? '');
    setGoalWeight(p.goal_weight_kg?.toString() ?? '');
    setCalGoal(p.daily_calorie_goal?.toString() ?? '');
    setProteinGoal(p.protein_goal_g?.toString() ?? '');
    setWaterGoal(p.water_goal_ml?.toString() ?? '');
  }, [profileQ.data]);

  function handleSuggest() {
    const w = toNum(weight);
    const h = toNum(height);
    if (!w || !h) {
      alert.showAlert({
        title: 'Informe peso e altura',
        message:
          'Preciso de peso e altura para sugerir metas personalizadas.',
        type: 'warning',
      });
      return;
    }
    const cal = suggestedCalories({ weightKg: w, heightCm: h });
    const prot = suggestedProtein(w);
    const water = suggestedWater(w);
    if (cal) setCalGoal(String(cal));
    if (prot) setProteinGoal(String(prot));
    if (water) setWaterGoal(String(water));
  }

  async function handleSave() {
    const name = fullName.trim();
    if (name.length < 2) {
      alert.showAlert({
        title: 'Nome inválido',
        message: 'Informe seu nome completo.',
        type: 'warning',
      });
      return;
    }
    try {
      await updateM.mutateAsync({
        full_name: name,
        weight_kg: toNum(weight),
        height_cm: toNum(height),
        goal_weight_kg: toNum(goalWeight),
        daily_calorie_goal: toInt(calGoal),
        protein_goal_g: toInt(proteinGoal),
        water_goal_ml: toInt(waterGoal),
      });
      router.back();
    } catch (err) {
      alert.showError(err);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      <Screen variant="violet" edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
          className="flex-1"
        >
          <View className="flex-row items-center justify-between px-5 py-3 border-b border-border-subtle">
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
            >
              <X size={18} color={colors.textDim} />
            </Pressable>
            <Text className="text-text font-semibold">Editar perfil</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView
            contentContainerStyle={{
              padding: 20,
              gap: 20,
              paddingBottom: 60 + (Platform.OS === 'android' ? kbHeight : 0),
            }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            <Card>
              <View className="flex-row items-center gap-3 mb-2">
                <UserIcon size={16} color={colors.accent} />
                <Text className="text-text-dim text-[11px] uppercase tracking-widest">
                  Identidade
                </Text>
              </View>
              <View className="my-3">
                <AvatarPicker
                  avatarUrl={profileQ.data?.avatar_url ?? null}
                  name={fullName || profileQ.data?.full_name || null}
                />
              </View>
              <View className="gap-3 mt-3">
                <Input
                  label="Nome"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Seu nome"
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => weightRef.current?.focus()}
                />
                <View className="flex-row items-center gap-3 rounded-2xl border border-border-subtle bg-surface-muted px-4 py-3">
                  <Mail size={16} color={colors.textMuted} />
                  <View className="flex-1">
                    <Text className="text-text-muted text-[10px] uppercase tracking-widest">
                      E-mail
                    </Text>
                    <Text className="text-text-dim text-sm mt-0.5">
                      {user?.email ?? '—'}
                    </Text>
                  </View>
                  <Text className="text-text-muted text-[10px]">
                    não editável
                  </Text>
                </View>
              </View>
            </Card>

            <Card>
              <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
                Medidas
              </Text>
              <View className="gap-3">
                <Input
                  ref={weightRef}
                  label="Peso atual (kg)"
                  value={weight}
                  onChangeText={setWeight}
                  placeholder="75"
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => heightRef.current?.focus()}
                />
                <Input
                  ref={heightRef}
                  label="Altura (cm)"
                  value={height}
                  onChangeText={setHeight}
                  placeholder="178"
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => goalWRef.current?.focus()}
                />
                <Input
                  ref={goalWRef}
                  label="Meta de peso (kg)"
                  value={goalWeight}
                  onChangeText={setGoalWeight}
                  placeholder="72"
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => calRef.current?.focus()}
                />
              </View>
            </Card>

            <Card glow accent="green">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-text-dim text-[11px] uppercase tracking-widest">
                  Metas diárias
                </Text>
                <Pressable
                  onPress={handleSuggest}
                  hitSlop={8}
                  className="flex-row items-center gap-1.5 rounded-full bg-accent/10 border border-accent/40 px-3 py-1 active:opacity-70"
                >
                  <Wand2 size={12} color={colors.accent} />
                  <Text className="text-accent text-[11px] font-semibold">
                    Sugerir
                  </Text>
                </Pressable>
              </View>
              <View className="gap-3">
                <Input
                  ref={calRef}
                  label="Calorias (kcal)"
                  value={calGoal}
                  onChangeText={setCalGoal}
                  placeholder="2500"
                  keyboardType="number-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => proteinRef.current?.focus()}
                />
                <Input
                  ref={proteinRef}
                  label="Proteína (g)"
                  value={proteinGoal}
                  onChangeText={setProteinGoal}
                  placeholder="180"
                  keyboardType="number-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => waterRef.current?.focus()}
                />
                <Input
                  ref={waterRef}
                  label="Água (ml)"
                  value={waterGoal}
                  onChangeText={setWaterGoal}
                  placeholder="4000"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
              </View>
            </Card>

            <Button
              label="Salvar alterações"
              onPress={handleSave}
              loading={updateM.isPending}
              icon={<Save size={18} color={colors.textInverse} />}
            />

            <DangerZone />
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    </>
  );
}
