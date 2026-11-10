import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  Dumbbell,
  Save,
  Plus,
  Check,
  Clock,
  Trash2,
  BookOpen,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  useCreateSession,
  useDeleteSession,
  useRoutines,
  useTodaySessions,
} from '@/hooks/useRoutines';
import { useExerciseGroups } from '@/hooks/useExercises';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { Button, Card, Input } from '@/components/ui';
import { colors } from '@/lib/theme';
import type {
  ExerciseGroup,
  WorkoutRoutine,
  WorkoutSession,
} from '@/types/database';
import { friendlyMessage } from '@/lib/friendlyError';

export default function WorkoutForm() {
  const router = useRouter();
  const kbHeight = useKeyboardHeight();

  const routinesQ = useRoutines();
  const groupsQ = useExerciseGroups();
  const sessionsQ = useTodaySessions();
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();

  const [selectedRoutine, setSelectedRoutine] = useState<WorkoutRoutine | null>(
    null,
  );
  const [durationHours, setDurationHours] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [notes, setNotes] = useState('');

  const totalDurationMin =
    (Number(durationHours) || 0) * 60 + (Number(durationMinutes) || 0);

  const routines = routinesQ.data ?? [];
  const groupsById = new Map<string, ExerciseGroup>(
    (groupsQ.data ?? []).map((g) => [g.id, g]),
  );
  const sessionsToday = sessionsQ.data ?? [];
  const sessionRoutineIds = new Set(
    sessionsToday.map((s) => s.routine_id).filter(Boolean) as string[],
  );

  async function handleAddSession() {
    if (!selectedRoutine) {
      Alert.alert('Escolha um treino', 'Selecione o treino que você fez hoje.');
      return;
    }
    try {
      await createSession.mutateAsync({
        routineId: selectedRoutine.id,
        routineName: selectedRoutine.name,
        durationMin: totalDurationMin > 0 ? totalDurationMin : null,
        notes: notes.trim() || null,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedRoutine(null);
      setDurationHours('');
      setDurationMinutes('');
      setNotes('');
    } catch (err) {
      Alert.alert(
        'Não consegui salvar',
        friendlyMessage(err),
      );
    }
  }

  async function handleRemove(session: WorkoutSession) {
    try {
      await deleteSession.mutateAsync(session.id);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      Alert.alert(
        'Não consegui remover',
        friendlyMessage(err),
      );
    }
  }

  if (routinesQ.isLoading) {
    return (
      <View className="flex-1 items-center justify-center py-10">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (routines.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 16,
          paddingBottom: 40 + (Platform.OS === 'android' ? kbHeight : 0),
        }}
      >
        <Card glow accent="green">
          <View className="flex-row items-center gap-2 mb-3">
            <BookOpen size={16} color={colors.accent} />
            <Text className="text-text-dim text-[11px] uppercase tracking-widest">
              Você ainda não tem treinos
            </Text>
          </View>
          <Text className="text-text text-base leading-relaxed">
            Antes de marcar treinos feitos, crie pelo menos um treino (ex:
            &quot;Peito A&quot;, &quot;Cardio 30min&quot;) com os exercícios
            que você faz. Depois basta marcar qual fez no dia.
          </Text>
        </Card>
        <Button
          label="Criar meu primeiro treino"
          onPress={() => router.push('/rotina/nova' as Href)}
          icon={<Plus size={18} color={colors.textInverse} />}
        />
      </ScrollView>
    );
  }

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
      {sessionsToday.length > 0 && (
        <Card padding="md">
          <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
            Feitos hoje
          </Text>
          <View className="gap-2">
            {sessionsToday.map((s) => (
              <View
                key={s.id}
                className="flex-row items-center gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-3 py-2.5"
              >
                <Check size={16} color={colors.accent} />
                <View className="flex-1">
                  <Text className="text-text text-sm font-semibold" numberOfLines={1}>
                    {s.routine_name}
                  </Text>
                  {s.duration_min != null && (
                    <Text className="text-text-muted text-[11px] mt-0.5">
                      {formatDuration(s.duration_min)}
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() => handleRemove(s)}
                  hitSlop={8}
                  className="h-8 w-8 rounded-lg bg-surface border border-border items-center justify-center active:opacity-70"
                >
                  <Trash2 size={13} color={colors.danger} />
                </Pressable>
              </View>
            ))}
          </View>
        </Card>
      )}

      <Card padding="md">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-text-dim text-[11px] uppercase tracking-widest">
            Qual treino você fez?
          </Text>
          <Pressable
            onPress={() => router.push('/rotina/nova' as Href)}
            hitSlop={8}
            className="flex-row items-center gap-1.5 rounded-full bg-surface-muted border border-border px-3 py-1 active:opacity-70"
          >
            <Plus size={11} color={colors.textDim} />
            <Text className="text-text-dim text-[11px] font-semibold">
              Nova
            </Text>
          </Pressable>
        </View>
        <View className="gap-2">
          {routines.map((r) => {
            const done = sessionRoutineIds.has(r.id);
            const active = selectedRoutine?.id === r.id;
            const group = r.group_id ? groupsById.get(r.group_id) : null;
            return (
              <Pressable
                key={r.id}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setSelectedRoutine(active ? null : r);
                }}
                disabled={done}
                className={`flex-row items-center gap-3 rounded-2xl border px-3 py-2.5 ${
                  done
                    ? 'border-accent/30 bg-accent/5 opacity-60'
                    : active
                      ? 'border-accent bg-accent/10'
                      : 'border-border bg-surface-muted active:opacity-70'
                }`}
              >
                <Text className="text-lg">{group?.icon ?? '💪'}</Text>
                <View className="flex-1">
                  <Text className="text-text text-sm font-semibold" numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text className="text-text-muted text-[10px] mt-0.5">
                    {group?.name ?? 'Livre'}
                    {done ? ' · já marcado' : ''}
                  </Text>
                </View>
                {active && !done && <Check size={16} color={colors.accent} />}
                {done && <Check size={16} color={colors.accent} />}
              </Pressable>
            );
          })}
        </View>
      </Card>

      {selectedRoutine && (
        <Card glow accent="green">
          <View className="flex-row items-center gap-2 mb-3">
            <Dumbbell size={14} color={colors.accent} />
            <Text className="text-text-dim text-[11px] uppercase tracking-widest">
              Detalhes (opcional)
            </Text>
          </View>
          <View className="gap-3">
            <View>
              <View className="flex-row items-center gap-2 mb-2">
                <Clock size={14} color={colors.textMuted} />
                <Text className="text-text-dim text-xs uppercase tracking-widest">
                  Duração
                </Text>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Input
                    value={durationHours}
                    onChangeText={(v) =>
                      setDurationHours(v.replace(/\D/g, '').slice(0, 2))
                    }
                    placeholder="0"
                    keyboardType="number-pad"
                    hint="Horas"
                  />
                </View>
                <View className="flex-1">
                  <Input
                    value={durationMinutes}
                    onChangeText={(v) =>
                      setDurationMinutes(v.replace(/\D/g, '').slice(0, 3))
                    }
                    placeholder="45"
                    keyboardType="number-pad"
                    hint="Minutos"
                  />
                </View>
              </View>
            </View>
            <Input
              label="Notas"
              value={notes}
              onChangeText={setNotes}
              placeholder="Como foi o treino hoje?"
              multiline
            />
          </View>
        </Card>
      )}

      <Button
        label={selectedRoutine ? `Marcar "${selectedRoutine.name}"` : 'Escolha um treino'}
        onPress={handleAddSession}
        disabled={!selectedRoutine}
        loading={createSession.isPending}
        icon={<Save size={18} color={colors.textInverse} />}
      />
    </ScrollView>
  );
}

function formatDuration(totalMin: number): string {
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}
