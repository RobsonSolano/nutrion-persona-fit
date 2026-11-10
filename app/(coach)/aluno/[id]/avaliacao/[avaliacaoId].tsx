import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react-native';
import { Button, Card, ConfirmModal, Screen } from '@/components/ui';
import AssessmentForm from '@/components/coach/AssessmentForm';
import PosturePhotoSection from '@/components/coach/PosturePhotoSection';
import {
  useDeletePhysicalAssessment,
  usePhysicalAssessment,
  useUpdatePhysicalAssessment,
} from '@/hooks/usePhysicalAssessments';
import { useStudentDetail } from '@/hooks/useStudents';
import { colors } from '@/lib/theme';
import type {
  PhysicalAssessment,
  PhysicalAssessmentInput,
} from '@/types/database';
import { friendlyMessage } from '@/lib/friendlyError';

export default function DetalheAvaliacaoScreen() {
  const router = useRouter();
  const { id, avaliacaoId } = useLocalSearchParams<{
    id: string;
    avaliacaoId: string;
  }>();
  const detailQ = useStudentDetail(id ?? null);
  const assessmentQ = usePhysicalAssessment(avaliacaoId ?? null);
  const updateM = useUpdatePhysicalAssessment();
  const deleteM = useDeletePhysicalAssessment();

  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  if (!id || !avaliacaoId) return null;

  const studentSex = detailQ.data?.profile.sex ?? null;
  const a = assessmentQ.data;

  async function handleSubmit(input: PhysicalAssessmentInput) {
    if (!a) return;
    try {
      await updateM.mutateAsync({
        assessmentId: a.id,
        studentId: id!,
        patch: input,
      });
      setEditing(false);
    } catch (err) {
      Alert.alert(
        'Não consegui salvar',
        friendlyMessage(err),
      );
    }
  }

  async function handleDelete() {
    if (!a) return;
    try {
      await deleteM.mutateAsync({ assessmentId: a.id, studentId: id! });
      router.back();
    } catch (err) {
      Alert.alert(
        'Não consegui excluir',
        friendlyMessage(err),
      );
    } finally {
      setConfirmDel(false);
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
            onPress={() => (editing ? setEditing(false) : router.back())}
            hitSlop={12}
            className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <ArrowLeft size={18} color={colors.textDim} />
          </Pressable>
          <Text className="text-text font-semibold">
            {editing ? 'Editar avaliação' : 'Avaliação'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {assessmentQ.isLoading ? (
          <View className="flex-1 p-5">
            <Card padding="md">
              <Text className="text-text-muted text-xs">
                Carregando avaliação…
              </Text>
            </Card>
          </View>
        ) : !a ? (
          <View className="flex-1 p-5">
            <Card padding="md">
              <Text className="text-text font-semibold mb-1">
                Avaliação não encontrada
              </Text>
              <Text className="text-text-muted text-xs">
                Pode ter sido excluída ou você não tem permissão.
              </Text>
            </Card>
          </View>
        ) : editing ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={{
                padding: 20,
                gap: 14,
                paddingBottom: 80,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <AssessmentForm
                studentId={id}
                studentSex={studentSex}
                initial={a}
                submitting={updateM.isPending}
                submitLabel="Salvar alterações"
                onSubmit={handleSubmit}
                onCancel={() => setEditing(false)}
              />

              <Card padding="md">
                <PosturePhotoSection
                  assessmentId={a.id}
                  studentId={id}
                  photos={a.posture_photos}
                  editable
                />
              </Card>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <ScrollView
            contentContainerStyle={{
              padding: 20,
              gap: 14,
              paddingBottom: 60,
            }}
            showsVerticalScrollIndicator={false}
          >
            <ViewMode assessment={a} />
            {a.posture_photos.length > 0 && (
              <Card padding="md">
                <PosturePhotoSection
                  assessmentId={a.id}
                  studentId={id}
                  photos={a.posture_photos}
                  editable={false}
                />
              </Card>
            )}
            <View className="gap-2 mt-2">
              <Button
                label="Editar"
                onPress={() => setEditing(true)}
                icon={<Pencil size={16} color={colors.textInverse} />}
              />
              <Button
                label="Excluir avaliação"
                onPress={() => setConfirmDel(true)}
                variant="danger"
                icon={<Trash2 size={16} color={colors.danger} />}
              />
            </View>
          </ScrollView>
        )}

        <ConfirmModal
          visible={confirmDel}
          onClose={() => setConfirmDel(false)}
          title="Excluir avaliação?"
          message={
            a
              ? `A avaliação de ${formatDate(a.assessed_at)} será removida do histórico.`
              : undefined
          }
          actions={[
            {
              label: 'Excluir',
              onPress: handleDelete,
              variant: 'danger',
              loading: deleteM.isPending,
            },
            {
              label: 'Cancelar',
              onPress: () => setConfirmDel(false),
              variant: 'ghost',
            },
          ]}
        />
      </Screen>
    </>
  );
}

// =====================================================================
// View mode (read-only)
// =====================================================================
function ViewMode({ assessment }: { assessment: PhysicalAssessment }) {
  const a = assessment;

  return (
    <>
      <Card padding="md">
        <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-2">
          Data
        </Text>
        <Text className="text-text text-2xl font-bold">
          {formatDate(a.assessed_at)}
        </Text>
        <Text className="text-text-muted text-xs mt-1">
          Protocolo: {protocolLabel(a.protocol)}
        </Text>
      </Card>

      <Card padding="md">
        <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
          Composição
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <Pill label="Peso" value={fmtNum(a.weight_kg)} unit="kg" />
          <Pill label="Altura" value={fmtNum(a.height_cm)} unit="cm" />
          <Pill label="IMC" value={fmtNum(a.bmi)} />
          <Pill label="% Gordura" value={fmtNum(a.body_fat_pct)} unit="%" />
          <Pill label="Massa gorda" value={fmtNum(a.fat_mass_kg)} unit="kg" />
          <Pill label="Massa magra" value={fmtNum(a.lean_mass_kg)} unit="kg" />
          <Pill
            label="Densidade"
            value={a.body_density != null ? a.body_density.toFixed(5) : '—'}
          />
        </View>
      </Card>

      {hasAnyPerim(a) && (
        <Card padding="md">
          <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
            Perimetria (cm)
          </Text>
          <View className="gap-1.5">
            {(
              [
                ['Braço', a.perim_arm_l_cm, a.perim_arm_r_cm],
                ['Antebraço', a.perim_forearm_l_cm, a.perim_forearm_r_cm],
                ['Coxa', a.perim_thigh_l_cm, a.perim_thigh_r_cm],
                ['Panturrilha', a.perim_calf_l_cm, a.perim_calf_r_cm],
              ] as const
            ).map(([name, l, r]) => {
              if (l == null && r == null) return null;
              return (
                <KeyValue
                  key={name}
                  k={name}
                  v={`Esq. ${fmtNum(l)}  ·  Dir. ${fmtNum(r)}`}
                />
              );
            })}
            {a.perim_chest_cm != null && (
              <KeyValue k="Peito" v={`${fmtNum(a.perim_chest_cm)} cm`} />
            )}
            {a.perim_waist_cm != null && (
              <KeyValue k="Cintura" v={`${fmtNum(a.perim_waist_cm)} cm`} />
            )}
            {a.perim_hip_cm != null && (
              <KeyValue k="Quadril" v={`${fmtNum(a.perim_hip_cm)} cm`} />
            )}
          </View>
        </Card>
      )}

      {a.protocol !== 'none' && hasAnySkin(a) && (
        <Card padding="md">
          <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
            Dobras cutâneas (mm)
          </Text>
          <View className="gap-1.5">
            {(
              [
                ['Peitoral', a.skin_chest_mm],
                ['Axilar média', a.skin_midaxillary_mm],
                ['Tríceps', a.skin_triceps_mm],
                ['Subescapular', a.skin_subscapular_mm],
                ['Abdominal', a.skin_abdominal_mm],
                ['Suprailíaca', a.skin_suprailiac_mm],
                ['Coxa', a.skin_thigh_mm],
              ] as const
            ).map(([name, v]) => {
              if (v == null) return null;
              return <KeyValue key={name} k={name} v={`${fmtNum(v)} mm`} />;
            })}
          </View>
        </Card>
      )}

      {a.posture_notes && (
        <Card padding="md">
          <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-2">
            Postural
          </Text>
          <Text className="text-text text-sm leading-relaxed">
            {a.posture_notes}
          </Text>
        </Card>
      )}

      {a.notes && (
        <Card padding="md">
          <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-2">
            Observações
          </Text>
          <Text className="text-text text-sm leading-relaxed">{a.notes}</Text>
        </Card>
      )}
    </>
  );
}

function Pill({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <View className="rounded-2xl border border-border bg-surface-muted px-3 py-2">
      <Text className="text-text-muted text-[10px] uppercase tracking-wider">
        {label}
      </Text>
      <Text className="text-text text-base font-semibold">
        {value}
        {unit ? <Text className="text-text-dim text-xs"> {unit}</Text> : null}
      </Text>
    </View>
  );
}

function KeyValue({ k, v }: { k: string; v: string }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-text-dim text-sm">{k}</Text>
      <Text className="text-text text-sm font-semibold">{v}</Text>
    </View>
  );
}

function hasAnyPerim(a: PhysicalAssessment): boolean {
  return [
    a.perim_arm_r_cm,
    a.perim_arm_l_cm,
    a.perim_forearm_r_cm,
    a.perim_forearm_l_cm,
    a.perim_chest_cm,
    a.perim_waist_cm,
    a.perim_hip_cm,
    a.perim_thigh_r_cm,
    a.perim_thigh_l_cm,
    a.perim_calf_r_cm,
    a.perim_calf_l_cm,
  ].some((v) => v != null);
}

function hasAnySkin(a: PhysicalAssessment): boolean {
  return [
    a.skin_chest_mm,
    a.skin_midaxillary_mm,
    a.skin_triceps_mm,
    a.skin_subscapular_mm,
    a.skin_abdominal_mm,
    a.skin_suprailiac_mm,
    a.skin_thigh_mm,
  ].some((v) => v != null);
}

function fmtNum(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function protocolLabel(p: PhysicalAssessment['protocol']): string {
  if (p === 'pollock_3') return 'Pollock 3 dobras';
  if (p === 'pollock_7') return 'Pollock 7 dobras';
  return 'sem dobras';
}
