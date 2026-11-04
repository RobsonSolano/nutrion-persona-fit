import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, Pressable } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Check, Crown, X } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';

import Screen from '@/components/ui/Screen';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { colors } from '@/lib/theme';
import { paywallContent, planContent } from '@/lib/paywallContent';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useOfferings } from '@/hooks/useOfferings';
import { useAlert } from '@/components/GlobalAlertProvider';
import {
  availablePlans,
  findPackage,
  selectProductId,
  type Plan,
  type Role,
} from '@/lib/purchaseSelection';
import {
  purchasePackage,
  restore,
  getActiveProductId,
  isUserCancelledError,
  isBillingAvailable,
} from '@/services/billing';
import { pollUntil } from '@/lib/pollUntil';
import { fetchEntitlement } from '@/services/entitlement';
import { syncMyCoachAccess } from '@/services/suspension';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Paywall contextual (#2/#5b). Header vem do feature do 402; o corpo mostra os
 * planos compráveis do usuário (availablePlans): a escada acima do tier atual
 * (professor: Pro/Premium/Elite; comum: Pro/Premium). Preço real do RevenueCat. Upgrade com
 * assinatura de loja ativa usa troca de plano com proração (billing.purchasePackage com
 * oldProductId). Aluno não compra.
 */
export default function PaywallScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { feature, origin } = useLocalSearchParams<{ feature?: string; origin?: string }>();
  const { data: profile } = useProfile();
  const { user } = useAuth();
  const { data: entitlement } = useEntitlement();
  const { data: offerings } = useOfferings();
  const alert = useAlert();

  // productId em compra (ou 'restore'); null = ocioso.
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const busy = busyPlan !== null;

  const header = paywallContent(feature, origin === 'upgrade' ? 'upgrade' : undefined);
  const role = profile?.role as Role | undefined;
  const currentTier = entitlement?.tier ?? 'free';
  const isAluno = role === 'aluno';
  const plans = availablePlans({ role, currentTier });
  const recommendedId = selectProductId({
    role,
    feature,
    currentTier,
  });
  // Professor no Elite que estourou o limite: o Elite é o maior plano → atalho pro suporte.
  const isTopPlanLimit =
    role === 'professor' && currentTier === 'elite' && feature === 'student_limit';
  const dataReady = profile !== undefined && entitlement !== undefined;

  /** Re-busca o entitlement até refletir a compra + reconcilia acesso dos alunos. */
  async function refreshEntitlement(targetTier?: 'pro' | 'premium' | 'elite'): Promise<boolean> {
    const { satisfied } = await pollUntil({
      fn: fetchEntitlement,
      done: (e) => (targetTier ? e.tier === targetTier : e.tier !== 'free'),
    });
    if (user?.id) {
      try {
        await syncMyCoachAccess(user.id);
      } catch {
        // best-effort: o webhook também reconcilia
      }
      await qc.invalidateQueries({ queryKey: queryKeys.entitlement(user.id) });
      await qc.invalidateQueries({ queryKey: ['students', user.id] });
    }
    return satisfied;
  }

  async function handleSubscribe(plan: Plan) {
    if (!isBillingAvailable) {
      alert.showAlert({
        type: 'info',
        title: 'Indisponível agora',
        message: 'A assinatura fica disponível no app instalado da loja. Em breve por aqui.',
      });
      return;
    }
    const pkg = findPackage(offerings, plan.productId);
    if (!pkg) {
      alert.showAlert({
        type: 'warning',
        title: 'Planos indisponíveis',
        message: 'Não consegui carregar os planos agora. Tente de novo em instantes.',
      });
      return;
    }
    setBusyPlan(plan.productId);
    try {
      // Troca de plano (ex.: premium → elite): só quando há assinatura de loja ativa. Sem ela
      // (trial do servidor, parceria, pago por fora) é compra normal.
      const hasStoreSub = entitlement?.store_active === true;
      const oldProductId = hasStoreSub ? await getActiveProductId().catch(() => null) : null;
      // Falha fechado: se há assinatura de loja mas não confirmamos o produto atual, NÃO compra
      // (evitaria substituir e criaria uma 2ª assinatura = cobrança dupla).
      if (hasStoreSub && !oldProductId) {
        alert.showAlert({
          type: 'warning',
          title: 'Não consegui confirmar seu plano atual',
          message: 'Tenta de novo em instantes.',
        });
        return;
      }
      await purchasePackage(pkg, { oldProductId });
      const liberado = await refreshEntitlement(plan.tier);
      alert.showAlert(
        liberado
          ? {
              type: 'success',
              title: 'Assinatura ativa!',
              message: 'Seus recursos foram liberados. Aproveite 💪',
            }
          : {
              type: 'info',
              title: 'Compra recebida',
              message:
                'Estamos liberando seu acesso — pode levar alguns instantes. Se demorar, toque em "Restaurar compras".',
            },
      );
      router.back();
    } catch (err) {
      if (isUserCancelledError(err)) return;
      alert.showError(err);
    } finally {
      setBusyPlan(null);
    }
  }

  async function handleRestore() {
    if (!isBillingAvailable) return;
    setBusyPlan('restore');
    try {
      await restore();
      const liberado = await refreshEntitlement();
      if (liberado) {
        alert.showAlert({
          type: 'success',
          title: 'Assinatura restaurada!',
          message: 'Seus recursos foram liberados novamente.',
        });
        router.back();
      } else {
        alert.showAlert({
          type: 'info',
          title: 'Nada pra restaurar',
          message: 'Não encontramos uma assinatura ativa nesta conta.',
        });
      }
    } catch (err) {
      if (isUserCancelledError(err)) return;
      alert.showError(err);
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Screen variant="violet" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-5 py-3">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <X size={18} color={colors.textDim} />
          </Pressable>
          <Text className="text-text font-semibold">Persona Fit Pro</Text>
          <View className="w-10" />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 20 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="items-center gap-3 pt-2">
            <View className="h-16 w-16 rounded-3xl bg-violet/20 border border-violet items-center justify-center">
              <Crown size={30} color={colors.violetSoft} />
            </View>
            <Text className="text-text text-2xl font-bold text-center">{header.title}</Text>
            <Text className="text-text-dim text-base text-center">{header.subtitle}</Text>
          </View>

          {!dataReady ? (
            <View className="items-center py-10">
              <ActivityIndicator color={colors.violetSoft} />
            </View>
          ) : isAluno ? (
            <Card padding="lg">
              <Text className="text-text text-base font-semibold mb-1">
                Acesso pelo seu professor
              </Text>
              <Text className="text-text-dim text-[15px] leading-5">
                Seu acesso à IA depende do plano do seu professor. Fale com ele(a) pra liberar
                esses recursos no seu acompanhamento.
              </Text>
            </Card>
          ) : plans.length === 0 && isTopPlanLimit ? (
            <Card padding="lg">
              <Text className="text-text text-base font-semibold mb-1">
                O Elite é o maior plano
              </Text>
              <Text className="text-text-dim text-[15px] leading-5 mb-4">
                Você está no Elite, com até 50 alunos. Precisa de mais? Fale com o suporte.
              </Text>
              <Button
                label="Falar com o suporte"
                variant="primary"
                size="lg"
                fullWidth
                onPress={() => router.push('/suporte/nova' as Href)}
              />
            </Card>
          ) : plans.length === 0 ? (
            <Card padding="lg">
              <Text className="text-text text-base font-semibold mb-1">Tudo certo!</Text>
              <Text className="text-text-dim text-[15px] leading-5">
                Seu plano atual já é o mais completo. Aproveite 💪
              </Text>
            </Card>
          ) : (
            <View className="gap-4">
              {plans.map((plan) => {
                const c = planContent(plan.tier, role as Role);
                const pkg = findPackage(offerings, plan.productId);
                const highlight = plan.productId === recommendedId;
                const price = pkg?.product.priceString ?? null;
                return (
                  <Card
                    key={plan.productId}
                    accent={highlight ? 'violet' : undefined}
                    glow={highlight}
                    padding="lg"
                  >
                    <View className="flex-row items-center justify-between mb-3">
                      <Text className="text-text text-lg font-bold">{c.name}</Text>
                      {highlight && (
                        <View className="rounded-full border border-violet/50 bg-violet/15 px-2.5 py-0.5">
                          <Text className="text-violet-soft text-[11px] font-bold">Recomendado</Text>
                        </View>
                      )}
                    </View>
                    <View className="gap-2.5 mb-4">
                      {c.bullets.map((b) => (
                        <View key={b} className="flex-row items-start gap-3">
                          <View className="mt-0.5 h-5 w-5 rounded-full bg-violet/20 items-center justify-center">
                            <Check size={13} color={colors.violetSoft} />
                          </View>
                          <Text className="text-text flex-1 text-[15px] leading-5">{b}</Text>
                        </View>
                      ))}
                    </View>
                    {price && (
                      <Text className="text-text-dim text-sm mb-3">
                        {price}
                        <Text className="text-text-muted"> / mês</Text>
                      </Text>
                    )}
                    <Button
                      label={`Assinar ${c.name}`}
                      variant={highlight ? 'primary' : 'secondary'}
                      size="lg"
                      fullWidth
                      loading={busyPlan === plan.productId}
                      disabled={busy || !pkg}
                      onPress={() => handleSubscribe(plan)}
                    />
                  </Card>
                );
              })}

              <Button
                label="Já assinei · Restaurar compras"
                variant="ghost"
                size="md"
                fullWidth
                disabled={busy}
                onPress={handleRestore}
              />
              <Button
                label="Agora não"
                variant="ghost"
                size="md"
                fullWidth
                disabled={busy}
                onPress={() => router.back()}
              />
            </View>
          )}
        </ScrollView>
      </Screen>
    </>
  );
}
