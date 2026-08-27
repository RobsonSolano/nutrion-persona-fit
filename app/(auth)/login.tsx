import { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  Sparkles,
  GraduationCap,
} from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useAlert } from '@/components/GlobalAlertProvider';
import { requestPasswordReset } from '@/services/auth';
import { recordLegalAcceptanceSafe } from '@/services/legal';
import TermsAcceptance from '@/components/TermsAcceptance';
import HealthDataConsent from '@/components/HealthDataConsent';
import { colors } from '@/lib/theme';
import { IS_EXPO_GO } from '@/lib/platform';
import {
  Button,
  ConfirmModal,
  Input,
  Logo,
  Screen,
  SegmentedControl,
} from '@/components/ui';

type Mode = 'login' | 'signup';

const TABS = [
  { value: 'login', label: 'Entrar' },
  { value: 'signup', label: 'Cadastre-se' },
] as const;

function GoogleMark() {
  return (
    <View
      className="w-5 h-5 rounded-full bg-white items-center justify-center"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      }}
    >
      <Text style={{ color: '#4285F4', fontWeight: '900', fontSize: 12 }}>G</Text>
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithGoogle, loginWithEmail, signUp } = useAuth();
  const alert = useAlert();
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [healthConsent, setHealthConsent] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  async function handleForgotPassword() {
    const target = resetEmail.trim();
    if (!target) return; // o botão fica desabilitado; guarda defensiva
    setForgotLoading(true);
    try {
      await requestPasswordReset(target);
      setForgotOpen(false);
      // Rota nova: os tipos do expo-router só regeneram no prebuild/start, então
      // o cast via unknown é necessário até lá (a rota existe e resolve em runtime).
      router.push({
        pathname: '/(auth)/recuperar-senha',
        params: { email: target },
      } as unknown as Href);
    } catch (err) {
      alert.showError(err);
    } finally {
      setForgotLoading(false);
    }
  }

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const kbHeight = useKeyboardHeight();

  async function handleGoogle() {
    // No cadastro (aba "Cadastre-se") o Google cria conta → exige os 2 aceites.
    // No login (usuário returning) não re-pede consentimento.
    if (mode === 'signup' && (!acceptedTerms || !healthConsent)) {
      alert.showAlert({
        title: 'Marque os dois aceites',
        message:
          'Aceite os Termos de Uso e Contrato e autorize o tratamento dos dados de saúde pra criar sua conta com o Google.',
        type: 'warning',
      });
      return;
    }
    setLoading(true);
    try {
      await loginWithGoogle();
      await recordLegalAcceptanceSafe(); // auditoria do aceite — best-effort
    } catch (err) {
      alert.showError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
      } else {
        await signUp(fullName, email, password);
        await recordLegalAcceptanceSafe();
      }
    } catch (err) {
      alert.showError(err);
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    email.length > 3 &&
    password.length >= 8 &&
    (mode === 'login' ||
      (fullName.trim().length >= 2 && acceptedTerms && healthConsent));

  return (
    <Screen variant="hero" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={0}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingTop: 32,
            paddingBottom: 32 + (Platform.OS === 'android' ? kbHeight : 0),
          }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <View className="items-center mb-8">
            <View className="flex-row items-center gap-2 mb-5 rounded-full border border-border px-3 py-1.5 bg-surface-muted">
              <Sparkles size={12} color={colors.accent} />
              <Text className="text-text-dim text-[10px] tracking-[2px] uppercase">
                Performance inteligente
              </Text>
            </View>
            <Logo size="lg" />
            <Text className="text-text-dim text-[11px] tracking-[3px] uppercase mt-2">
              Biohacking · Nutrição · Treino
            </Text>
          </View>

          {!IS_EXPO_GO && (
            <View className="mb-5">
              <Button
                label="Continuar com Google"
                onPress={handleGoogle}
                variant="primary"
                size="lg"
                loading={loading}
                icon={<GoogleMark />}
              />
              <View className="flex-row items-center gap-3 mt-5">
                <View className="flex-1 h-px bg-border" />
                <Text className="text-text-muted text-[10px] uppercase tracking-widest">
                  ou
                </Text>
                <View className="flex-1 h-px bg-border" />
              </View>
            </View>
          )}

          <View className="mb-5">
            <SegmentedControl
              options={TABS}
              value={mode}
              onChange={(v) => {
                setMode(v);
                setPassword('');
              }}
            />
          </View>

          <View className="gap-3">
            {mode === 'signup' && (
              <Input
                value={fullName}
                onChangeText={setFullName}
                placeholder="Seu nome"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                leftIcon={<UserIcon size={18} color={colors.textMuted} />}
              />
            )}

            <Input
              ref={emailRef}
              value={email}
              onChangeText={setEmail}
              placeholder="voce@email.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              leftIcon={<Mail size={18} color={colors.textMuted} />}
            />

            <Input
              ref={passwordRef}
              value={password}
              onChangeText={setPassword}
              placeholder="Sua senha"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              leftIcon={<Lock size={18} color={colors.textMuted} />}
              rightAccessory={
                showPassword ? (
                  <EyeOff size={18} color={colors.textDim} />
                ) : (
                  <Eye size={18} color={colors.textDim} />
                )
              }
              onRightAccessoryPress={() => setShowPassword((v) => !v)}
            />

            {mode === 'signup' && (
              <Text className="text-text-muted text-[11px] px-1">
                Mínimo de 8 caracteres.
              </Text>
            )}

            {mode === 'signup' && (
              <View className="mt-1 gap-3">
                <TermsAcceptance
                  accepted={acceptedTerms}
                  onChange={setAcceptedTerms}
                />
                <HealthDataConsent
                  accepted={healthConsent}
                  onChange={setHealthConsent}
                />
              </View>
            )}

            <View className="mt-2">
              <Button
                label={mode === 'login' ? 'Entrar' : 'Criar conta'}
                onPress={handleSubmit}
                variant="primary"
                size="lg"
                loading={loading}
                disabled={!canSubmit}
              />
            </View>

            {mode === 'login' && (
              <Pressable
                onPress={() => {
                  setResetEmail(email);
                  setForgotOpen(true);
                }}
                hitSlop={6}
                className="self-center mt-1 px-2 py-1 active:opacity-70"
              >
                <Text className="text-violet-soft text-[12px] font-semibold">
                  Esqueci a senha
                </Text>
              </Pressable>
            )}
          </View>

          {IS_EXPO_GO && (
            <View className="mt-5 rounded-2xl bg-violet/10 border border-violet/30 px-4 py-3">
              <Text className="text-violet-soft text-[11px] leading-relaxed">
                💡 Você está no Expo Go. Login com Google fica disponível no APK
                (development build) do Persona Fit.
              </Text>
            </View>
          )}

          <View className="flex-row items-center gap-3 mt-7">
            <View className="flex-1 h-px bg-border" />
            <Text className="text-text-muted text-[10px] uppercase tracking-widest">
              Sou professor
            </Text>
            <View className="flex-1 h-px bg-border" />
          </View>

          <Pressable
            onPress={() => router.push('/(auth)/signup-professor' as Href)}
            className="mt-3 rounded-2xl border border-violet/40 bg-violet/5 px-4 py-3 active:opacity-70"
          >
            <View className="flex-row items-center gap-3">
              <View className="h-9 w-9 rounded-xl bg-violet/15 border border-violet/40 items-center justify-center">
                <GraduationCap size={16} color={colors.violetSoft} />
              </View>
              <View className="flex-1">
                <Text className="text-text text-sm font-semibold">
                  Criar conta de professor
                </Text>
                <Text className="text-text-muted text-[11px] mt-0.5">
                  Cadastre alunos e monte treinos com a IA.
                </Text>
              </View>
            </View>
          </Pressable>

          <Text className="text-text-muted text-[11px] text-center mt-8 leading-relaxed px-2">
            Ao continuar, você concorda em tratar as recomendações como
            informativas. Decisões de saúde devem ser validadas com
            profissionais.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Esqueci a senha"
        message="Enviaremos um código de 6 dígitos pra este e-mail pra você definir uma nova senha."
        content={
          <View className="w-full mt-4">
            <Input
              value={resetEmail}
              onChangeText={setResetEmail}
              placeholder="voce@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              leftIcon={<Mail size={18} color={colors.textMuted} />}
            />
          </View>
        }
        actions={[
          {
            label: 'Enviar código',
            variant: 'primary',
            onPress: handleForgotPassword,
            loading: forgotLoading,
            disabled: !resetEmail.trim(),
          },
          {
            label: 'Cancelar',
            variant: 'ghost',
            onPress: () => setForgotOpen(false),
          },
        ]}
      />
    </Screen>
  );
}
