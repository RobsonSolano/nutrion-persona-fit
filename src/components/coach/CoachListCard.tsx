import { Pressable, Text, View } from 'react-native';
import { MapPin, Monitor, Users } from 'lucide-react-native';
import { Avatar, Card } from '@/components/ui';
import { colors } from '@/lib/theme';
import {
  especialidadeLabel,
  SERVICE_MODE_LABELS,
  type ServiceMode,
} from '@/lib/especialidades';
import StarRating from './StarRating';
import type { CoachSearchResult } from '@/services/enrollment';

const MODE_ICON = {
  online: Monitor,
  presencial: MapPin,
  hibrido: Users,
} as const;

export default function CoachListCard({
  coach,
  onPress,
}: {
  coach: CoachSearchResult;
  onPress: () => void;
}) {
  const Icon = coach.service_mode ? MODE_ICON[coach.service_mode] : MapPin;
  // 3 chips cobrem o card sem quebrar linha em tela pequena; o resto vira "+N".
  const visiveis = coach.specialties.slice(0, 3);
  const resto = coach.specialties.length - visiveis.length;

  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <Card padding="md">
        <View className="flex-row gap-3">
          <Avatar url={coach.avatar_url} name={coach.full_name} size={52} />

          <View className="flex-1">
            <Text className="text-text font-semibold text-base" numberOfLines={1}>
              {coach.full_name ?? 'Professor'}
            </Text>

            <View className="flex-row items-center gap-1.5 mt-1">
              <Icon size={12} color={colors.textMuted} />
              <Text className="text-text-dim text-xs" numberOfLines={1}>
                {coach.city ? `${coach.city}/${coach.state_uf}` : coach.state_uf}
                {coach.service_mode
                  ? ` · ${SERVICE_MODE_LABELS[coach.service_mode as ServiceMode]}`
                  : ''}
              </Text>
            </View>

            <View className="mt-2">
              <StarRating value={coach.rating_avg} count={coach.rating_count} size={13} />
            </View>
          </View>
        </View>

        {visiveis.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 mt-3">
            {visiveis.map((s) => (
              <View
                key={s}
                className="px-2.5 py-1 rounded-full bg-accent/10 border border-accent/25"
              >
                <Text className="text-accent-soft text-[11px] font-semibold">
                  {especialidadeLabel(s)}
                </Text>
              </View>
            ))}
            {resto > 0 && (
              <View className="px-2.5 py-1 rounded-full bg-surface-raised border border-border">
                <Text className="text-text-dim text-[11px] font-semibold">+{resto}</Text>
              </View>
            )}
          </View>
        )}

        {coach.bio ? (
          <Text className="text-text-muted text-xs mt-3 leading-relaxed" numberOfLines={2}>
            {coach.bio}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}
