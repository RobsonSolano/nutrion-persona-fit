import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Pause, Play, Square, Save, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Button, Card, Screen } from '@/components/ui';
import { colors } from '@/lib/theme';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { formatHMS } from '@/lib/workoutTimer';

/**
 * Tela do cronômetro ativo. O tempo vem sempre de getElapsedMs() (timestamps);
 * o setInterval de 1s só força o re-render. "Parar" pausa e mostra o resumo
 * com Salvar/Descartar.
 */
export default function TreinoAtivoScreen() {
  const router = useRouter();
  const { active, status, getElapsedMs, pause, resume, saveToday, discard, saving } =
    useActiveWorkout();
  const [stopped, setStopped] = useState(false);
  const [, setTick] = useState(0);

  // Tick de 1s só pra re-render enquanto roda.
  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  // Sem treino ativo (entrou direto / já salvou) → volta.
  useEffect(() => {
    if (!active) router.back();
  }, [active, router]);

  if (!active) return null;

  const elapsed = getElapsedMs();

  function onStop() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (status === 'running') pause();
    setStopped(true);
  }

  async function onSave() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveToday();
    // active vira null → o effect acima navega de volta.
  }

  function onDiscard() {
    discard();
  }

  return (
    <Screen variant="hero" edges={['top', 'bottom']}>
      {/* ScrollView com flexGrow: em portrait o justify-between distribui como
          antes; em landscape a altura não cabe (~410dp de conteúdo contra
          ~380dp disponíveis) e sem scroll o botão de salvar ficava
          inalcançável. */}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-6 pt-8 pb-10 items-center justify-between">
          <View className="items-center gap-2 mt-6">
            <Text className="text-text-dim text-[12px] uppercase tracking-widest">
              {stopped ? 'Treino finalizado' : 'Treino em andamento'}
            </Text>
            <Text className="text-text text-xl font-bold text-center" numberOfLines={2}>
              {active.routineName}
            </Text>
          </View>

          <View className="items-center gap-3">
            <Text className="text-text text-6xl font-bold tabular-nums" style={{ letterSpacing: 2 }}>
              {formatHMS(elapsed)}
            </Text>
            {status === 'paused' && !stopped && (
              <Text className="text-warn text-[13px] font-semibold">⏸ Pausado</Text>
            )}
          </View>

          <View className="w-full gap-3">
            {stopped ? (
              <Card padding="md">
                <Text className="text-text-dim text-[12px] text-center mb-3">
                  {active.routineName} — {formatHMS(elapsed)}
                </Text>
                <Button
                  label="Salvar treino de hoje"
                  onPress={onSave}
                  loading={saving}
                  icon={<Save size={18} color={colors.textInverse} />}
                />
                <View className="h-2" />
                <Button
                  label="Descartar"
                  onPress={onDiscard}
                  variant="ghost"
                  icon={<Trash2 size={16} color={colors.danger} />}
                />
              </Card>
            ) : (
              <>
                {status === 'running' ? (
                  <Button
                    label="Pausar"
                    onPress={() => {
                      void Haptics.selectionAsync();
                      pause();
                    }}
                    variant="secondary"
                    icon={<Pause size={18} color={colors.text} />}
                  />
                ) : (
                  <Button
                    label="Retomar"
                    onPress={() => {
                      void Haptics.selectionAsync();
                      resume();
                    }}
                    icon={<Play size={18} color={colors.textInverse} />}
                  />
                )}
                <Button
                  label="Parar"
                  onPress={onStop}
                  variant="danger"
                  icon={<Square size={16} color={colors.textInverse} />}
                />
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
