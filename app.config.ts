import type { ExpoConfig } from 'expo/config';

// Quando rodando em Expo Go (npm run start:go), o Expo injeta EXPO_PUBLIC_PROJECT_EXPO_GO.
// Mais confiável: o argv contém "--go".
const IS_EXPO_GO =
  process.argv.includes('--go') || process.env.EXPO_GO === '1';

const plugins: ExpoConfig['plugins'] = [
  'expo-router',
  'expo-secure-store',
  [
    'expo-image-picker',
    {
      photosPermission:
        'O Persona Fit precisa acessar suas fotos para analisar refeições.',
      cameraPermission:
        'O Persona Fit precisa da câmera para registrar pratos em tempo real.',
    },
  ],
  // Sentry plugin desabilitado temporariamente — upload de source maps
  // estava falhando no build EAS (sentry-cli exit 1). SDK do Sentry no JS
  // (src/lib/sentry.ts) continua funcionando e capturando exceptions; só
  // perdemos source map mapping de stack traces nativos. Reativar quando
  // o token tiver escopo correto (project:releases + org:read).
  // [
  //   '@sentry/react-native/expo',
  //   {
  //     organization: 'solanusdev',
  //     project: 'nutrion',
  //   },
  // ],
];

// @react-native-google-signin tem código nativo customizado: só entra
// em builds customizadas (dev build / preview / production), nunca em Expo Go.
if (!IS_EXPO_GO) {
  plugins.push('@react-native-google-signin/google-signin');
}

const config: ExpoConfig = {
  name: 'Persona Fit',
  slug: 'nutrion',
  scheme: 'nutrion',
  version: '1.4.0',
  // Destravado por recomendação do Play Console (telas grandes): app travado
  // em portrait é tratado como não-adaptativo em tablet e foldable. Nada no
  // app declara `resizeableActivity=false` — a trava de orientação era a
  // única coisa restringindo.
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#000000',
  },
  android: {
    package: 'br.com.nutrion',
    versionCode: 1,
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#000000',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },
  plugins,
  experiments: {
    typedRoutes: true,
  },
  // OTA updates via EAS Update.
  // runtimeVersion=appVersion: updates só atingem builds da mesma version.
  // Quando subir version (ex: 1.0.0 -> 1.1.0) é porque mudou algo nativo,
  // o APK velho fica preso no último JS compatível dele.
  runtimeVersion: {
    policy: 'appVersion',
  },
  updates: {
    url: 'https://u.expo.dev/6aed6bd3-078e-4424-b7e1-5d4afbd9d624',
    fallbackToCacheTimeout: 0,
  },
  extra: {
    eas: {
      projectId: '6aed6bd3-078e-4424-b7e1-5d4afbd9d624',
    },
    // URL pública da Política de Privacidade (exigida pela Google Play / App Store).
    // Deve casar com legal_documents.privacidade (seed em 20260622020000_legal_docs.sql).
    privacyPolicyUrl: 'https://apppersonafit.vercel.app/legal/privacidade',
    // "O que há de novo" exibido no modal de OTA. ATUALIZAR ANTES DE CADA
    // `eas update` — o texto viaja no manifest daquela publicação. Se ficar
    // desatualizado ou vazio, o modal cai no aviso genérico (sem erro).
    // Viajam no manifest deste update e são exibidas pelo bundle que JÁ está
    // no aparelho. Ou seja: quem estiver num bundle sem a feature de notas
    // (tudo publicado antes de 2026-08-26) vê o modal genérico — as notas
    // aparecem do update seguinte em diante.
    releaseNotes: {
      novidades: [],
      melhorias: [],
      ajustes: [
        'Treino aplicado por template aparece na hora no plano do aluno',
        'Geração de plano por IA mais estável (troca de modelo se um falhar)',
      ],
    },
  },
};

export default config;
