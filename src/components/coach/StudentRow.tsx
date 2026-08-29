import { Pressable, Text, View } from 'react-native';
import { ChevronRight, Target } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import type { StudentLite } from '@/services/students';
import type { StudentTracking } from '@/services/studentTracking';

const GOAL_LABEL: Record<string, string> = {
  lose_fat: 'Emagrecer',
  maintain: 'Manter',
  gain_muscle: 'Ganhar massa',
  reduce_body_fat: 'Reduzir gordura',
};

/** Linha de aluno da lista do professor. Extraída da home ao virar aba. */
export default function StudentRow({
  student,
  tracking,
  onPress,
}: {
  student: StudentLite;
  tracking: StudentTracking | undefined;
  onPress: () => void;
}) {
  const initial = (student.full_name ?? '?').slice(0, 1).toUpperCase();
  const goalLabel = student.goal_type ? GOAL_LABEL[student.goal_type] : null;
  const adherence = tracking?.adherenceLast7;
  const suspended = student.suspended_at != null;

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-2xl border border-border bg-surface-muted px-3 py-3 active:opacity-70 ${suspended ? 'opacity-60' : ''}`}
    >
      <View className="h-10 w-10 rounded-xl bg-violet/15 border border-violet/40 items-center justify-center">
        <Text className="text-violet-soft text-base font-bold">{initial}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-text text-sm font-semibold" numberOfLines={1}>
          {student.full_name ?? 'Sem nome'}
        </Text>
        <View className="flex-row items-center gap-2 mt-0.5">
          {goalLabel && (
            <View className="flex-row items-center gap-1">
              <Target size={10} color={colors.textMuted} />
              <Text className="text-text-muted text-[11px]">{goalLabel}</Text>
            </View>
          )}
          {student.weight_kg != null && (
            <Text className="text-text-muted text-[11px]">
              {student.weight_kg}kg
            </Text>
          )}
          {suspended && (
            <View className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5">
              <Text className="text-warn text-[10px] font-bold">suspenso</Text>
            </View>
          )}
        </View>
      </View>
      {adherence != null && <AdherenceBadge percent={adherence} />}
      <ChevronRight size={16} color={colors.textDim} />
    </Pressable>
  );
}

function AdherenceBadge({ percent }: { percent: number }) {
  const tone = adherenceTone(percent);
  return (
    <View
      className="rounded-full border px-2 py-0.5"
      style={{ borderColor: `${tone}55`, backgroundColor: `${tone}15` }}
    >
      <Text className="text-[10px] font-bold" style={{ color: tone }}>
        {percent}%
      </Text>
    </View>
  );
}

function adherenceTone(percent: number): string {
  if (percent >= 70) return colors.accent;
  if (percent >= 40) return colors.warn;
  return colors.danger;
}
