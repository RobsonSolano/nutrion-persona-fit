import { useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { compressImageForAI, ImageTooLargeError } from '@/lib/imageCompress';
import { friendlyMessage } from '@/lib/friendlyError';

type Source = 'camera' | 'library';

type Options = {
  /** Frase usada no alert de permissão. Ex: "analisar o prato". */
  purpose?: string;
};

export function useImagePicker(options: Options = {}) {
  const purpose = options.purpose ?? 'usar a foto';

  const [uri, setUri] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  async function pick(source: Source) {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permissão necessária',
        `Precisamos da permissão de ${source === 'camera' ? 'câmera' : 'galeria'} pra ${purpose}.`,
      );
      return;
    }
    const launcher =
      source === 'camera'
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;
    // Ativa preparing ANTES de abrir o launcher: em Androids mais lentos a
    // promise do picker pode demorar pra resolver depois do user confirmar
    // (gravação do arquivo, callback nativo). Sem isso, o user volta pro
    // form e vê tela "vazia" antes do loading aparecer — parece que falhou
    // e ele clica de novo.
    setPreparing(true);
    try {
      // quality 0.7 reduz drasticamente o JPEG bruto antes mesmo de chegar
      // na compressão — em câmeras 100MP+ a diferença é entre ~30MB e ~10MB.
      // exif=false economiza alguns bytes e evita metadados desnecessários.
      const picked = await launcher({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        exif: false,
        allowsEditing: false,
      });
      if (picked.canceled || !picked.assets?.[0]) {
        return;
      }
      const asset = picked.assets[0];
      const compressed = await compressImageForAI(asset.uri);
      setUri(compressed.uri);
      setBase64(compressed.base64);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      // ImageTooLargeError já traz texto nosso; o resto (erro do
      // ImageManipulator, do FS) passa pela tradução.
      const message =
        err instanceof ImageTooLargeError ? err.message : friendlyMessage(err);
      Alert.alert('Foto muito pesada', message);
    } finally {
      setPreparing(false);
    }
  }

  function clear() {
    setUri(null);
    setBase64(null);
  }

  return { uri, base64, preparing, pick, clear };
}
