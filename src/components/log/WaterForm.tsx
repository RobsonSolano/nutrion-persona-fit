import { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Droplet, Save, Minus, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useProfile } from '@/hooks/useProfile';
import { useWaterToday, useUpsertWater } from '@/hooks/useWaterToday';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { Button, Card, Input } from '@/components/ui';
import { colors } from '@/lib/theme';
import { friendlyMessage } from '@/lib/friendlyError';

const QUICK_PRESETS = [1000, 2000, 3000, 4000, 5000];

export default function WaterForm() {
  const router = useRouter();
  const profileQ = useProfile();
  const waterQ = useWaterToday();
  const upsert = useUpsertWater();
  const kbHeight = useKeyboardHeight();

  const goal = profileQ.data?.water_goal_ml ?? 4000;
  const current = waterQ.data?.volume_ml ?? 0;

  const [value, setValue] = useState(String(current));

  useEffect(() => {
    setValue(String(current));
  }, [current]);

  function adjust(delta: number) {
    void Haptics.selectionAsync();
    const next = Math.max(0, Number(value || '0') + delta);
    setValue(String(next));
  }

  function setAbsolute(ml: number) {
    void Haptics.selectionAsync();
    setValue(String(ml));
  }

  async function handleSave() {
    const n = Math.round(Number(value.replace(',', '.')));
    if (!Number.isFinite(n) || n < 0) {
      Alert.alert('Volume inválido', 'Informe um valor em ml (>= 0).');
      return;
    }
    try {
      await upsert.mutateAsync(n);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      Alert.alert(
        'Não consegui salvar',
        friendlyMessage(err),
      );
    }
  }

  const pct = Math.min(
    (Number(value || '0') / goal) * 100,
    100,
  );

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
      <Card glow accent="green">
        <View className="flex-row items-center gap-2 mb-3">
          <Droplet size={16} color={colors.info} />
          <Text className="text-text-dim text-[11px] uppercase tracking-widest">
            Hidratação de hoje
          </Text>
        </View>
        <View className="items-center py-3">
          <Text className="text-text text-5xl font-bold">
            {(Number(value || '0') / 1000).toFixed(2).replace('.', ',')}
            <Text className="text-text-dim text-2xl font-normal">L</Text>
          </Text>
          <Text className="text-text-muted text-xs mt-2">
            meta {(goal / 1000).toLocaleString('pt-BR')}L
          </Text>
        </View>
        <View className="h-2 rounded-full bg-border-subtle overflow-hidden mt-2">
          <View
            className="h-2 rounded-full bg-info"
            style={{ width: `${pct}%` }}
          />
        </View>
      </Card>

      <Card padding="md">
        <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
          Ajustar total
        </Text>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => adjust(-100)}
            className="h-12 w-12 rounded-2xl bg-surface-muted border border-border items-center justify-center active:opacity-70"
          >
            <Minus size={18} color={colors.textDim} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Input
              value={value}
              onChangeText={setValue}
              keyboardType="number-pad"
              placeholder="Ex: 3000 (3L)"
              center
            />
          </View>
          <Pressable
            onPress={() => adjust(100)}
            className="h-12 w-12 rounded-2xl bg-surface-muted border border-border items-center justify-center active:opacity-70"
          >
            <Plus size={18} color={colors.textDim} />
          </Pressable>
        </View>
        <Text className="text-text-muted text-[11px] mt-2 text-center">
          valor em ml — sobrescreve o total do dia
        </Text>
      </Card>

      <Card padding="md">
        <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
          Atalhos
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {QUICK_PRESETS.map((ml) => {
            const active = Number(value || '0') === ml;
            return (
              <Pressable
                key={ml}
                onPress={() => setAbsolute(ml)}
                className={`rounded-full border px-4 py-2 active:opacity-70 ${
                  active
                    ? 'bg-info border-info'
                    : 'bg-info/10 border-info/40'
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    active ? 'text-text-inverse' : 'text-info'
                  }`}
                >
                  {ml / 1000}L
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="text-text-muted text-[11px] mt-3">
          Define o total do dia (sobrescreve o valor atual).
        </Text>
      </Card>

      <Button
        label="Salvar total"
        onPress={handleSave}
        loading={upsert.isPending}
        icon={<Save size={18} color={colors.textInverse} />}
      />
    </ScrollView>
  );
}
