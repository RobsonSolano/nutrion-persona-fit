import { Alert, Linking } from 'react-native';
import { resolveExerciseVideoUrl } from './youtubeUrl';

/**
 * Abre a demonstração do exercício: o vídeo que o professor salvou e, na
 * falta dele, uma busca no YouTube pelo nome.
 *
 * Só https. A versão anterior tentava `vnd.youtube://results?search_query=`
 * antes do web: o `canOpenURL` devolve true porque o app do YouTube registra
 * o esquema `vnd.youtube`, mas ele não sabe interpretar esse caminho — e o
 * resultado era cair na HOME do YouTube. Em Android o app link de
 * `youtube.com` já roteia pro app quando ele está instalado, e em iOS o
 * universal link sempre fez isso. Não há ganho em adivinhar esquema.
 */
export async function openExerciseVideo(params: {
  videoUrl?: string | null;
  exerciseName: string;
}): Promise<void> {
  const url = resolveExerciseVideoUrl(params);
  try {
    await Linking.openURL(url);
  } catch (err) {
    // Caminho quase inalcançável: falha de openURL com https significa
    // aparelho sem navegador. Alert nativo aqui porque este módulo não é
    // componente e não alcança o GlobalAlertProvider.
    Alert.alert(
      'Não consegui abrir',
      err instanceof Error ? err.message : 'Tente novamente.',
    );
  }
}
