import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Bell,
  BellOff,
  Download,
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
import { colors } from '@/lib/theme';
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

  const phoneDigits = parsePhoneInput(phoneRaw);
  const phoneError =
    showContact && phoneDigits.length > 0 && !isValidPhone(phoneDigits)
      ? 'Telefone inválido. Use 10 a 13 dígitos (DDI+DDD+número).'
      : null;

  const canSave =
    !update.isPending &&
    !phoneError &&
    !(showContact && phoneDigits.length === 0);

  async function handleSave() {
    if (!canSave) return;
    try {
      await update.mutateAsync({
        bio: bio.trim() || null,
        cref: cref.trim() || null,
        show_contact_to_students: showContact,
        contact_phone: showContact ? phoneDigits : null,
      });
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
                  placeholder="Ex: 012345-G/SP"
                  autoCapitalize="characters"
                />
              </View>
            </Card>

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
