import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Droplets, AlertTriangle, Activity } from 'lucide-react-native';
import { OnboardingLayout } from '@/components/onboarding';
import { Input } from '@/components/ui';
import DisabilityFields from '@/components/DisabilityFields';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { colors } from '@/lib/theme';
import { isDisabilityValid } from '@/lib/disability';

export default function OnboardingHabitos() {
  const router = useRouter();
  const {
    water_goal_ml,
    allergies,
    physical_limitations,
    has_disability,
    disability_types,
    disability_notes,
    patch,
  } = useOnboardingStore();

  const allergiesRef = useRef<TextInput>(null);
  const limitationsRef = useRef<TextInput>(null);

  const [waterText, setWaterText] = useState(() =>
    water_goal_ml != null ? String(water_goal_ml) : '',
  );

  function handleWaterChange(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 5);
    setWaterText(digits);
    const n = Number(digits);
    patch({ water_goal_ml: Number.isFinite(n) && n > 0 ? n : null });
  }

  return (
    <OnboardingLayout
      step={4}
      total={6}
      title="Hábitos e restrições"
      subtitle="Opcional, mas ajuda a IA a sugerir um plano seguro."
      onBack={() => router.back()}
      onSkip={() => router.replace('/(tabs)' as Href)}
      onContinue={() => router.push('/onboarding/bio' as Href)}
      continueDisabled={
        !isDisabilityValid({
          hasDisability: has_disability,
          types: disability_types,
          notes: disability_notes,
        })
      }
    >
      <View className="gap-4">
        <View>
          <View className="flex-row items-center gap-2 mb-2">
            <Droplets size={14} color={colors.info} />
            <Text className="text-text-dim text-xs uppercase tracking-widest">
              Quanto você consome de água por dia?
            </Text>
          </View>
          <Input
            value={waterText}
            onChangeText={handleWaterChange}
            placeholder="2000"
            keyboardType="number-pad"
            returnKeyType="next"
            onSubmitEditing={() => allergiesRef.current?.focus()}
          />
          <Text className="text-text-muted text-[11px] mt-1">
            Informe em ml o que você bebe hoje (ex: 2000 = 2L). A IA ajusta
            conforme seu peso e treinos.
          </Text>
        </View>

        <View>
          <View className="flex-row items-center gap-2 mb-2">
            <AlertTriangle size={14} color={colors.warn} />
            <Text className="text-text-dim text-xs uppercase tracking-widest">
              Alergias alimentares
            </Text>
          </View>
          <Input
            ref={allergiesRef}
            value={allergies}
            onChangeText={(v) => patch({ allergies: v })}
            placeholder="Ex: amendoim, lactose, glúten..."
            multiline
            returnKeyType="next"
            onSubmitEditing={() => limitationsRef.current?.focus()}
          />
        </View>

        <View>
          <View className="flex-row items-center gap-2 mb-2">
            <Activity size={14} color={colors.danger} />
            <Text className="text-text-dim text-xs uppercase tracking-widest">
              Limitações físicas
            </Text>
          </View>
          <Input
            ref={limitationsRef}
            value={physical_limitations}
            onChangeText={(v) => patch({ physical_limitations: v })}
            placeholder="Ex: dor no joelho direito, hérnia L5..."
            multiline
          />
          <Text className="text-text-muted text-[11px] mt-1">
            A IA evita exercícios que agravem o que você relatar.
          </Text>
        </View>

        <DisabilityFields
          hasDisability={has_disability}
          types={disability_types}
          notes={disability_notes}
          onChange={(p) =>
            patch({
              ...(p.hasDisability !== undefined && {
                has_disability: p.hasDisability,
              }),
              ...(p.types !== undefined && { disability_types: p.types }),
              ...(p.notes !== undefined && { disability_notes: p.notes }),
            })
          }
        />
      </View>
    </OnboardingLayout>
  );
}
