import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { Screen, SegmentedControl } from '@/components/ui';
import MealForm from '@/components/log/MealForm';
import WorkoutForm from '@/components/log/WorkoutForm';
import WaterForm from '@/components/log/WaterForm';
import { colors } from '@/lib/theme';

type Tab = 'meal' | 'workout' | 'water';

const TABS = [
  { value: 'meal', label: 'Refeição' },
  { value: 'workout', label: 'Treino' },
  { value: 'water', label: 'Água' },
] as const;

function toTab(raw: string | string[] | undefined): Tab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'meal' || v === 'workout' || v === 'water') return v;
  return 'meal';
}

export default function LogScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(toTab(params.tab));

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      <Screen variant="hero" edges={['top', 'bottom']}>
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
            <Text className="text-text font-semibold">
              Atualize o avanço de hoje
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <View className="px-5 pt-2">
            <SegmentedControl
              options={TABS}
              value={tab}
              onChange={setTab}
              variant="tabs"
            />
          </View>

          {tab === 'meal' && <MealForm />}
          {tab === 'workout' && <WorkoutForm />}
          {tab === 'water' && <WaterForm />}
        </KeyboardAvoidingView>
      </Screen>
    </>
  );
}
