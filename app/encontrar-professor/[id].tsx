import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  ArrowLeft,
  BadgeCheck,
  ExternalLink,
  Eye,
  Lock,
  MapPin,
  Phone,
  Sparkles,
} from 'lucide-react-native';
import { Avatar, Button, Card, Input, Screen } from '@/components/ui';
import { useAlert } from '@/components/GlobalAlertProvider';
import StarRating from '@/components/coach/StarRating';
import { colors } from '@/lib/theme';
import { especialidadeLabel, SERVICE_MODE_LABELS, type ServiceMode } from '@/lib/especialidades';
import {
  useCoachPublicProfile,
  useMyLastContactPhone,
  useRateCoach,
  useRequestCoach,
} from '@/hooks/useEnrollment';
import { formatPhoneBR, isValidPhone, parsePhoneInput } from '@/lib/phone';
import { useProfile } from '@/hooks/useProfile';
import { useEntitlement } from '@/hooks/useEntitlement';
import { recordLegalAcceptanceSafe } from '@/services/legal';

const PLAY_SUBSCRIPTIONS =
  'https://play.google.com/store/account/subscriptions?package=br.com.nutrion';

export default function PerfilPublicoProfessorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const alert = useAlert();
  const q = useCoachPublicProfile(id ?? null);
  const profileQ = useProfile();
  const entQ = useEntitlement();
  const requestM = useRequestCoach();
  const rateM = useRateCoach();

  const [confirmando, setConfirmando] = useState(false);

  // Telefone é obrigatório: sem canal de contato o professor recebe o
  // pedido e não tem como responder — não existe chat no app.
  const lastPhoneQ = useMyLastContactPhone();
  const [phoneRaw, setPhoneRaw] = useState('');
  useEffect(() => {
    if (lastPhoneQ.data && !phoneRaw) setPhoneRaw(lastPhoneQ.data);
  }, [lastPhoneQ.data]);
  const phoneDigits = parsePhoneInput(phoneRaw);
  const phoneOk = isValidPhone(phoneDigits);
  const phoneError =
    phoneDigits.length > 0 && !phoneOk
      ? 'Telefone inválido. Use DDD + número (ou DDI + DDD + número).'
      : null;

  const coach = q.data;
  const role = profileQ.data?.role;
  const jaEhAluno = role === 'aluno';
  const temAssinaturaPropria =
    entQ.data?.tier === 'pro' || entQ.data?.tier === 'premium';

  async function enviar() {
    if (!coach) return;
    try {
      // Consentimento de dado sensível de saúde: o professor passa a ver
      // todo o histórico, inclusive o anterior ao vínculo.
      await recordLegalAcceptanceSafe();
      await requestM.mutateAsync({
        coachId: coach.coach_id,
        contactPhone: phoneDigits,
      });
      setConfirmando(false);
      alert.showAlert({
        title: 'Solicitação enviada',
        message: `${coach.full_name ?? 'O professor'} vai receber seu pedido. Você é avisado assim que ele responder.`,
        type: 'success',
      });
    } catch (err) {
      setConfirmando(false);
      alert.showError(err);
    }
  }

  async function avaliar(stars: number) {
    if (!coach) return;
    try {
      await rateM.mutateAsync({ coachId: coach.coach_id, stars });
    } catch (err) {
      alert.showError(err);
    }
  }

  if (!id) return null;

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
          <Text className="text-text font-semibold ml-3">Professor</Text>
        </View>

        {q.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : !coach ? (
          <View className="flex-1 items-center justify-center px-10">
            <Text className="text-text font-semibold text-center">
              Professor indisponível
            </Text>
            <Text className="text-text-muted text-xs text-center mt-2 leading-relaxed">
              Ele pode ter saído da busca ou não estar aceitando alunos agora.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
          >
            <Card padding="lg" glow accent="green">
              <View className="items-center">
                <Avatar url={coach.avatar_url} name={coach.full_name} size={76} />
                <Text className="text-text text-xl font-bold mt-3 text-center">
                  {coach.full_name ?? 'Professor'}
                </Text>

                {coach.cref ? (
                  <View className="flex-row items-center gap-1.5 mt-1.5">
                    <BadgeCheck size={13} color={colors.accent} />
                    <Text className="text-text-dim text-xs">{coach.cref}</Text>
                  </View>
                ) : null}

                <View className="flex-row items-center gap-1.5 mt-2">
                  <MapPin size={12} color={colors.textMuted} />
                  <Text className="text-text-dim text-xs">
                    {coach.city ? `${coach.city}/${coach.state_uf}` : coach.state_uf}
                    {coach.service_mode
                      ? ` · ${SERVICE_MODE_LABELS[coach.service_mode as ServiceMode]}`
                      : ''}
                  </Text>
                </View>

                <View className="mt-3">
                  <StarRating
                    value={coach.rating_avg}
                    count={coach.rating_count}
                    size={18}
                  />
                </View>
              </View>
            </Card>

            {coach.specialties.length > 0 && (
              <Card padding="md">
                <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
                  Especialidades
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {coach.specialties.map((s) => (
                    <View
                      key={s}
                      className="px-3 py-1.5 rounded-full bg-accent/10 border border-accent/25"
                    >
                      <Text className="text-accent-soft text-xs font-semibold">
                        {especialidadeLabel(s)}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            )}

            {coach.bio ? (
              <Card padding="md">
                <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-2">
                  Sobre
                </Text>
                <Text className="text-text text-sm leading-relaxed">{coach.bio}</Text>
              </Card>
            ) : null}

            {coach.can_rate && (
              <Card padding="md">
                <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
                  Sua avaliação
                </Text>
                <StarRating
                  value={coach.my_rating ?? 0}
                  size={30}
                  onChange={avaliar}
                  disabled={rateM.isPending}
                />
                <Text className="text-text-muted text-[11px] mt-3">
                  {coach.my_rating
                    ? 'Toque nas estrelas pra mudar sua nota.'
                    : 'Só quem foi aluno pode avaliar. Sua nota entra na média pública.'}
                </Text>
              </Card>
            )}

            {/* Ação principal */}
            {coach.open_request_status ? (
              <Card padding="md">
                <Text className="text-text font-semibold text-sm">
                  {coach.open_request_status === 'pendente'
                    ? 'Solicitação enviada'
                    : 'Professor está tratando seu pedido'}
                </Text>
                <Text className="text-text-muted text-xs mt-1.5 leading-relaxed">
                  {coach.open_request_status === 'pendente'
                    ? 'Aguarde a resposta. Você é avisado quando ele decidir.'
                    : 'Ele marcou seu pedido como em andamento. O combinado acontece fora do app.'}
                </Text>
                <View className="mt-3">
                  <Button
                    label="Ver minhas solicitações"
                    variant="secondary"
                    size="md"
                    onPress={() => router.push('/minhas-solicitacoes' as Href)}
                  />
                </View>
              </Card>
            ) : jaEhAluno ? (
              <Card padding="md">
                <Text className="text-text-dim text-xs leading-relaxed">
                  Você já é aluno de um professor. Para trocar, peça o desvínculo ao
                  seu professor atual.
                </Text>
              </Card>
            ) : confirmando ? (
              <Card padding="lg" accent="violet" glow>
                <Text className="text-text font-bold text-base">
                  Antes de confirmar
                </Text>
                <Text className="text-text-dim text-xs mt-1 leading-relaxed">
                  Virar aluno de {coach.full_name ?? 'um professor'} muda estas coisas
                  na sua conta:
                </Text>

                <View className="mt-4 gap-3">
                  <Linha
                    icon={<Eye size={15} color={colors.violetSoft} />}
                    titulo="Ele passa a ver seus dados"
                    texto="Refeições, água, treinos, peso e avaliações — inclusive o que você registrou antes de virar aluno."
                  />
                  <Linha
                    icon={<Lock size={15} color={colors.warn} />}
                    titulo="Seu treino fica com ele"
                    texto="Você mantém tudo o que já criou, mas não edita nem cria treinos: quem monta e ajusta passa a ser o professor."
                  />
                  <Linha
                    icon={<Sparkles size={15} color={colors.accent} />}
                    titulo="Você ganha o plano dele"
                    texto="O acesso do professor passa a valer pra você, sem pagar por isso no app."
                  />
                </View>

                {temAssinaturaPropria && (
                  <View className="mt-4 rounded-2xl border border-warn/30 bg-warn/5 p-4">
                    <Text className="text-warn text-xs font-semibold">
                      Você tem uma assinatura ativa
                    </Text>
                    <Text className="text-text-dim text-[11px] mt-1.5 leading-relaxed">
                      Ela continua valendo — você fica com o melhor acesso entre o seu
                      e o do professor, então nada é perdido. Mas o app não cancela
                      assinatura por você: se não quiser mais pagar, cancele na Play
                      Store.
                    </Text>
                    <Pressable
                      onPress={() => void Linking.openURL(PLAY_SUBSCRIPTIONS)}
                      className="flex-row items-center gap-1.5 mt-2.5 active:opacity-70"
                    >
                      <ExternalLink size={13} color={colors.accent} />
                      <Text className="text-accent text-[11px] font-semibold">
                        Gerenciar assinatura na Play Store
                      </Text>
                    </Pressable>
                  </View>
                )}

                <View className="mt-5">
                  <Input
                    label="Seu telefone para contato"
                    value={phoneRaw}
                    onChangeText={setPhoneRaw}
                    placeholder="11999999999"
                    keyboardType="number-pad"
                    maxLength={13}
                    leftIcon={<Phone size={16} color={colors.textMuted} />}
                    error={phoneError ?? undefined}
                  />
                  <Text className="text-text-muted text-[11px] mt-2 leading-relaxed">
                    {phoneOk
                      ? `${formatPhoneBR(phoneDigits)} — o professor usa este número pra falar com você.`
                      : 'O professor combina tudo com você por fora do app (WhatsApp ou ligação). Só ele vê este número, e só enquanto a solicitação estiver de pé.'}
                  </Text>
                </View>

                <Text className="text-text-muted text-[11px] mt-4 leading-relaxed">
                  O pagamento do professor, se houver, é combinado direto com ele —
                  o app não intermedeia.
                </Text>

                <View className="mt-5 gap-2">
                  <Button
                    label="Confirmar e enviar solicitação"
                    onPress={enviar}
                    loading={requestM.isPending}
                    disabled={!phoneOk}
                    fullWidth
                  />
                  <Button
                    label="Voltar"
                    variant="ghost"
                    onPress={() => setConfirmando(false)}
                    disabled={requestM.isPending}
                    fullWidth
                  />
                </View>
              </Card>
            ) : (
              <View className="gap-2">
                <Button
                  label="Quero ser aluno"
                  onPress={() => setConfirmando(true)}
                  fullWidth
                />
                <Text className="text-text-muted text-[11px] text-center leading-relaxed">
                  Você só vira aluno quando o professor aceitar.
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </Screen>
    </>
  );
}

function Linha({
  icon,
  titulo,
  texto,
}: {
  icon: React.ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <View className="flex-row gap-3">
      <View className="h-8 w-8 rounded-xl bg-surface-raised border border-border items-center justify-center mt-0.5">
        {icon}
      </View>
      <View className="flex-1">
        <Text className="text-text text-sm font-semibold">{titulo}</Text>
        <Text className="text-text-muted text-[11px] mt-0.5 leading-relaxed">
          {texto}
        </Text>
      </View>
    </View>
  );
}
