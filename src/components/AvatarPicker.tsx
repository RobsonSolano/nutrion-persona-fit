import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImageIcon, Trash2 } from 'lucide-react-native';
import { Avatar } from '@/components/ui';
import { useRemoveAvatar, useUploadAvatar } from '@/hooks/useAvatar';
import { colors } from '@/lib/theme';
import { friendlyMessage } from '@/lib/friendlyError';

type Props = {
  avatarUrl: string | null;
  name: string | null;
  /** Tamanho do avatar (default 96). */
  size?: number;
};

export default function AvatarPicker({
  avatarUrl,
  name,
  size = 96,
}: Props) {
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const [picking, setPicking] = useState(false);

  const busy = picking || upload.isPending || remove.isPending;

  async function pick(source: 'camera' | 'library') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permissão necessária',
        `Precisamos acesso à ${source === 'camera' ? 'câmera' : 'galeria'} pra atualizar a foto.`,
      );
      return;
    }
    const launcher =
      source === 'camera'
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;
    setPicking(true);
    try {
      const picked = await launcher({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        exif: false,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      await upload.mutateAsync(picked.assets[0].uri);
    } catch (err) {
      Alert.alert(
        'Não consegui atualizar',
        friendlyMessage(err),
      );
    } finally {
      setPicking(false);
    }
  }

  function confirmRemove() {
    Alert.alert(
      'Remover foto?',
      'A foto atual será apagada.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove.mutateAsync();
            } catch (err) {
              Alert.alert(
                'Não consegui remover',
                friendlyMessage(err),
              );
            }
          },
        },
      ],
    );
  }

  return (
    <View className="items-center gap-3">
      <View>
        <Avatar url={avatarUrl} name={name} size={size} />
        {busy && (
          <View
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: size / 2,
              backgroundColor: 'rgba(0,0,0,0.5)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
      </View>
      <View className="flex-row gap-2">
        <ActionButton
          icon={<Camera size={14} color={colors.text} />}
          label="Câmera"
          onPress={() => pick('camera')}
          disabled={busy}
        />
        <ActionButton
          icon={<ImageIcon size={14} color={colors.text} />}
          label="Galeria"
          onPress={() => pick('library')}
          disabled={busy}
        />
        {avatarUrl && (
          <ActionButton
            icon={<Trash2 size={14} color={colors.danger} />}
            label="Remover"
            onPress={confirmRemove}
            disabled={busy}
            danger
          />
        )}
      </View>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-row items-center gap-1.5 rounded-2xl border px-3 py-2 active:opacity-70 ${
        danger ? 'border-border bg-surface' : 'border-border bg-surface-raised'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {icon}
      <Text
        className={`text-xs font-semibold ${danger ? 'text-danger' : 'text-text'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
