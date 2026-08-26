import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Save,
  Flame,
  Utensils,
  Beef,
  Wheat,
  Droplet,
  Sparkles,
  Camera,
  Image as ImageIcon,
  X,
} from 'lucide-react-native';
import { useCreateFoodLog } from '@/hooks/useLogMutations';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useDailySanityUsage } from '@/hooks/useAiUsage';
import { useAuth } from '@/hooks/useAuth';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, todayKey } from '@/lib/queryKeys';
import { runSanityCheck } from '@/services/sanityCheck';
import { derivarMacrosSource } from '@/lib/macrosSource';
import { captureError } from '@/lib/sentry';
import { Button, Card, Input } from '@/components/ui';
import { CharCounter } from '@/components/onboarding';
import { useAlert } from '@/components/GlobalAlertProvider';
import { colors } from '@/lib/theme';

const MEAL_PRESETS = [
  'Café da manhã',
  'Almoço',
  'Lanche',
  'Jantar',
  'Pré-treino',
  'Pós-treino',
];

const MAX_DESCRIPTION = 300;

function toInt(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Math.round(Number(v.replace(',', '.')));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function MealForm() {
  const router = useRouter();
  const createFood = useCreateFoodLog();
  const kbHeight = useKeyboardHeight();
  const sanityUsage = useDailySanityUsage();
  const qc = useQueryClient();
  const { user } = useAuth();
  const alert = useAlert();

  const photo = useImagePicker({ purpose: 'analisar a refeição' });

  const [mealName, setMealName] = useState('');
  const [description, setDescription] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  /** kcal da última análise da IA. É contra ele que a edição do usuário faz
   *  sentido — a diferença é o erro da IA medido em produção (INS-05). */
  const [aiKcalOriginal, setAiKcalOriginal] = useState<number | null>(null);

  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');

  const calRef = useRef<TextInput>(null);
  const protRef = useRef<TextInput>(null);
  const carbRef = useRef<TextInput>(null);
  const fatRef = useRef<TextInput>(null);

  function setDescriptionGuarded(v: string) {
    if (v.length > MAX_DESCRIPTION) return;
    setDescription(v);
  }

  const canAnalyze =
    !analyzing &&
    !photo.preparing &&
    (description.trim().length >= 3 || !!photo.base64);

  async function handleAnalyze() {
    if (!canAnalyze) return;
    if (sanityUsage.limitReached) {
      alert.showAlert({
        type: 'warning',
        title: 'Limite diário',
        message: `Você já usou as ${sanityUsage.limit} análises de IA hoje. Volta amanhã!`,
      });
      return;
    }
    if (!description.trim() && !photo.base64) {
      alert.showAlert({
        type: 'info',
        title: 'Descrição ou foto',
        message: 'Descreve a refeição ou adiciona uma foto pra IA analisar.',
      });
      return;
    }

    setAnalyzing(true);
    try {
      const res = await runSanityCheck({
        description: description.trim() || 'Sem descrição. Estime pelos itens visíveis na foto.',
        imageBase64: photo.base64 ?? '',
        scaleWeightG: undefined,
      });
      const m = res.macros;
      if (m) {
        if (m.kcal != null) {
          setCalories(String(Math.round(m.kcal)));
          setAiKcalOriginal(Math.round(m.kcal));
        }
        if (m.protein_g != null) setProtein(String(Math.round(m.protein_g)));
        if (m.carbs_g != null) setCarbs(String(Math.round(m.carbs_g)));
        if (m.fats_g != null) setFats(String(Math.round(m.fats_g)));
      }
      setAiFeedback(res.feedback ?? null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (user?.id) {
        void qc.invalidateQueries({
          queryKey: queryKeys.aiUsage(user.id, 'sanity_check', todayKey()),
        });
      }
      if (!m) {
        alert.showAlert({
          type: 'warning',
          title: 'Sem estimativa',
          message:
            'A IA respondeu mas não retornou os macros. Preencha manualmente.',
        });
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Falha ao consultar a IA. Tenta de novo.';
      const isQuotaError = /limite/i.test(message);
      if (!isQuotaError) {
        captureError(err, { feature: 'meal_analyze' });
      }
      alert.showAlert({
        type: 'error',
        title: 'Não consegui analisar',
        message,
      });
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    const cal = toInt(calories);
    if (cal == null || cal === 0) {
      alert.showAlert({
        type: 'warning',
        title: 'Informe as calorias',
        message: 'Digite um valor em kcal.',
      });
      return;
    }
    try {
      await createFood.mutateAsync({
        meal_name: mealName.trim() || null,
        description: description.trim() || null,
        calories: cal,
        protein_g: toInt(protein),
        carbs_g: toInt(carbs),
        fats_g: toInt(fats),
        photo_path: null,
        ai_feedback: aiFeedback,
        ai_kcal_original: aiKcalOriginal,
        macros_source: derivarMacrosSource({
          aiKcalOriginal,
          kcalSalvo: cal,
        }),
        // Este formulário não tem campo de balança (a tela de sanity check
        // tem). Null é a verdade, não um placeholder.
        scale_weight_g: null,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      alert.showError(err);
    }
  }

  const macrosDisabled = analyzing;

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
        gap: 16,
        paddingBottom: 40 + (Platform.OS === 'android' ? kbHeight : 0),
      }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    >
      <Card>
        <View className="flex-row items-center gap-2 mb-3">
          <Utensils size={16} color={colors.accent} />
          <Text className="text-text-dim text-[11px] uppercase tracking-widest">
            O que você comeu
          </Text>
        </View>
        <View className="gap-3">
          <Input
            label="Refeição"
            value={mealName}
            onChangeText={setMealName}
            placeholder="Ex: Almoço"
          />
          <View className="flex-row flex-wrap gap-2">
            {MEAL_PRESETS.map((p) => {
              const on = mealName === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setMealName(p);
                  }}
                  hitSlop={6}
                  className={`rounded-full border px-4 py-2.5 items-center justify-center ${
                    on
                      ? 'bg-accent/10 border-accent/40'
                      : 'bg-surface-muted border-border'
                  }`}
                  style={{ minHeight: 40 }}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      on ? 'text-accent' : 'text-text-dim'
                    }`}
                  >
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Card>

      <Card padding="md">
        <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
          Foto da refeição (opcional)
        </Text>
        {photo.uri ? (
          <View className="rounded-2xl overflow-hidden border border-border-strong mb-3 relative">
            <Image
              source={{ uri: photo.uri }}
              style={{ width: '100%', aspectRatio: 4 / 3 }}
              resizeMode="cover"
            />
            <Pressable
              onPress={photo.clear}
              hitSlop={10}
              className="absolute top-2 right-2 h-9 w-9 rounded-full bg-surface-raised/95 border border-border items-center justify-center"
            >
              <X size={16} color={colors.textDim} />
            </Pressable>
          </View>
        ) : photo.preparing ? (
          <View className="rounded-2xl border border-violet/50 bg-violet/10 items-center justify-center py-10 mb-3 gap-2">
            <ActivityIndicator color={colors.violetSoft} />
            <Text className="text-violet-soft text-xs font-bold">
              Carregando imagem...
            </Text>
          </View>
        ) : (
          <View className="rounded-2xl border border-dashed border-border bg-surface-muted items-center justify-center py-8 mb-3">
            <ImageIcon size={24} color={colors.textMuted} />
            <Text className="text-text-muted text-xs mt-2">
              Sem foto. A IA usará só a descrição.
            </Text>
          </View>
        )}
        <View className="flex-row gap-2">
          <View style={{ flex: 1 }}>
            <Button
              label="Câmera"
              onPress={() => photo.pick('camera')}
              variant="secondary"
              size="md"
              loading={photo.preparing}
              disabled={photo.preparing || analyzing}
              icon={<Camera size={16} color={colors.text} />}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Galeria"
              onPress={() => photo.pick('library')}
              variant="ghost"
              size="md"
              disabled={photo.preparing || analyzing}
              icon={<ImageIcon size={16} color={colors.textDim} />}
            />
          </View>
        </View>
      </Card>

      <Card padding="md">
        <Input
          label="Descrição"
          value={description}
          onChangeText={setDescriptionGuarded}
          placeholder="150g arroz, 120g frango grelhado, 80g feijão, salada..."
          multiline
          numberOfLines={4}
          maxLength={MAX_DESCRIPTION}
          editable={!analyzing}
          style={{ minHeight: 110, textAlignVertical: 'top' }}
        />
        <CharCounter value={description} max={MAX_DESCRIPTION} />
        <Text className="text-text-muted text-[11px] mt-1 italic leading-relaxed">
          &quot;Ajuda a IA numa análise mais precisa&quot; — quanto mais detalhe (porções, modo de preparo), melhor a estimativa.
        </Text>
      </Card>

      <View>
        <Button
          label={analyzing ? 'Analisando...' : 'Analisar refeição com IA'}
          onPress={handleAnalyze}
          loading={analyzing}
          disabled={!canAnalyze || sanityUsage.limitReached}
          variant="secondary"
          icon={<Sparkles size={18} color={colors.violetSoft} />}
        />
        <Text className="text-text-muted text-[11px] mt-2 text-center">
          Estimativa de macros pela IA · {sanityUsage.used}/{sanityUsage.limit} hoje
        </Text>
      </View>

      <Card glow accent="green">
        <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
          Macros {analyzing ? '· estimando...' : '· estimativa editável'}
        </Text>
        <View className="gap-3">
          <MacroInput
            inputRef={calRef}
            label="Calorias (kcal)"
            value={calories}
            onChangeText={setCalories}
            placeholder="650"
            loading={macrosDisabled}
            onSubmitEditing={() => protRef.current?.focus()}
            leftIcon={<Flame size={18} color={colors.accent} />}
          />
          <View className="flex-row gap-3">
            <View style={{ flex: 1 }}>
              <MacroInput
                inputRef={protRef}
                label="Proteína (g)"
                value={protein}
                onChangeText={setProtein}
                placeholder="40"
                loading={macrosDisabled}
                onSubmitEditing={() => carbRef.current?.focus()}
                leftIcon={<Beef size={16} color={colors.violetSoft} />}
              />
            </View>
            <View style={{ flex: 1 }}>
              <MacroInput
                inputRef={carbRef}
                label="Carbo (g)"
                value={carbs}
                onChangeText={setCarbs}
                placeholder="80"
                loading={macrosDisabled}
                onSubmitEditing={() => fatRef.current?.focus()}
                leftIcon={<Wheat size={16} color={colors.warn} />}
              />
            </View>
          </View>
          <MacroInput
            inputRef={fatRef}
            label="Gordura (g)"
            value={fats}
            onChangeText={setFats}
            placeholder="15"
            loading={macrosDisabled}
            returnKeyType="done"
            onSubmitEditing={handleSave}
            leftIcon={<Droplet size={16} color={colors.info} />}
          />
        </View>
      </Card>

      <Button
        label="Salvar refeição"
        onPress={handleSave}
        loading={createFood.isPending}
        disabled={analyzing}
        icon={<Save size={18} color={colors.textInverse} />}
      />
    </ScrollView>
  );
}

type MacroInputProps = {
  inputRef: React.RefObject<TextInput | null>;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  loading: boolean;
  leftIcon: React.ReactNode;
  onSubmitEditing?: () => void;
  returnKeyType?: 'next' | 'done';
};

function MacroInput({
  inputRef,
  label,
  value,
  onChangeText,
  placeholder,
  loading,
  leftIcon,
  onSubmitEditing,
  returnKeyType = 'next',
}: MacroInputProps) {
  return (
    <View>
      <Input
        ref={inputRef}
        label={label}
        value={loading ? '' : value}
        onChangeText={onChangeText}
        placeholder={loading ? '' : placeholder}
        keyboardType="number-pad"
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        editable={!loading}
        leftIcon={leftIcon}
      />
      {loading && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: 14,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator size="small" color={colors.violetSoft} />
        </View>
      )}
    </View>
  );
}
