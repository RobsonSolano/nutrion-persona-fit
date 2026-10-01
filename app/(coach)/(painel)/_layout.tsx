import { Tabs } from 'expo-router';
import { Home, Users, UserCog } from 'lucide-react-native';
import { Platform, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';

/**
 * Abas do painel do professor. Antes tudo pendurava na home num scroll só —
 * a lista de alunos, os atalhos, as configurações e o logout no mesmo lugar.
 *
 * As rotas de detalhe (aluno/[id], templates, contratações…) continuam no
 * Stack do (coach) e empilham por cima destas abas.
 */
export default function CoachPainelLayout() {
  const insets = useSafeAreaInsets();

  const baseHeight = 78;
  const tabBarHeight = baseHeight + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor:
            Platform.OS === 'android' ? 'rgba(7,8,11,0.94)' : 'transparent',
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: tabBarHeight,
          paddingTop: 12,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 14,
          elevation: 0,
        },
        tabBarItemStyle: { paddingVertical: 4 },
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
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
        name="alunos"
        options={{
          title: 'Alunos',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <Users color={color} size={22} strokeWidth={focused ? 2.5 : 2} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <UserCog color={color} size={22} strokeWidth={focused ? 2.5 : 2} />
            </TabIcon>
          ),
        }}
      />
    </Tabs>
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
