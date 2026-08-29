import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Ban,
  Bell,
  BellOff,
  ChevronRight,
  Download,
  Eye,
  Lock,
  LogOut,
  Save,
  TrendingUp,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Button, Card, Input, Screen } from '@/components/ui';
import AvatarPicker from '@/components/AvatarPicker';
import SubscriptionCard from '@/components/SubscriptionCard';
import DangerZone from '@/components/DangerZone';
import { useStudents } from '@/hooks/useStudents';
import type { Href } from 'expo-router';
import { useAlert } from '@/components/GlobalAlertProvider';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import {
  useCoachContact,
  useUpdateCoachSettings,
} from '@/hooks/useCoachContact';
import { formatPhoneBR, isValidPhone, parsePhoneInput } from '@/lib/phone';
import { validateCredential, CREF_EXAMPLE } from '@/lib/cref';
import { colors } from '@/lib/theme';
import { useQuery } from '@tanstack/react-query';
import LocalidadePicker from '@/components/coach/LocalidadePicker';
import EspecialidadePicker from '@/components/coach/EspecialidadePicker';
import { faltaParaPerfilPublico, getMyCoach } from '@/services/coach';
import { SERVICE_MODES, SERVICE_MODE_LABELS } from '@/lib/especialidades';
import { usePushToggle } from '@/hooks/usePushToggle';

