import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  Sparkles,
  Target,
  Dumbbell,
  HeartPulse,
  Brain,
} from 'lucide-react-native';
import { Button, Card, Logo, Screen } from '@/components/ui';
import { colors } from '@/lib/theme';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { useSkipOnboarding } from '@/hooks/useOnboarding';
import { friendlyMessage } from '@/lib/friendlyError';

export default function OnboardingIntro() {
  const router = useRouter();
  const begin = useOnboardingStore((s) => s.begin);
  const skip = useSkipOnboarding();

  function handleStart() {
    begin();
    router.push('/onboarding/dados' as Href);
  }

  async function handleSkip() {
    try {
      await skip.mutateAsync();
      router.replace('/(tabs)' as Href);
    } catch (err) {
      Alert.alert(
        'Ops',
        friendlyMessage(err),
      );
    }
  }

  return (
    <Screen variant="hero" edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 32,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center mb-8">
          <View className="flex-row items-center gap-2 mb-5 rounded-full border border-border px-3 py-1.5 bg-surface-muted">
            <Sparkles size={12} color={colors.accent} />
            <Text className="text-text-dim text-[10px] tracking-[2px] uppercase">
              Plano com IA em 60 segundos
            </Text>
          </View>
          <Logo size="lg" />
          <Text className="text-text-dim text-[11px] tracking-[3px] uppercase mt-2">
            Personalizado para você
          </Text>
        </View>

        <Text className="text-text text-2xl font-bold text-center mb-2">
          Vamos criar seu plano agora?
        </Text>
        <Text className="text-text-dim text-sm text-center leading-relaxed mb-6 px-2">
          Conta um pouco sobre você e sua meta. A IA monta{' '}
          <Text className="text-accent font-semibold">metas de calorias,
          proteína e água</Text>
          {' '}+ seus primeiros{' '}
          <Text className="text-accent font-semibold">treinos prontos</Text>
          {' '}pra você já sair executando.
        </Text>

        <View className="gap-3 mb-8">
          <BenefitRow
            icon={<Target size={18} color={colors.accent} />}
            title="Metas reais"
            subtitle="Calorias e proteína calculadas pra você, não genéricas"
          />
          <BenefitRow
            icon={<Dumbbell size={18} color={colors.accent} />}
            title="Treinos prontos"
            subtitle="3 a 5 rotinas com exercícios prescritos (séries, reps, peso)"
          />
          <BenefitRow
            icon={<HeartPulse size={18} color={colors.accent} />}
            title="Respeita limites"
            subtitle="Considera lesões, alergias e limitações que você relatar"
          />
          <BenefitRow
            icon={<Brain size={18} color={colors.accent} />}
            title="Editável depois"
            subtitle="Tudo fica salvo no perfil e você muda quando quiser"
          />
        </View>

        <Button label="Começar" onPress={handleStart} size="lg" />
        <View className="mt-3">
          <Button
            label="Pular por agora"
            onPress={handleSkip}
            loading={skip.isPending}
            variant="ghost"
          />
        </View>

        <Text className="text-text-muted text-[11px] text-center mt-6 leading-relaxed px-4">
          Uso informativo. Decisões de saúde devem ser validadas com
          profissionais.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function BenefitRow({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Card padding="md">
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/30 items-center justify-center">
          {icon}
        </View>
        <View className="flex-1">
          <Text className="text-text text-sm font-semibold">{title}</Text>
          <Text className="text-text-muted text-[11px] mt-0.5">{subtitle}</Text>
        </View>
      </View>
    </Card>
  );
}
