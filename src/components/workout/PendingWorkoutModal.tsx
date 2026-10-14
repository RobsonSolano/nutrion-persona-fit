import { useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { Save, SlidersHorizontal, Trash2 } from 'lucide-react-native';
import { Button, Card, Input } from '@/components/ui';
import { colors } from '@/lib/theme';
import { usePendingWorkout } from '@/hooks/usePendingWorkout';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { formatHMS, msToMinutes } from '@/lib/workoutTimer';

/**
 * Modal de recuperação de treino pendente (app foi morto com um treino
 * rodando). Mostra nome, dia e tempo total congelado, com Salvar / Ajustar /
 * Remover. "Ajustar" habilita duração (h+min) e dia pra salvar na data certa.
 * Montar uma vez num layout autenticado alto.
 */
export function PendingWorkoutModal() {
  const { pending, elapsedMsValue, saveAsIs, saveAdjusted, remove, saving } =
    usePendingWorkout();
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [day, setDay] = useState('');
  const { blocked } = useAppUpdate();

  // Bloqueio de versão vem primeiro ([MOD]-01).
  if (!pending || blocked) return null;

  const totalMin = msToMinutes(elapsedMsValue);

  function openAdjust() {
    setHours(String(Math.floor(totalMin / 60)));
    setMinutes(String(totalMin % 60));
    setDay(pending!.day);
    setEditing(true);
  }

  async function confirmAdjust() {
    await saveAdjusted({
      hours: Number(hours) || 0,
      minutes: Number(minutes) || 0,
      day: day.trim() || pending!.day,
    });
    setEditing(false);
  }

  return (
    <Modal transparent animationType="fade" visible={!!pending}>
      <View className="flex-1 items-center justify-center bg-black/70 px-6">
        <Card padding="lg">
          <Text className="text-text text-lg font-bold mb-1">
            Último treino não foi finalizado
          </Text>
          <Text className="text-text-dim text-[13px] mb-4 leading-relaxed">
            Verifique o registro abaixo.
          </Text>

          <View className="gap-1 rounded-2xl border border-border bg-surface-muted px-4 py-3 mb-4">
            <Text className="text-text text-base font-semibold" numberOfLines={2}>
              {pending.routineName}
            </Text>
            <Text className="text-text-dim text-[12px]">Dia: {pending.day}</Text>
            <Text className="text-accent text-[15px] font-bold tabular-nums">
              Tempo total: {formatHMS(elapsedMsValue)}
            </Text>
          </View>

          {editing ? (
            <View className="gap-3">
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Input
                    label="Horas"
                    value={hours}
                    onChangeText={setHours}
                    keyboardType="number-pad"
                  />
                </View>
                <View className="flex-1">
                  <Input
                    label="Minutos"
                    value={minutes}
                    onChangeText={setMinutes}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <Input
                label="Dia (AAAA-MM-DD)"
                value={day}
                onChangeText={setDay}
                autoCapitalize="none"
              />
              <Button
                label="Salvar ajuste"
                onPress={confirmAdjust}
                loading={saving}
                icon={<Save size={18} color={colors.textInverse} />}
              />
              <Button
                label="Voltar"
                onPress={() => setEditing(false)}
                variant="ghost"
              />
            </View>
          ) : (
            <View className="gap-2">
              <Button
                label="Salvar"
                onPress={() => void saveAsIs()}
                loading={saving}
                icon={<Save size={18} color={colors.textInverse} />}
              />
              <Button
                label="Ajustar"
                onPress={openAdjust}
                variant="secondary"
                icon={<SlidersHorizontal size={16} color={colors.text} />}
              />
              <Button
                label="Remover"
                onPress={() => void remove()}
                variant="ghost"
                icon={<Trash2 size={16} color={colors.danger} />}
              />
            </View>
          )}
        </Card>
      </View>
    </Modal>
  );
}
