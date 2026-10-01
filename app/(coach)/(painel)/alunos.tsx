import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Plus, Search, Users, X } from 'lucide-react-native';
import { Button, Screen } from '@/components/ui';
import { colors } from '@/lib/theme';
import { useStudents, useStudentsTracking } from '@/hooks/useStudents';
import { useDowngradeStatus } from '@/hooks/useDowngradeStatus';
import StudentRow from '@/components/coach/StudentRow';
import { suspendedCount } from '@/lib/suspension';
import type { StudentTracking } from '@/services/studentTracking';

export default function CoachAlunosScreen() {
  const router = useRouter();
  const studentsQ = useStudents();
  const downgrade = useDowngradeStatus();
  const [filtro, setFiltro] = useState('');

  const alunos = studentsQ.data ?? [];
  const suspended = suspendedCount(alunos);
  const ids = alunos.map((s) => s.id);
  const trackingResults = useStudentsTracking(ids);
  const trackingById = new Map<string, StudentTracking | undefined>(
    ids.map((id, i) => [id, trackingResults[i]?.data]),
  );

  const termo = filtro.trim().toLowerCase();
  const filtrados = termo
    ? alunos.filter((s) => (s.full_name ?? '').toLowerCase().includes(termo))
    : alunos;

  return (
    <Screen variant="hero" edges={['top']}>
      <View className="px-5 pt-6 pb-3">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-text-dim text-[11px] uppercase tracking-widest">
              Meus alunos
            </Text>
            <Text className="text-text text-2xl font-bold mt-0.5">
              {alunos.length}
              {downgrade.studentLimit != null ? (
                <Text className="text-text-muted text-base font-semibold">
                  {' '}
                  / {downgrade.studentLimit}
                </Text>
              ) : null}
            </Text>
            {suspended > 0 && (
              <Text className="text-warn text-[11px] mt-0.5">
                {suspended} com acesso suspenso
              </Text>
            )}
          </View>

          <Pressable
            onPress={() => router.push('/(coach)/aluno-novo' as Href)}
            className="flex-row items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-2 active:opacity-70"
          >
            <Plus size={14} color={colors.accent} />
            <Text className="text-accent text-xs font-semibold">Cadastrar</Text>
          </Pressable>
        </View>

        {alunos.length > 5 && (
          <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 mt-4">
            <Search size={16} color={colors.textMuted} />
            <TextInput
              value={filtro}
              onChangeText={setFiltro}
              placeholder="Buscar aluno pelo nome"
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.accent}
              className="flex-1 text-text text-sm"
              autoCorrect={false}
            />
            {filtro.length > 0 && (
              <Pressable onPress={() => setFiltro('')} hitSlop={10}>
                <X size={15} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        )}
      </View>

      {studentsQ.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.violetSoft} />
        </View>
      ) : studentsQ.error ? (
        <View className="flex-1 items-center justify-center px-10">
          <Text className="text-danger text-sm text-center">
            Não consegui carregar a lista. Puxe pra baixo pra tentar de novo.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtrados}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 140,
            gap: 8,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={studentsQ.isRefetching}
              onRefresh={() => void studentsQ.refetch()}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          renderItem={({ item }) => (
            <StudentRow
              student={item}
              tracking={trackingById.get(item.id)}
              onPress={() => router.push(`/(coach)/aluno/${item.id}` as Href)}
            />
          )}
          ListEmptyComponent={
            termo ? (
              <Text className="text-text-muted text-xs text-center py-8">
                Nenhum aluno com esse nome.
              </Text>
            ) : (
              <EmptyAlunos
                onCadastrar={() => router.push('/(coach)/aluno-novo' as Href)}
              />
            )
          }
        />
      )}
    </Screen>
  );
}

function EmptyAlunos({ onCadastrar }: { onCadastrar: () => void }) {
  return (
    <View className="items-center px-6 pt-16">
      <View className="h-16 w-16 rounded-3xl bg-surface-raised border border-border items-center justify-center mb-4">
        <Users size={26} color={colors.textMuted} />
      </View>
      <Text className="text-text font-semibold text-center">
        Nenhum aluno ainda
      </Text>
      <Text className="text-text-muted text-xs text-center mt-2 leading-relaxed">
        Cadastre a conta do aluno com a ficha já preenchida.
      </Text>
      <View className="mt-5 self-stretch gap-2">
        <Button label="Cadastrar aluno" onPress={onCadastrar} fullWidth />
      </View>
    </View>
  );
}
