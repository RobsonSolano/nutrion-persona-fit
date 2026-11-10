import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Check, Plus, Ruler, Trash2 } from 'lucide-react-native';
import { Button, Card, ConfirmModal } from '@/components/ui';
import EvolutionChart from '@/components/coach/EvolutionChart';
import {
  useDeletePhysicalAssessment,
  usePhysicalAssessments,
} from '@/hooks/usePhysicalAssessments';
import { colors } from '@/lib/theme';
import type { PhysicalAssessment } from '@/types/database';
import { friendlyMessage } from '@/lib/friendlyError';

type Props = {
  studentId: string;
};

export default function AssessmentList({ studentId }: Props) {
  const router = useRouter();
  const listQ = usePhysicalAssessments(studentId);
  const deleteM = useDeletePhysicalAssessment();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PhysicalAssessment | null>(
    null,
  );

  const items = listQ.data ?? [];
  const canCompare = selected.size === 2;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (next.size >= 2) {
        Alert.alert(
          'Comparar duas avaliações',
          'Selecione apenas duas para comparar. Desmarque uma antes de adicionar outra.',
        );
        return prev;
      }
      next.add(id);
      return next;
    });
  }

  function handleNova() {
    router.push(`/(coach)/aluno/${studentId}/avaliacao/nova`);
  }

  function handleVer(assessmentId: string) {
    router.push(`/(coach)/aluno/${studentId}/avaliacao/${assessmentId}`);
  }

  function handleComparar() {
    const ids = [...selected];
    router.push(
      `/(coach)/aluno/${studentId}/avaliacao/comparar?a=${ids[0]}&b=${ids[1]}`,
    );
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteM.mutateAsync({
        assessmentId: pendingDelete.id,
        studentId,
      });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(pendingDelete.id);
        return next;
      });
    } catch (err) {
      Alert.alert(
        'Não consegui excluir',
        friendlyMessage(err),
      );
    } finally {
      setPendingDelete(null);
    }
  }

  if (listQ.isLoading) {
    return (
      <Card padding="md">
        <Text className="text-text-muted text-xs">Carregando avaliações…</Text>
      </Card>
    );
  }

  if (listQ.isError) {
    return (
      <Card padding="md">
        <Text className="text-danger text-xs">
          Erro ao carregar avaliações. Tente novamente mais tarde.
        </Text>
      </Card>
    );
  }

  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        <View style={{ flex: 1 }}>
          <Button
            label="Nova avaliação"
            onPress={handleNova}
            icon={<Plus size={16} color={colors.textInverse} />}
            size="sm"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={canCompare ? 'Comparar (2)' : 'Comparar'}
            onPress={handleComparar}
            variant="secondary"
            size="sm"
            disabled={!canCompare}
            icon={
              <ArrowRight
                size={16}
                color={canCompare ? colors.text : colors.textMuted}
              />
            }
          />
        </View>
      </View>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {items.map((a) => (
            <AssessmentCard
              key={a.id}
              assessment={a}
              selected={selected.has(a.id)}
              onToggle={() => toggle(a.id)}
              onView={() => handleVer(a.id)}
              onDelete={() => setPendingDelete(a)}
            />
          ))}
          {items.length >= 2 && <EvolutionChart assessments={items} />}
        </>
      )}

      <ConfirmModal
        visible={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Excluir avaliação?"
        message={
          pendingDelete
            ? `A avaliação de ${formatDate(pendingDelete.assessed_at)} será removida do histórico.`
            : undefined
        }
        actions={[
          {
            label: 'Excluir',
            onPress: confirmDelete,
            variant: 'danger',
            loading: deleteM.isPending,
          },
          {
            label: 'Cancelar',
            onPress: () => setPendingDelete(null),
            variant: 'ghost',
          },
        ]}
      />
    </View>
  );
}

function EmptyState() {
  return (
    <Card padding="md">
      <View className="items-center py-6 gap-2">
        <View className="h-12 w-12 rounded-2xl bg-surface-muted items-center justify-center border border-border">
          <Ruler size={20} color={colors.textMuted} />
        </View>
        <Text className="text-text font-semibold">
          Nenhuma avaliação registrada
        </Text>
        <Text className="text-text-muted text-xs text-center px-4 leading-relaxed">
          Cadastre a primeira avaliação física do aluno (peso, perimetria,
          dobras) e acompanhe a evolução ao longo do tempo.
        </Text>
      </View>
    </Card>
  );
}

function AssessmentCard({
  assessment,
  selected,
  onToggle,
  onView,
  onDelete,
}: {
  assessment: PhysicalAssessment;
  selected: boolean;
  onToggle: () => void;
  onView: () => void;
  onDelete: () => void;
}) {
  const a = assessment;
  const stats = useMemo(() => buildStats(a), [a]);

  return (
    <Pressable onPress={onView} className="active:opacity-90">
      <View
        className={`rounded-2xl border p-4 ${
          selected
            ? 'bg-surface-raised border-accent'
            : 'bg-surface border-border'
        }`}
      >
        <View className="flex-row items-center justify-between mb-2">
          <Pressable
            onPress={onToggle}
            hitSlop={8}
            className={`h-7 w-7 rounded-lg items-center justify-center border ${
              selected
                ? 'bg-accent border-accent'
                : 'bg-surface-muted border-border-strong'
            }`}
          >
            {selected ? <Check size={14} color={colors.textInverse} /> : null}
          </Pressable>
          <Text className="text-text-dim text-xs font-semibold">
            {formatDate(a.assessed_at)}
          </Text>
          <Pressable
            onPress={onDelete}
            hitSlop={8}
            className="h-7 w-7 rounded-lg bg-surface-muted border border-border items-center justify-center active:opacity-70"
          >
            <Trash2 size={14} color={colors.danger} />
          </Pressable>
        </View>

        <View className="flex-row flex-wrap gap-2">
          {stats.map((s) => (
            <View
              key={s.label}
              className="rounded-full border border-border bg-surface-muted px-3 py-1"
            >
              <Text className="text-text-muted text-[10px] uppercase tracking-wider">
                {s.label}
              </Text>
              <Text className="text-text text-sm font-semibold">{s.value}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

function buildStats(a: PhysicalAssessment) {
  const out: { label: string; value: string }[] = [];
  if (a.weight_kg != null) {
    out.push({ label: 'Peso', value: `${formatNumber(a.weight_kg)} kg` });
  }
  if (a.body_fat_pct != null) {
    out.push({ label: '%G', value: `${formatNumber(a.body_fat_pct)}%` });
  }
  if (a.bmi != null) {
    out.push({ label: 'IMC', value: formatNumber(a.bmi) });
  }
  if (a.perim_waist_cm != null) {
    out.push({ label: 'Cintura', value: `${formatNumber(a.perim_waist_cm)} cm` });
  }
  if (out.length === 0) {
    out.push({ label: 'Sem dados', value: '—' });
  }
  return out;
}

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatNumber(n: number) {
  return n
    .toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
}
