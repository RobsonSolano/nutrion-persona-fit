import { Pressable, Text, View } from 'react-native';
import { Crown, Sparkles, ArrowUpRight } from 'lucide-react-native';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useStudents } from '@/hooks/useStudents';
import { openPaywall } from '@/lib/paywall';
import { colors } from '@/lib/theme';
import { TIER_LABEL, tierAtLeast } from '@/lib/tier';

/**
 * Badge de plano na home do professor: mostra o tier atual + uso de alunos
 * (X/limite) e, quando há plano acima, um atalho de upgrade (abre o paywall).
 * Premium e Elite ganham coroa.
 */
export default function CoachPlanBadge() {
  const ent = useEntitlement().data;
  const count = useStudents().data?.length ?? 0;

  const tier = ent?.tier ?? 'free';
  const limit = ent?.student_limit; // null = servidor antigo: sem contador
  const isPremium = tierAtLeast(tier, 'premium');
  // Professor compra até Elite; no Elite não há plano acima.
  const canUpgrade = !tierAtLeast(tier, 'elite');
  const atLimit = limit != null && count >= limit;

  const upgradeFeature = tierAtLeast(tier, 'pro') ? 'student_limit' : 'coach_generate_plan';

  const accent = isPremium ? colors.accent : colors.violetSoft;

  return (
    <View
      className="flex-row items-center justify-between rounded-2xl border px-4 py-3"
      style={{
        borderColor: `${accent}55`,
        backgroundColor: `${accent}12`,
      }}
    >
      <View className="flex-row items-center gap-2.5 flex-1">
        {isPremium ? (
          <Crown size={18} color={colors.accent} />
        ) : (
          <Sparkles size={18} color={accent} />
        )}
        <View className="flex-1">
          <Text className="text-text text-sm font-bold">
            Plano {TIER_LABEL[tier]}
          </Text>
          {limit != null && (
            <Text
              className="text-[12px] mt-0.5"
              style={{ color: atLimit ? colors.warn : colors.textDim }}
            >
              {`${count}/${limit} aluno${limit === 1 ? '' : 's'}${atLimit ? ' · limite atingido' : ''}`}
            </Text>
          )}
        </View>
      </View>

      {canUpgrade && (
        <Pressable
          onPress={() => openPaywall(upgradeFeature)}
          hitSlop={6}
          className="flex-row items-center gap-1 rounded-full border px-3 py-1.5 active:opacity-70"
          style={{ borderColor: `${colors.accent}66`, backgroundColor: `${colors.accent}18` }}
        >
          <Text className="text-accent text-[12px] font-bold">Fazer upgrade</Text>
          <ArrowUpRight size={13} color={colors.accent} />
        </Pressable>
      )}
    </View>
  );
}
