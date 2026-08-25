import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  X,
  Camera,
  ImageIcon,
  Sparkles,
  Scale,
  Utensils,
  Save,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react-native';
import { runSanityCheck, type SanityCheckResult } from '@/services/sanityCheck';
import { useCreateFoodLog } from '@/hooks/useLogMutations';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useDailySanityUsage } from '@/hooks/useAiUsage';
import { useAiPersonalLocked } from '@/hooks/useEntitlement';
import { DailyLimitError } from '@/lib/dailyLimit';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useAlert } from '@/components/GlobalAlertProvider';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, todayKey } from '@/lib/queryKeys';
import { useAuth } from '@/hooks/useAuth';
import { Button, Card, Input, MarkdownText, Screen } from '@/components/ui';
import PaywallNotice from '@/components/ui/PaywallNotice';
import { colors } from '@/lib/theme';
import { handleNeedsUpgrade, openPaywall } from '@/lib/paywall';
import { captureError } from '@/lib/sentry';

type Stage = 'input' | 'analyzing' | 'result';

// Aviso amigável de cota diária esgotada — mesmo texto no check proativo
// (antes de tentar) e no reativo (429 daily_limit vindo do servidor).
const sanityDoneAlert = (limit: number) =>
  ({
    title: 'Análises de hoje concluídas ✅',
    message: `Você já usou suas ${limit} análises de prato de hoje. Elas renovam amanhã — te espero lá! 🙌`,
    type: 'info',
  }) as const;