export default function CoachPerfilScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const profileQ = useProfile();
  const coachQ = useCoachContact(user?.id ?? null);
  const update = useUpdateCoachSettings();
  const studentsQ = useStudents();
  const alert = useAlert();
  const studentCount = studentsQ.data?.length ?? 0;

  const [bio, setBio] = useState('');
  const [cref, setCref] = useState('');
  const [showContact, setShowContact] = useState(false);
  const [phoneRaw, setPhoneRaw] = useState('');

  // Perfil público (descoberta). Vem de getMyCoach porque useCoachContact
  // devolve só o subconjunto que o ALUNO pode ver do coach.
  const myCoachQ = useQuery({
    queryKey: ['my-coach', user?.id ?? 'anon'],
    queryFn: getMyCoach,
    enabled: !!user?.id,
    staleTime: 60_000,
  });
  const [isPublic, setIsPublic] = useState(false);
  const [uf, setUf] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [ibge, setIbge] = useState<number | null>(null);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [serviceMode, setServiceMode] = useState<string | null>(null);
  const push = usePushToggle();
  const { logout } = useAuth();

  useEffect(() => {
    if (coachQ.data) {
      setBio(coachQ.data.bio ?? '');
      setCref(coachQ.data.cref ?? '');
      setShowContact(coachQ.data.show_contact_to_students);
      setPhoneRaw(coachQ.data.contact_phone ?? '');
    }
  }, [coachQ.data]);

  useEffect(() => {
    const c = myCoachQ.data;
    if (c) {
      setIsPublic(c.is_public);
      setUf(c.state_uf);
      setCity(c.city);
      setIbge(c.city_ibge_code ? Number(c.city_ibge_code) : null);
      setSpecialties(c.specialties ?? []);
      setServiceMode(c.service_mode);
    }
  }, [myCoachQ.data]);

  // O CREF é editável aqui — sem a mesma validação do cadastro, qualquer
  // professor trocaria o registro válido por lixo depois de entrar.
  const credencial = validateCredential(cref);
  const crefError = !credencial.ok ? credencial.reason : null;

  const phoneDigits = parsePhoneInput(phoneRaw);
  const phoneError =
    showContact && phoneDigits.length > 0 && !isValidPhone(phoneDigits)
      ? 'Telefone inválido. Use 10 a 13 dígitos (DDI+DDD+número).'
      : null;

  // O que falta pra descoberta, calculado sobre o que está NA TELA (não no
  // que está salvo) — senão o professor liga o toggle, salva, e só depois
  // descobre que continua invisível.
  const faltaPublico = faltaParaPerfilPublico({
    ...(myCoachQ.data ?? ({} as never)),
    state_uf: uf,
    city,
    specialties,
    service_mode: serviceMode as 'online' | 'presencial' | 'hibrido' | null,
  });
  const publicoIncompleto = isPublic && faltaPublico.length > 0;

  const canSave =
    !update.isPending &&
    !crefError &&
    !phoneError &&
    !publicoIncompleto &&
    !(showContact && phoneDigits.length === 0);

  async function handleSave() {
    if (!canSave) return;
    try {
      await update.mutateAsync({
        bio: bio.trim() || null,
        cref: credencial.ok ? credencial.value : null,
        show_contact_to_students: showContact,
        contact_phone: showContact ? phoneDigits : null,
        is_public: isPublic,
        state_uf: uf,
        city,
        city_ibge_code: ibge != null ? String(ibge) : null,
        specialties,
        service_mode: serviceMode as 'online' | 'presencial' | 'hibrido' | null,
      });
      await myCoachQ.refetch();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      alert.showAlert({
        title: 'Salvo',
        message: 'Perfil atualizado.',
        type: 'success',
      });
    } catch (err) {
      alert.showError(err);
    }
  }

  return (
    <>
      <Screen variant="hero" edges={['top']}>
        <View className="px-5 py-4 border-b border-border-subtle">
          <Text className="text-text text-2xl font-bold">Meu perfil</Text>
        </View>

        {coachQ.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{
              padding: 20,
              gap: 14,
              paddingBottom: 140,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <Card padding="md">
              <View className="items-center gap-3">
                <AvatarPicker
                  avatarUrl={profileQ.data?.avatar_url ?? null}
                  name={profileQ.data?.full_name ?? null}
                />
                <View className="items-center">
                  <Text className="text-text font-semibold">
                    {profileQ.data?.full_name ?? 'Professor'}
                  </Text>
                  <Text className="text-text-dim text-xs" numberOfLines={1}>
                    {user?.email ?? ''}
                  </Text>
                </View>
              </View>
            </Card>

            <Card padding="md">
              <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
                Informações profissionais
              </Text>
              <View className="gap-2">
                <Input
                  label="Bio"
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Resumo sobre você (máx 500 chars)"
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                  style={{ minHeight: 100, textAlignVertical: 'top' }}
                />
                <Input
                  label="CREF ou CRN"
                  value={cref}
                  onChangeText={setCref}
                  placeholder={`Ex: ${CREF_EXAMPLE}`}
                  autoCapitalize="characters"
                />
                {crefError ? (
                  <Text className="text-danger text-[11px] px-1 mt-1">
                    {crefError}
                  </Text>
                ) : null}
              </View>
            </Card>

            <Card padding="md">
              <View className="flex-row items-center justify-between mb-1">
                <View className="flex-row items-center gap-2 flex-1 pr-3">
                  <Eye size={14} color={colors.accent} />
                  <Text className="text-text-dim text-[11px] uppercase tracking-widest">
                    Aparecer na busca
                  </Text>
                </View>
                <Switch
                  value={isPublic}
                  onValueChange={setIsPublic}
                  trackColor={{ false: colors.surfaceMuted, true: colors.accent }}
                />
              </View>
              <Text className="text-text-muted text-[11px] leading-relaxed">
                Com isso ligado, usuários do app te encontram por região e
                especialidade e podem pedir pra ser seus alunos. Só professores
                com plano Premium aparecem na busca.
              </Text>

              {isPublic && (
                <View className="gap-4 mt-4">
                  <LocalidadePicker
                    label="Onde você atende"
                    uf={uf}
                    city={city}
                    onChange={(v) => {
                      setUf(v.uf);
                      setCity(v.city);
                      setIbge(v.ibge);
                    }}
                  />

                  <View>
                    <Text className="text-text-dim text-xs uppercase tracking-widest mb-2">
                      Tipo de atendimento
                    </Text>
                    <View className="flex-row gap-2">
                      {SERVICE_MODES.map((m) => {
                        const on = serviceMode === m;
                        return (
                          <Pressable
                            key={m}
                            onPress={() => setServiceMode(m)}
                            className={`flex-1 items-center rounded-2xl border py-2.5 ${
                              on
                                ? 'bg-accent/15 border-accent/40'
                                : 'bg-surface border-border active:bg-surface-raised'
                            }`}
                          >
                            <Text
                              className={`text-xs font-semibold ${
                                on ? 'text-accent-soft' : 'text-text-dim'
                              }`}
                            >
                              {SERVICE_MODE_LABELS[m]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <EspecialidadePicker
                    label="Especialidades"
                    selected={specialties}
                    onChange={setSpecialties}
                  />

                  {publicoIncompleto && (
                    <View className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3">
                      <Text className="text-warn text-xs font-semibold">
                        Falta preencher: {faltaPublico.join(', ')}
                      </Text>
                      <Text className="text-text-dim text-[11px] mt-1 leading-relaxed">
                        Sem isso você não aparece na busca, mesmo com a chave
                        ligada.
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </Card>

            <Pressable
              onPress={() => router.push('/(coach)/bloqueados' as Href)}
              className="active:opacity-80"
            >
              <Card padding="md">
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center">
                    <Ban size={17} color={colors.textDim} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-text text-sm font-semibold">
                      Usuários bloqueados
                    </Text>
                    <Text className="text-text-muted text-[11px] mt-0.5">
                      Quem não pode mais te encontrar nem solicitar
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.textDim} />
                </View>
              </Card>
            </Pressable>

            <Card padding="md">
              <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
                Contato pelos alunos
              </Text>

              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-1 pr-3">
                  <Text className="text-text font-semibold text-sm">
                    Permitir alunos verem meu telefone
                  </Text>
                  <Text className="text-text-muted text-[11px] mt-0.5 leading-relaxed">
                    Quando ativo, alunos vinculados veem um botão de WhatsApp
                    no perfil deles.
                  </Text>
                </View>
                <Switch
                  value={showContact}
                  onValueChange={setShowContact}
                  trackColor={{
                    false: colors.surfaceMuted,
                    true: colors.accent,
                  }}
                />
              </View>

              {showContact && (
                <View className="gap-2 mt-2">
                  <Input
                    label="Telefone (DDI + DDD + número, só dígitos)"
                    value={phoneRaw}
                    onChangeText={setPhoneRaw}
                    placeholder="5511999999999"
                    keyboardType="number-pad"
                    maxLength={13}
                  />
                  {phoneDigits.length > 0 && !phoneError && (
                    <Text className="text-text-muted text-[11px]">
                      Aluno verá: {formatPhoneBR(phoneDigits)}
                    </Text>
                  )}
                  {phoneError && (
                    <Text className="text-danger text-[11px]">
                      {phoneError}
                    </Text>
                  )}
                </View>
              )}
            </Card>

            <Button
              label="Salvar"
              onPress={handleSave}
              disabled={!canSave}
              loading={update.isPending}
              icon={<Save size={16} color={colors.textInverse} />}
            />

            <SubscriptionCard />

            <Button
              label={push.enabled ? 'Desativar notificações' : 'Ativar notificações'}
              onPress={push.toggle}
              loading={push.loading}
              variant="ghost"
              size="md"
              icon={
                push.enabled ? (
                  <BellOff size={16} color={colors.textDim} />
                ) : (
                  <Bell size={16} color={colors.textDim} />
                )
              }
            />

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  label="Minha evolução"
                  onPress={() => router.push('/evolucao' as Href)}
                  variant="secondary"
                  size="md"
                  icon={<TrendingUp size={16} color={colors.accent} />}
                />
              </View>
              <View className="flex-1">
                <Button
                  label="Trocar senha"
                  onPress={() => router.push('/trocar-senha' as Href)}
                  variant="secondary"
                  size="md"
                  icon={<Lock size={16} color={colors.textDim} />}
                />
              </View>
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  label="Exportar dados"
                  onPress={() => router.push('/exportar-dados' as Href)}
                  variant="ghost"
                  size="md"
                  icon={<Download size={16} color={colors.textDim} />}
                />
              </View>
              <View className="flex-1">
                <Button
                  label="Sair"
                  onPress={() => void logout()}
                  variant="ghost"
                  size="md"
                  icon={<LogOut size={16} color={colors.textDim} />}
                />
              </View>
            </View>

            <DangerZone
              blockedReason={
                studentCount > 0
                  ? {
                      studentCount,
                      seeStudentsHref: '/(coach)/alunos' as Href,
                    }
                  : null
              }
            />
          </ScrollView>
        )}
      </Screen>
    </>
  );
}
