import { Redirect, Stack, type Href } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useAutoRequestPushPermission } from '@/hooks/useAutoRequestPushPermission';

export default function CoachLayout() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const profileQ = useProfile();

  useAutoRequestPushPermission();

  if (isBootstrapping) return null;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  // Espera o profile carregar pra evitar flicker.
  if (profileQ.isLoading) return null;

  // Só professor entra aqui. Outros roles vão pras tabs (onde o gate
  // próprio deles redireciona pra onboarding se for o caso).
  if (profileQ.data && profileQ.data.role !== 'professor') {
    return <Redirect href={'/(tabs)' as Href} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#000000' },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="aluno/[id]/rotina/nova" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="templates/novo" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
