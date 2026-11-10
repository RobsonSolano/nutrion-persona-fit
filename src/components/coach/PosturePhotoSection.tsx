import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Camera, Image as ImageIcon, Plus, X } from 'lucide-react-native';
import {
  deletePosturePhoto,
  getPosturePhotoSignedUrl,
  uploadPosturePhoto,
} from '@/services/physicalAssessments';
import { useUpdatePhysicalAssessment } from '@/hooks/usePhysicalAssessments';
import { colors } from '@/lib/theme';
import { friendlyMessage } from '@/lib/friendlyError';

const MAX_PHOTOS = 6;
const TARGET_WIDTH = 1280;

type Props = {
  assessmentId: string;
  studentId: string;
  photos: string[];
  editable: boolean;
};

export default function PosturePhotoSection({
  assessmentId,
  studentId,
  photos,
  editable,
}: Props) {
  const updateM = useUpdatePhysicalAssessment();
  const [busy, setBusy] = useState(false);

  async function handlePick(source: 'camera' | 'library') {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert(
        'Limite atingido',
        `Cada avaliação aceita até ${MAX_PHOTOS} fotos posturais.`,
      );
      return;
    }
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permissão necessária',
        `Precisamos acesso à ${source === 'camera' ? 'câmera' : 'galeria'} pra anexar fotos posturais.`,
      );
      return;
    }
    const launcher =
      source === 'camera'
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;
    setBusy(true);
    try {
      const picked = await launcher({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        exif: false,
        allowsEditing: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      // Resize + JPEG pra caber no limite de 5MB do bucket com folga
      const resized = await manipulateAsync(
        asset.uri,
        asset.width > TARGET_WIDTH
          ? [{ resize: { width: TARGET_WIDTH } }]
          : [],
        { compress: 0.85, format: SaveFormat.JPEG },
      );
      const path = await uploadPosturePhoto({
        studentId,
        assessmentId,
        index: nextIndex(photos),
        localUri: resized.uri,
        contentType: 'image/jpeg',
      });
      await updateM.mutateAsync({
        assessmentId,
        studentId,
        patch: { posture_photos: [...photos, path] },
      });
    } catch (err) {
      Alert.alert(
        'Não consegui enviar',
        friendlyMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(path: string) {
    setBusy(true);
    try {
      await deletePosturePhoto(path);
      await updateM.mutateAsync({
        assessmentId,
        studentId,
        patch: { posture_photos: photos.filter((p) => p !== path) },
      });
    } catch (err) {
      Alert.alert(
        'Não consegui remover',
        friendlyMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  if (photos.length === 0 && !editable) return null;

  return (
    <View>
      <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
        Fotos posturais
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {photos.map((path) => (
          <PhotoTile
            key={path}
            path={path}
            editable={editable}
            onRemove={() => handleRemove(path)}
          />
        ))}
        {editable && photos.length < MAX_PHOTOS && (
          <View className="flex-row gap-2">
            <AddTile
              icon={<Camera size={18} color={colors.accent} />}
              label="Câmera"
              onPress={() => handlePick('camera')}
              disabled={busy}
            />
            <AddTile
              icon={<ImageIcon size={18} color={colors.accent} />}
              label="Galeria"
              onPress={() => handlePick('library')}
              disabled={busy}
            />
          </View>
        )}
      </View>
      {busy && (
        <View className="flex-row items-center gap-2 mt-3">
          <ActivityIndicator color={colors.accent} size="small" />
          <Text className="text-text-muted text-xs">Processando…</Text>
        </View>
      )}
      {editable && (
        <Text className="text-text-muted text-[11px] mt-3 leading-relaxed">
          Sugestão: frente, costas, lateral direita e lateral esquerda.
        </Text>
      )}
    </View>
  );
}

// =====================================================================
// Tile com signed URL (lazy)
// =====================================================================
function PhotoTile({
  path,
  editable,
  onRemove,
}: {
  path: string;
  editable: boolean;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPosturePhotoSignedUrl(path)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <View
      className="rounded-xl overflow-hidden border border-border bg-surface-muted"
      style={{ width: 92, height: 92 }}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      ) : error ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-text-muted text-[10px] text-center px-1">
            Falhou
          </Text>
        </View>
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.textMuted} size="small" />
        </View>
      )}
      {editable && (
        <Pressable
          onPress={onRemove}
          hitSlop={6}
          className="absolute top-1 right-1 h-6 w-6 rounded-full bg-bg-deep/80 items-center justify-center border border-border"
        >
          <X size={12} color={colors.danger} />
        </Pressable>
      )}
    </View>
  );
}

function AddTile({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`rounded-xl border border-dashed border-border-strong bg-surface-muted items-center justify-center ${
        disabled ? 'opacity-50' : 'active:opacity-70'
      }`}
      style={{ width: 92, height: 92 }}
    >
      <Plus size={16} color={colors.accent} />
      <View className="mt-1">{icon}</View>
      <Text className="text-text-dim text-[10px] mt-1">{label}</Text>
    </Pressable>
  );
}

// =====================================================================
// Helpers
// =====================================================================
function nextIndex(photos: string[]): number {
  // Extrai os índices dos paths existentes (pattern: <student>/<assessment>/<n>.jpg)
  const taken = new Set(
    photos
      .map((p) => {
        const last = p.split('/').pop() ?? '';
        const m = last.match(/^(\d+)\./);
        return m ? Number(m[1]) : null;
      })
      .filter((v): v is number => v != null),
  );
  let i = 0;
  while (taken.has(i)) i++;
  return i;
}