export default function SanityCheckScreen() {
  const router = useRouter();
  const createFood = useCreateFoodLog();
  const kbHeight = useKeyboardHeight();
  const sanityUsage = useDailySanityUsage();
  const aiLocked = useAiPersonalLocked();
  const qc = useQueryClient();
  const { user } = useAuth();
  const alert = useAlert();

  const photo = useImagePicker({ purpose: 'analisar o prato' });
  const [description, setDescription] = useState('');
  const [scaleWeight, setScaleWeight] = useState('');
  const [stage, setStage] = useState<Stage>('input');
  const [result, setResult] = useState<SanityCheckResult | null>(null);

  async function handleAnalyze() {
    if (aiLocked) {
      openPaywall('sanity_check');
      return;
    }
    if (!photo.base64) {
      alert.showAlert({
        title: 'Foto do prato',
        message: 'Tire ou escolha uma foto primeiro.',
        type: 'warning',
      });
      return;
    }
    if (description.trim().length < 3) {
      alert.showAlert({
        title: 'Descrição curta',
        message: 'Descreve brevemente o prato (ex: 150g arroz, 120g frango).',
        type: 'warning',
      });
      return;
    }
    if (sanityUsage.limitReached) {
      alert.showAlert(sanityDoneAlert(sanityUsage.limit));
      return;
    }

    setStage('analyzing');
    try {
      const res = await runSanityCheck({
        description: description.trim(),
        imageBase64: photo.base64,
        scaleWeightG: scaleWeight ? Number(scaleWeight) : undefined,
      });
      setResult(res);
      setStage('result');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (user?.id) {
        void qc.invalidateQueries({
          queryKey: queryKeys.aiUsage(user.id, 'sanity_check', todayKey()),
        });
      }
    } catch (err) {
      setStage('input');
      // Gating do billing-core: 402 needs_upgrade → paywall, sem erro.
      if (handleNeedsUpgrade(err)) return;
      // Cota diária estourada (race com o check proativo): aviso amigável, não erro.
      if (err instanceof DailyLimitError) {
        alert.showAlert(sanityDoneAlert(err.limit ?? sanityUsage.limit));
        return;
      }
      captureError(err, { feature: 'sanity_check' });
      alert.showError(err);
    }
  }

  async function handleSaveAsFoodLog() {
    if (!result?.macros) return;
    try {
      await createFood.mutateAsync({
        meal_name: 'Refeição (analisada)',
        description: description.trim(),
        calories: result.macros.kcal ?? null,
        protein_g: result.macros.protein_g ?? null,
        carbs_g: result.macros.carbs_g ?? null,
        fats_g: result.macros.fats_g ?? null,
        photo_path: null,
        ai_feedback: result.feedback ?? null,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      alert.showError(err);
    }
  }

  function handleReset() {
    photo.clear();
    setDescription('');
    setScaleWeight('');
    setResult(null);
    setStage('input');
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
      <Screen variant="violet" edges={['top']}>
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={0}
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
            <Text className="text-text font-semibold">Sanity Check</Text>
            <View
              className="rounded-full border px-2.5 py-1"
              style={{
                borderColor: sanityUsage.limitReached
                  ? `${colors.danger}55`
                  : `${colors.violetSoft}55`,
                backgroundColor: sanityUsage.limitReached
                  ? `${colors.danger}15`
                  : `${colors.violetSoft}15`,
              }}
            >
              <Text
                className="text-[11px] font-semibold"
                style={{
                  color: sanityUsage.limitReached
                    ? colors.danger
                    : colors.violetSoft,
                }}
              >
                {sanityUsage.used}/{sanityUsage.limit}
              </Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{
              padding: 20,
              gap: 16,
              paddingBottom: 60 + (Platform.OS === 'android' ? kbHeight : 0),
            }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            {stage === 'input' && aiLocked && (
              <PaywallNotice
                feature="sanity_check"
                title="Sanity check é um recurso Pro"
                description="Assine pra validar seus pratos por foto com IA. Toque pra ver os planos."
              />
            )}

            {stage === 'input' && (
              <InputStage
                photoUri={photo.uri}
                description={description}
                scaleWeight={scaleWeight}
                preparing={photo.preparing}
                onPickCamera={() => photo.pick('camera')}
                onPickLibrary={() => photo.pick('library')}
                onDescriptionChange={setDescription}
                onScaleWeightChange={setScaleWeight}
                onAnalyze={handleAnalyze}
                canAnalyze={
                  !!photo.base64 &&
                  description.trim().length >= 3 &&
                  !photo.preparing
                }
              />
            )}

            {stage === 'analyzing' && (
              <AnalyzingStage photoUri={photo.uri ?? undefined} />
            )}

            {stage === 'result' && result && (
              <ResultStage
                result={result}
                photoUri={photo.uri ?? undefined}
                onReset={handleReset}
                onSave={handleSaveAsFoodLog}
                saving={createFood.isPending}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    </>
  );
}

// ---------------- STAGES ----------------

function InputStage(props: {
  photoUri: string | null;
  description: string;
  scaleWeight: string;
  preparing: boolean;
  onPickCamera: () => void;
  onPickLibrary: () => void;
  onDescriptionChange: (v: string) => void;
  onScaleWeightChange: (v: string) => void;
  onAnalyze: () => void;
  canAnalyze: boolean;
}) {
  return (
    <>
      <Card glow accent="violet">
        <View className="flex-row items-center gap-2 mb-3">
          <Sparkles size={16} color={colors.violetSoft} />
          <Text className="text-text-dim text-[11px] uppercase tracking-widest">
            Validar refeição com IA
          </Text>
        </View>
        <Text className="text-text-dim text-sm leading-relaxed">
          Tire uma foto do prato (idealmente em cima da balança), descreva o que
          tem, e a IA valida se a descrição bate com o que dá pra ver.
        </Text>
      </Card>

      <Card padding="md">
        <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
          Foto do prato
        </Text>
        {props.photoUri ? (
          <View className="rounded-2xl overflow-hidden border border-border-strong mb-3">
            <Image
              source={{ uri: props.photoUri }}
              style={{ width: '100%', aspectRatio: 4 / 3 }}
              resizeMode="cover"
            />
          </View>
        ) : props.preparing ? (
          <View className="rounded-2xl border border-violet/50 bg-violet/10 items-center justify-center py-12 mb-3 gap-3">
            <ActivityIndicator size="large" color={colors.violetSoft} />
            <Text className="text-violet-soft text-sm font-bold">
              Carregando imagem...
            </Text>
            <Text className="text-text-muted text-[11px] text-center px-6 leading-relaxed">
              Reduzindo tamanho pra enviar pra IA. Pode levar alguns segundos
              em fotos de alta qualidade.
            </Text>
          </View>
        ) : (
          <View className="rounded-2xl border border-dashed border-border bg-surface-muted items-center justify-center py-12 mb-3">
            <ImageIcon size={28} color={colors.textMuted} />
            <Text className="text-text-muted text-xs mt-2">
              Nenhuma foto selecionada
            </Text>
          </View>
        )}
        <View className="flex-row gap-2">
          <View style={{ flex: 1 }}>
            <Button
              label="Câmera"
              onPress={props.onPickCamera}
              variant="secondary"
              size="md"
              loading={props.preparing}
              disabled={props.preparing}
              icon={<Camera size={16} color={colors.text} />}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Galeria"
              onPress={props.onPickLibrary}
              variant="ghost"
              size="md"
              disabled={props.preparing}
              icon={<ImageIcon size={16} color={colors.textDim} />}
            />
          </View>
        </View>
      </Card>

      <Card padding="md">
        <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
          Contexto
        </Text>
        <View className="gap-3">
          <Input
            label="Descrição do prato"
            value={props.description}
            onChangeText={props.onDescriptionChange}
            placeholder="150g arroz, 120g frango grelhado, 80g feijão, salada"
            multiline
            numberOfLines={3}
          />
          <Input
            label="Peso total na balança (g)"
            value={props.scaleWeight}
            onChangeText={props.onScaleWeightChange}
            placeholder="450 (opcional)"
            keyboardType="number-pad"
            leftIcon={<Scale size={16} color={colors.textMuted} />}
          />
        </View>
      </Card>

      <Button
        label="Analisar refeição"
        onPress={props.onAnalyze}
        disabled={!props.canAnalyze}
        icon={<Sparkles size={18} color={colors.textInverse} />}
      />
    </>
  );
}

function AnalyzingStage({ photoUri }: { photoUri?: string }) {
  return (
    <Card glow accent="violet">
      {photoUri && (
        <View className="rounded-2xl overflow-hidden border border-border-strong mb-4">
          <Image
            source={{ uri: photoUri }}
            style={{ width: '100%', aspectRatio: 4 / 3, opacity: 0.7 }}
            resizeMode="cover"
          />
        </View>
      )}
      <View className="items-center py-6 gap-3">
        <View className="h-12 w-12 rounded-full bg-violet/15 border border-violet/40 items-center justify-center">
          <Sparkles size={22} color={colors.violetSoft} />
        </View>
        <Text className="text-text text-lg font-semibold">
          Analisando seu prato...
        </Text>
        <Text className="text-text-dim text-sm text-center">
          A IA está cruzando foto, descrição e peso informado.
        </Text>
      </View>
    </Card>
  );
}

function ResultStage({
  result,
  photoUri,
  onReset,
  onSave,
  saving,
}: {
  result: SanityCheckResult;
  photoUri?: string;
  onReset: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const ok = result.consistency === 'ok';
  const showMacros = !!result.macros;

  return (
    <>
      <Card glow accent={ok ? 'green' : 'violet'}>
        {photoUri && (
          <View className="rounded-2xl overflow-hidden border border-border-strong mb-4">
            <Image
              source={{ uri: photoUri }}
              style={{ width: '100%', aspectRatio: 4 / 3 }}
              resizeMode="cover"
            />
          </View>
        )}
        <View className="flex-row items-center gap-2 mb-3">
          {ok ? (
            <CheckCircle2 size={18} color={colors.accent} />
          ) : (
            <AlertTriangle size={18} color={colors.warn} />
          )}
          <Text
            className="text-[11px] uppercase tracking-widest font-semibold"
            style={{ color: ok ? colors.accent : colors.warn }}
          >
            {ok ? 'Consistente' : 'Diverge um pouco'}
          </Text>
        </View>
        {result.feedback ? (
          <MarkdownText value={result.feedback} fontSize={14} />
        ) : (
          <Text className="text-text-dim text-sm leading-relaxed">
            {result.raw ?? 'Sem feedback retornado.'}
          </Text>
        )}
      </Card>

      {result.items && result.items.length > 0 && (
        <Card padding="md">
          <View className="flex-row items-center gap-2 mb-3">
            <Utensils size={14} color={colors.violetSoft} />
            <Text className="text-text-dim text-[11px] uppercase tracking-widest">
              Itens identificados
            </Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {result.items.map((item, i) => (
              <View
                key={`${item.name}-${i}`}
                className="rounded-full border border-border bg-surface-muted px-3 py-1"
              >
                <Text className="text-text-dim text-xs">
                  {item.qty_g && item.qty_g > 0
                    ? `${item.name} · ${Math.round(item.qty_g)} g`
                    : item.name}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {showMacros && (
        <Card glow accent="green">
          <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
            Macros estimados
          </Text>
          <View className="flex-row flex-wrap gap-3">
            <MacroBlock label="kcal" value={result.macros?.kcal} />
            <MacroBlock label="proteína (g)" value={result.macros?.protein_g} />
            <MacroBlock label="carbo (g)" value={result.macros?.carbs_g} />
            <MacroBlock label="gordura (g)" value={result.macros?.fats_g} />
          </View>
        </Card>
      )}

      <View className="gap-2">
        {showMacros && (
          <Button
            label="Salvar como refeição"
            onPress={onSave}
            loading={saving}
            icon={<Save size={18} color={colors.textInverse} />}
          />
        )}
        <Button
          label="Analisar outra foto"
          onPress={onReset}
          variant="ghost"
          size="md"
        />
      </View>
    </>
  );
}

function MacroBlock({ label, value }: { label: string; value?: number }) {
  return (
    <View className="rounded-2xl border border-border bg-surface-muted px-4 py-3" style={{ flexBasis: '47%', flexGrow: 1 }}>
      <Text className="text-text-muted text-[10px] uppercase tracking-widest">
        {label}
      </Text>
      <Text className="text-text text-xl font-bold mt-1">
        {value != null ? value.toLocaleString('pt-BR') : '—'}
      </Text>
    </View>
  );
}
