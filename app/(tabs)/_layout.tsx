import { Redirect, Tabs, type Href } from 'expo-router';
import { Home, MessageCircle, Dumbbell, User } from 'lucide-react-native';
import { Platform, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useUnreadStudentRequests } from '@/hooks/useRequests';
import { useAutoRequestPushPermission } from '@/hooks/useAutoRequestPushPermission';
import { useActiveWorkoutHeartbeat } from '@/hooks/useActiveWorkoutHeartbeat';
import { useStudentSuspension } from '@/hooks/useStudentSuspension';
import { PendingWorkoutModal } from '@/components/workout/PendingWorkoutModal';
import EnrollmentOutcomeGate from '@/components/coach/EnrollmentOutcomeGate';
import { StudentAnnouncementGate } from '@/components/AnnouncementGate';
import { useUiStore } from '@/stores/useUiStore';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const profileQ = useProfile();
  const isPromotingProfessor = useUiStore((s) => s.isPromotingProfessor);
  const unreadQ = useUnreadStudentRequests();
  const insets = useSafeAreaInsets();
  const isStudent = profileQ.data?.role === 'aluno';
  const suspension = useStudentSuspension(isStudent);
  const unreadCount = isStudent ? unreadQ.data ?? 0 : 0;

  useAutoRequestPushPermission();
  useActiveWorkoutHeartbeat();

  if (isBootstrapping) return null;
  // Trava redirects enquanto signup-professor está em curso (evita
  // ver onboarding piscar antes da promoção a role=professor).
  if (isPromotingProfessor) return null;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  // Gate do onboarding: espera o profile carregar pra evitar flicker das tabs.
  if (profileQ.isLoading) return null;

  // Professor não usa as tabs do app — vai pra área do professor.
  if (profileQ.data?.role === 'professor') {
    return <Redirect href={'/(coach)' as Href} />;
  }

  // Aluno suspenso: bloqueio total (acesso liberado só pelo professor/upgrade).
  if (isStudent) {
    if (suspension.isChecking) return null;
    if (suspension.suspended) return <Redirect href={'/suspended' as Href} />;
  }

  if (
    profileQ.data &&
    !profileQ.data.onboarding_completed_at &&
    !profileQ.data.onboarding_skipped_at
  ) {
    return <Redirect href={'/onboarding' as Href} />;
  }

  const baseHeight = 78;
  const tabBarHeight = baseHeight + insets.bottom;

  return (
    <>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: Platform.OS === 'android'
            ? 'rgba(7,8,11,0.94)'
            : 'transparent',
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: tabBarHeight,
          paddingTop: 12,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 14,
          elevation: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        tabBarBackground:
          Platform.OS === 'ios'
            ? () => (
                <BlurView
                  intensity={60}
                  tint="dark"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  }}
                />
              )
            : undefined,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <Home color={color} size={22} strokeWidth={focused ? 2.5 : 2} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <MessageCircle color={color} size={22} strokeWidth={focused ? 2.5 : 2} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="treino"
        options={{
          title: 'Treino',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <Dumbbell color={color} size={22} strokeWidth={focused ? 2.5 : 2} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.accent,
            color: colors.textInverse,
            fontSize: 10,
            fontWeight: '700',
            minWidth: 18,
            height: 18,
            lineHeight: 16,
          },
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <User color={color} size={22} strokeWidth={focused ? 2.5 : 2} />
            </TabIcon>
          ),
        }}
      />
    </Tabs>
    <PendingWorkoutModal />
    <EnrollmentOutcomeGate />
    <StudentAnnouncementGate />
    </>
  );
}

function TabIcon({
  focused,
  children,
}: {
  focused: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        width: 48,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? 'rgba(57,255,20,0.12)' : 'transparent',
      }}
    >
      {children}
    </View>
  );
}
