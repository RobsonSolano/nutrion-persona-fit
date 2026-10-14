import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Crown, Sparkles, RefreshCw, ExternalLink } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useAlert } from '@/components/GlobalAlertProvider';
import { openPaywall } from '@/lib/paywall';
import { restore, isBillingAvailable } from '@/services/billing';
import { syncMyCoachAccess } from '@/services/suspension';
import { queryKeys } from '@/lib/queryKeys';
import { Button, Card } from '@/components/ui';
import { colors } from '@/lib/theme';
import { PLAY_SUBSCRIPTIONS_URL } from '@/lib/playStore';


const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  premium: 'Premium',
};

/**
 * "Minha assinatura" — entrada proativa de plano no Perfil (comum + professor).
 * Upgrade = compra no app (paywall). Downgrade/cancelar = gerenciado pela Play
 * (deep-link), pois assinatura do Google Play não se cancela dentro do app.
 */
export default function SubscriptionCard() {
  const { user } = useAuth();
  const role = useProfile().data?.role;
  const ent = useEntitlement().data;
  const qc = useQueryClient();
  const alert = useAlert();
  const [restoring, setRestoring] = useState(false);

  const tier = ent?.tier ?? 'free';
  const isTrial = ent?.source === 'server_trial' && !!ent?.trial_end;
  const isStudent = role === 'aluno';
  const isProfessor = role === 'professor';
  const hasStoreSub =
    ent?.source === 'store_play' ||
    ent?.source === 'store_apple' ||
    ent?.source === 'stripe';

  // Comum só chega a Pro; professor vai até Premium.
  const canUpgrade = isProfessor ? tier !== 'premium' : tier === 'free';

  // Aluno herda o acesso do professor — não contrata plano.
  if (isStudent) return null;

  function upgradeFeature(): string {
    if (isProfessor) return tier === 'pro' ? 'student_limit' : 'coach_generate_plan';
    return 'chat';
  }

  async function handleRestore() {
    if (!isBillingAvailable) {
      alert.showAlert({
        title: 'Indisponível aqui',
        message: 'Restaurar compras só funciona no app instalado pela loja.',
        type: 'info',
      });
      return;
    }
    setRestoring(true);
    try {
      await restore();
      if (user?.id) {
        // Professor: reativa alunos suspensos se o restore recuperar um plano
        // maior. No-op p/ não-professor. Depois invalida entitlement + lista.
        try {
          await syncMyCoachAccess(user.id);
        } catch {
          // best-effort: o webhook também reconcilia
        }
        await qc.invalidateQueries({ queryKey: queryKeys.entitlement(user.id) });
        await qc.invalidateQueries({ queryKey: ['students', user.id] });
      }
      alert.showAlert({
        title: 'Compras restauradas',
        message: 'Se houver assinatura ativa, seu acesso é atualizado em instantes.',
        type: 'success',
      });
    } catch (err) {
      alert.showError(err);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Card padding="md">
      <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
        Minha assinatura
      </Text>

      <View className="flex-row items-center gap-2 mb-1">
        {tier === 'premium' ? (
          <Crown size={16} color={colors.accent} />
        ) : (
          <Sparkles size={16} color={tier === 'pro' ? colors.accent : colors.textMuted} />
        )}
        <Text className="text-text text-base font-bold">
          Plano {TIER_LABEL[tier] ?? 'Free'}
        </Text>
        {isTrial && (
          <View className="rounded-full bg-violet/15 border border-violet/40 px-2 py-0.5">
            <Text className="text-violet-soft text-[10px] font-semibold">teste grátis</Text>
          </View>
        )}
      </View>

      {isProfessor && (
        <Text className="text-text-dim text-xs mb-3">
          {ent?.student_limit == null
            ? 'Alunos ilimitados.'
            : `Até ${ent.student_limit} aluno(s).`}
        </Text>
      )}

      <View className="gap-2 mt-1">
        {canUpgrade && (
          <Button
            label="Fazer upgrade"
            onPress={() => openPaywall(upgradeFeature())}
            variant="primary"
            size="md"
            icon={<Crown size={14} color={colors.bg} />}
          />
        )}

        {hasStoreSub && (
          <Button
            label="Gerenciar assinatura"
            onPress={() => Linking.openURL(PLAY_SUBSCRIPTIONS_URL)}
            variant="secondary"
            size="md"
            icon={<ExternalLink size={14} color={colors.text} />}
          />
        )}

        <Button
          label="Restaurar compras"
          onPress={handleRestore}
          variant="ghost"
          size="md"
          loading={restoring}
          icon={<RefreshCw size={14} color={colors.textDim} />}
        />
      </View>

      {canUpgrade && (
        <Text className="text-text-muted text-[11px] mt-3 leading-relaxed">
          Cancelamento e troca de plano são feitos na Google Play.
        </Text>
      )}
    </Card>
  );
}
