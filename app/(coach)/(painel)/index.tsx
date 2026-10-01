import { ScrollView, Text, View, Pressable } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  GraduationCap,
  Users,
  ChevronRight,
  MessagesSquare,
  BookOpen,
  UserPlus,
  Plus,
} from 'lucide-react-native';
import { Card, Screen } from '@/components/ui';
import { colors } from '@/lib/theme';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useStudents } from '@/hooks/useStudents';
import CoachPlanBadge from '@/components/CoachPlanBadge';
import { useDowngradeStatus } from '@/hooks/useDowngradeStatus';
import { useCoachRequests } from '@/hooks/useRequests';
import { useCoachAccessSync } from '@/hooks/useCoachAccessSync';
import { getMyCoach } from '@/services/coach';
import { suspendedCount } from '@/lib/suspension';

export default function CoachHome() {
  const router = useRouter();
  const { user } = useAuth();
  const profileQ = useProfile();
  const downgrade = useDowngradeStatus();
  useCoachAccessSync();
  const studentsQ = useStudents();
  const openRequestsQ = useCoachRequests('open');
  const coachQ = useQuery({
    queryKey: ['my-coach', user?.id ?? 'anon'],
    queryFn: getMyCoach,
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const fullName = profileQ.data?.full_name ?? 'Professor';
  const email = profileQ.data?.email ?? null;
  const cref = coachQ.data?.cref ?? null;
  const openRequestsCount = openRequestsQ.data?.length ?? 0;

  const alunos = studentsQ.data ?? [];
  const suspended = suspendedCount(alunos);
  const ativos = alunos.length - suspended;

  return (
    <Screen variant="hero" edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 140,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-3">
          <View className="h-12 w-12 rounded-2xl bg-violet/10 border border-violet/30 items-center justify-center">
            <GraduationCap size={22} color={colors.violetSoft} />
          </View>
          <View className="flex-1">
            <Text className="text-text-dim text-[11px] uppercase tracking-widest">
              Olá, professor
            </Text>
            <Text className="text-text text-xl font-bold" numberOfLines={1}>
              {fullName}
            </Text>
            {email ? (
              <Text className="text-text-muted text-[11px] mt-0.5" numberOfLines={1}>
                {email}
              </Text>
            ) : null}
            {cref && (
              <View className="self-start mt-1.5 rounded-full border border-violet/40 bg-violet/10 px-2.5 py-0.5">
                <Text className="text-violet-soft text-[11px] font-semibold">
                  {cref}
                </Text>
              </View>
            )}
          </View>
        </View>

        <CoachPlanBadge />

        {/* Números do dia. Alunos e solicitações são o que o professor
            precisa saber sem abrir nada. */}
        <View className="flex-row gap-3">
          <StatTile
            label="Alunos"
            value={String(alunos.length)}
            hint={suspended > 0 ? `${ativos} ativos · ${suspended} susp.` : 'ativos'}
            icon={<Users size={16} color={colors.violetSoft} />}
            onPress={() => router.push('/(coach)/alunos' as Href)}
          />
          <StatTile
            label="Pedidos"
            value={String(openRequestsCount)}
            hint={openRequestsCount > 0 ? 'aguardando você' : 'nenhum aberto'}
            icon={<UserPlus size={16} color={colors.accent} />}
            highlight={openRequestsCount > 0}
            onPress={() => router.push('/(coach)/solicitacoes' as Href)}
          />
        </View>

        {suspended > 0 && (
          <Pressable
            onPress={() => router.push('/(coach)/escolher-alunos' as Href)}
            className="rounded-2xl border border-warn/50 bg-warn/10 px-4 py-3 active:opacity-80"
          >
            <Text className="text-warn text-[13px] font-semibold mb-1">
              ⚠️ {suspended} de {alunos.length} alunos com acesso suspenso
            </Text>
            <Text className="text-text-dim text-[12px] leading-relaxed">
              Seu plano permite {downgrade.studentLimit} ativos. Escolha quem fica
              ativo ou faça upgrade pra liberar todos. Toque pra resolver.
            </Text>
          </Pressable>
        )}

        <NavCard
          icon={<MessagesSquare size={20} color={colors.violetSoft} />}
          title="Pedidos dos alunos"
          subtitle={
            openRequestsCount > 0
              ? `${openRequestsCount} aberto${openRequestsCount > 1 ? 's' : ''} aguardando você`
              : 'Nenhum pedido aberto'
          }
          badge={openRequestsCount}
          onPress={() => router.push('/(coach)/solicitacoes' as Href)}
        />

        <NavCard
          icon={<BookOpen size={20} color={colors.violetSoft} />}
          title="Biblioteca de treinos"
          subtitle="Templates pra reaplicar em vários alunos"
          onPress={() => router.push('/(coach)/templates' as Href)}
        />

        <NavCard
          icon={<Plus size={20} color={colors.accent} />}
          title="Cadastrar aluno"
          subtitle="Criar a conta do aluno com a ficha já preenchida"
          onPress={() => router.push('/(coach)/aluno-novo' as Href)}
        />
      </ScrollView>
    </Screen>
  );
}

function StatTile({
  label,
  value,
  hint,
  icon,
  onPress,
  highlight = false,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <Pressable onPress={onPress} className="flex-1 active:opacity-80">
      <View
        className={`rounded-3xl border p-4 ${
          highlight ? 'bg-accent/10 border-accent/30' : 'bg-surface border-border'
        }`}
      >
        <View className="flex-row items-center gap-2">
          {icon}
          <Text className="text-text-dim text-[10px] uppercase tracking-widest">
            {label}
          </Text>
        </View>
        <Text className="text-text text-3xl font-bold mt-2">{value}</Text>
        <Text className="text-text-muted text-[11px] mt-0.5" numberOfLines={1}>
          {hint}
        </Text>
      </View>
    </Pressable>
  );
}

function NavCard({
  icon,
  title,
  subtitle,
  badge = 0,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <Card padding="md">
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 rounded-2xl bg-violet/10 border border-violet/30 items-center justify-center">
            {icon}
          </View>
          <View className="flex-1">
            <Text className="text-text text-sm font-semibold">{title}</Text>
            <Text className="text-text-muted text-[11px] mt-0.5">{subtitle}</Text>
          </View>
          {badge > 0 && (
            <View className="rounded-full border border-warn/40 bg-warn/10 px-2.5 py-0.5">
              <Text className="text-warn text-[11px] font-bold">{badge}</Text>
            </View>
          )}
          <ChevronRight size={16} color={colors.textDim} />
        </View>
      </Card>
    </Pressable>
  );
}
