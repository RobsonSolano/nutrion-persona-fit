import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Lock, Star } from 'lucide-react-native';
import { Card, Screen } from '@/components/ui';
import StarRating from '@/components/coach/StarRating';
import { colors } from '@/lib/theme';
import { useMyCoachRatings } from '@/hooks/useEnrollment';

/**
 * [AVAL]-08: as avaliações que o professor recebeu. A média e o total são
 * públicos; os comentários, só ele vê ([AVAL]-06).
 */
export default function AvaliacoesScreen() {
  const router = useRouter();
  const q = useMyCoachRatings();
  const rows = q.data ?? [];
  const media = rows.length ? rows.reduce((s, r) => s + r.stars, 0) / rows.length : 0;

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Screen variant="hero" edges={['top', 'bottom']}>
        <View className="flex-row items-center px-5 py-3 border-b border-border-subtle">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <ArrowLeft size={18} color={colors.textDim} />
          </Pressable>
          <Text className="text-text font-semibold ml-3">Avaliações</Text>
        </View>

        {q.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={q.isRefetching}
                onRefresh={() => void q.refetch()}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
          >
            <Card padding="md">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-text text-3xl font-bold">
                    {rows.length ? media.toFixed(1) : '—'}
                  </Text>
                  <Text className="text-text-muted text-[11px] mt-1">
                    {rows.length === 1 ? '1 avaliação' : `${rows.length} avaliações`}
                  </Text>
                </View>
                <StarRating value={media} size={20} />
              </View>
              <View className="flex-row items-center gap-1.5 mt-3">
                <Lock size={11} color={colors.textMuted} />
                <Text className="text-text-muted text-[11px] flex-1">
                  A média aparece no seu perfil público. Os comentários só você vê.
                </Text>
              </View>
            </Card>

            {rows.length === 0 ? (
              <View className="items-center px-8 pt-12">
                <View className="h-16 w-16 rounded-3xl bg-surface-raised border border-border items-center justify-center mb-4">
                  <Star size={26} color={colors.textMuted} />
                </View>
                <Text className="text-text font-semibold text-center">Nenhuma avaliação ainda</Text>
                <Text className="text-text-muted text-xs text-center mt-2 leading-relaxed">
                  Seus alunos avaliam pelo app, de 1 a 5 estrelas, com um comentário opcional.
                </Text>
              </View>
            ) : (
              rows.map((r, i) => (
                <Card key={`${r.rated_at}-${i}`} padding="md">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-text text-sm font-semibold flex-1" numberOfLines={1}>
                      {r.student_name ?? 'Aluno'}
                    </Text>
                    <StarRating value={r.stars} size={13} />
                  </View>
                  <Text
                    className={`text-xs mt-2 leading-relaxed ${
                      r.comment ? 'text-text-dim' : 'text-text-muted italic'
                    }`}
                  >
                    {r.comment ?? 'Sem comentário.'}
                  </Text>
                  <Text className="text-text-muted text-[11px] mt-2">
                    {new Date(r.rated_at).toLocaleDateString('pt-BR')}
                  </Text>
                </Card>
              ))
            )}
          </ScrollView>
        )}
      </Screen>
    </>
  );
}
