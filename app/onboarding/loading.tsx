import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { Card, Screen } from '@/components/ui';
import { colors } from '@/lib/theme';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { useOnboardingResultStore } from '@/stores/useOnboardingResultStore';
import {
  useGenerateOnboardingPlan,
  useSaveOnboardingResult,
} from '@/hooks/useOnboarding';
import { useProfile } from '@/hooks/useProfile';
import { captureError } from '@/lib/sentry';
import type { OnboardingInput, OnboardingPlan } from '@/services/onboarding';

const STAGES = [
  'Analisando seu perfil...',
  'Calculando metas nutricionais...',
  'Selecionando exercícios seguros...',
  'Montando suas rotinas...',
  'Salvando seu plano...',
];

export default function OnboardingLoading() {
  const router = useRouter();
  const generate = useGenerateOnboardingPlan();
  const save = useSaveOnboardingResult();
  const profile = useProfile();
  const state = useOnboardingStore();
  const [stage, setStage] = useState(0);
  const inputRef = useRef<OnboardingInput | null>(null);
  const planRef = useRef<OnboardingPlan | null>(null);
  const triggeredRef = useRef(false);

  // Bloqueia o back hardware: gerar plano é definitivo.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );

  useEffect(() => {
    const t = setInterval(() => {
      setStage((s) => (s + 1) % STAGES.length);
    }, 1600);
    return () => clearInterval(t);
  }, []);

  const runStep = useCallback(async () => {
    // Snapshot do input só na primeira tentativa — retry mantém os dados.
    if (!inputRef.current) {
      inputRef.current = {
        full_name: profile.data?.full_name ?? null,
        sex: state.sex,
        birth_year: state.birth_year,
        weight_kg: state.weight_kg,
        height_cm: state.height_cm,
        goal_type: state.goal_type,
        goal_weight_kg: state.goal_weight_kg,
        goal_target_date: state.goal_target_date,
        practices_sport: state.practices_sport,
        sports: state.sports.length ? state.sports : null,
        weekly_frequency: state.weekly_frequency,
        water_goal_ml: state.water_goal_ml,
        allergies: state.allergies.trim() || null,
        physical_limitations: state.physical_limitations.trim() || null,
        has_disability: state.has_disability,
        disability_types: state.disability_types,
        disability_notes: state.disability_notes.trim() || null,
        bio: state.bio.trim() || null,
      };
    }

    try {
      if (!planRef.current) {
        planRef.current = await generate.mutateAsync(inputRef.current);
      }
      await save.mutateAsync({
        input: inputRef.current,
        plan: planRef.current,
      });
      useOnboardingResultStore.setState({
        plan: planRef.current,
        input: inputRef.current,
      });
      router.replace('/onboarding/resultado' as Href);
    } catch (err) {
      const phase: 'generate' | 'save' = planRef.current ? 'save' : 'generate';
      const message =
        err instanceof Error ? err.message : 'Tenta de novo em instantes.';
      if (!/limite/i.test(message)) {
        captureError(err, {
          feature: phase === 'save' ? 'onboarding_save' : 'onboarding_plan',
        });
      }
      Alert.alert(
        phase === 'save' ? 'Não consegui salvar' : 'Não consegui gerar o plano',
        message,
        [
          {
            text: 'Tentar de novo',
            onPress: () => {
              void runStep();
            },
          },
        ],
        { cancelable: false },
      );
    }
    // generate/save são estáveis (mutations); profile/state via closure intencional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    void runStep();
  }, [runStep]);

  return (
    <Screen variant="hero" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8 gap-8">
        <Card glow accent="green" padding="lg">
          <View className="items-center gap-4">
            <View className="h-16 w-16 rounded-2xl bg-accent/10 border border-accent/30 items-center justify-center">
              <Sparkles size={28} color={colors.accent} />
            </View>
            <Text className="text-text text-xl font-bold text-center">
              Gerando seu plano personalizado
            </Text>
            <Text className="text-text-dim text-sm text-center leading-relaxed">
              A IA está montando metas + treinos sob medida. Isso leva alguns
              segundos.
            </Text>
            <ActivityIndicator color={colors.accent} />
            <Text className="text-accent text-xs font-semibold">
              {STAGES[stage]}
            </Text>
          </View>
        </Card>

        <Text className="text-text-muted text-[11px] text-center leading-relaxed px-4">
          Uso informativo. As recomendações não substituem orientação
          profissional.
        </Text>
      </View>
    </Screen>
  );
}
