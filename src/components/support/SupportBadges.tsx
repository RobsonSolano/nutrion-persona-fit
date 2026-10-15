import { Text, View } from 'react-native';
import { colors } from '@/lib/theme';
import {
  SUPPORT_KIND_LABEL,
  SUPPORT_STATUS_LABEL,
  type SupportKind,
  type SupportStatus,
} from '@/lib/support';

function Pill({ label, tone }: { label: string; tone: string }) {
  return (
    <View
      className="rounded-full border px-2.5 py-0.5"
      style={{ borderColor: `${tone}55`, backgroundColor: `${tone}15` }}
    >
      <Text
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: tone }}
      >
        {label}
      </Text>
    </View>
  );
}

export function SupportKindBadge({ kind }: { kind: SupportKind }) {
  return (
    <Pill
      label={SUPPORT_KIND_LABEL[kind]}
      tone={kind === 'suporte' ? colors.info : colors.violetSoft}
    />
  );
}

export function SupportStatusText({ status }: { status: SupportStatus }) {
  return (
    <Text className="text-[11px] font-semibold" style={{ color: statusTone(status) }}>
      {SUPPORT_STATUS_LABEL[status]}
    </Text>
  );
}

/** Destaque de resposta ainda não aberta. */
export function NewReplyBadge() {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5">
      <View
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }}
      />
      <Text className="text-accent text-[10px] font-bold uppercase tracking-widest">
        Nova resposta
      </Text>
    </View>
  );
}

export function formatSupportDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function statusTone(status: SupportStatus): string {
  switch (status) {
    case 'aberta':
      return colors.warn;
    case 'respondida':
      return colors.accent;
    case 'resolvida':
      return colors.textMuted;
  }
}
