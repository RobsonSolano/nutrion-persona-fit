import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Bell, Check } from 'lucide-react-native';
import { Card, Screen } from '@/components/ui';
import {
  useSetPushEnabled,
  usePushPreferences,
} from '@/hooks/usePushPreferences';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { colors } from '@/lib/theme';
import type { PushType } from '@/types/database';
import { friendlyMessage } from '@/lib/friendlyError';

type PushTypeMeta = {
  type: PushType;
  label: string;
  description: string;
  audience: 'aluno' | 'coach' | 'todos';
};

const ITEMS: PushTypeMeta[] = [
  {
    type: 'inactivity_reminder',
    label: 'Lembretes de inatividade',
    description: 'Quando você fica alguns dias sem registrar nada.',
    audience: 'todos',
  },
  {
    type: 'streak_celebration',
    label: 'Marcos de constância',
    description: 'Parabéns por sequências (3, 7, 14, 30, 60, 100 dias).',
    audience: 'todos',
  },
  {
    type: 'daily_workout_reminder',
    label: 'Lembrete do treino do dia',
    description: 'Toque pela manhã com o treino programado.',
    audience: 'aluno',
  },
  {
    type: 'water_reminder',
    label: 'Lembrete de água',
    description: 'Aviso no fim do dia se a meta de água ainda está longe.',
    audience: 'todos',
  },
  {
    type: 'protein_reminder',
    label: 'Lembrete de proteína',
    description: 'Aviso no fim do dia se a meta de proteína ainda está longe.',
    audience: 'todos',
  },
  {
    type: 'daily_workout_check',
    label: 'Cobrança de treino',
    description:
      'À noite, em dias que você costuma treinar, lembra se ainda não treinou.',
    audience: 'todos',
  },
  {
    type: 'streak_warning',
    label: 'Aviso de sequência',
    description:
      'Se você está em uma sequência e ainda não registrou hoje, recebe um lembrete à noite.',
    audience: 'todos',
  },
  {
    type: 'weekly_summary',
    label: 'Resumo semanal',
    description: 'Domingo à noite, com balanço da semana.',
    audience: 'todos',
  },
  {
    type: 'coach_plan_update',
    label: 'Atualização de plano pelo coach',
    description: 'Quando seu professor atualiza seu treino ou dieta.',
    audience: 'aluno',
  },
  {
    type: 'goal_achieved',
    label: 'Meta atingida',
    description: 'Quando você bate um marco do seu objetivo.',
    audience: 'todos',
  },
  {
    type: 'coach_adherence_alert',
    label: 'Alerta de aluno sumido',
    description: 'Avisa quando um aluno seu para de registrar.',
    audience: 'coach',
  },
];

export default function NotificacoesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const profileQ = useProfile();
  const role = profileQ.data?.role ?? null;
  const prefs = usePushPreferences(userId);
  const setM = useSetPushEnabled(userId);

  const visibleItems = ITEMS.filter((it) => {
    if (it.audience === 'todos') return true;
    if (it.audience === 'aluno') return role === 'aluno' || role === 'comum';
    if (it.audience === 'coach') return role === 'professor';
    return true;
  });

  async function toggle(type: PushType, current: boolean) {
    try {
      await setM.mutateAsync({ type, enabled: !current });
    } catch (err) {
      Alert.alert(
        'Não consegui salvar',
        friendlyMessage(err),
      );
    }
  }

  return (
    <>
      <Stack.Screen
        options={{ headerShown: false, animation: 'slide_from_right' }}
      />
      <Screen variant="hero" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-border-subtle">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <ArrowLeft size={18} color={colors.textDim} />
          </Pressable>
          <Text className="text-text font-semibold">Notificações</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: 20,
            gap: 12,
            paddingBottom: 60,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Card padding="md">
            <View className="flex-row items-center gap-2 mb-2">
              <Bell size={14} color={colors.accent} />
              <Text className="text-text-dim text-[11px] uppercase tracking-widest">
                Suas preferências
              </Text>
            </View>
            <Text className="text-text-muted text-xs leading-relaxed">
              Escolha quais avisos você quer receber. A gente nunca envia
              entre 22h e 7h, exceto avisos críticos do seu coach.
            </Text>
          </Card>

          {visibleItems.map((item) => {
            const enabled = prefs.isEnabled(item.type);
            return (
              <Pressable
                key={item.type}
                onPress={() => toggle(item.type, enabled)}
                disabled={setM.isPending}
                className={`rounded-2xl border p-4 ${
                  enabled
                    ? 'bg-surface border-border'
                    : 'bg-surface-muted border-border'
                } active:opacity-80`}
              >
                <View className="flex-row items-center justify-between">
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text className="text-text font-semibold">
                      {item.label}
                    </Text>
                    <Text className="text-text-muted text-xs mt-1 leading-relaxed">
                      {item.description}
                    </Text>
                  </View>
                  <Toggle enabled={enabled} />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </Screen>
    </>
  );
}

function Toggle({ enabled }: { enabled: boolean }) {
  return (
    <View
      className={`rounded-full border ${
        enabled
          ? 'bg-accent border-accent'
          : 'bg-surface-muted border-border-strong'
      }`}
      style={{ width: 44, height: 26, padding: 2, justifyContent: 'center' }}
    >
      <View
        className={`rounded-full ${
          enabled ? 'bg-bg-deep self-end' : 'bg-text-muted self-start'
        }`}
        style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}
      >
        {enabled ? <Check size={12} color={colors.accent} /> : null}
      </View>
    </View>
  );
}
