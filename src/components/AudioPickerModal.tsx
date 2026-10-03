// src/components/AudioPickerModal.tsx
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../contexts/ThemeContext';

export interface PickedAudio {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (files: PickedAudio[]) => void;
};

// Accept audio by MIME type and by extension. Some Android builds
// ignore the MIME filter, so we also allow "*/*" and filter ourselves.
const ACCEPT = 'audio/*';

export default function AudioPickerModal({ visible, onClose, onPick }: Props) {
  const { colors, isDark } = useTheme();
  const [busy, setBusy] = useState(false);

  const handleBrowse = async () => {
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPT,
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        setBusy(false);
        onClose();
        return;
      }

      const files: PickedAudio[] = result.assets
        // Some file providers report mimeType as null or generic.
        // Fall back to extension check so we don't lose real audio.
        .filter((a) => {
          const mt = a.mimeType ?? '';
          if (mt.startsWith('audio/')) return true;
          return /\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i.test(a.name);
        })
        .map((a) => ({
          uri: a.uri,
          name: a.name,
          size: a.size,
          mimeType: a.mimeType ?? 'audio/mpeg',
        }));

      setBusy(false);
      onPick(files);
      onClose();
    } catch (e: any) {
      setBusy(false);
      console.warn('[AudioPicker] error:', e?.message ?? e);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            { backgroundColor: isDark ? '#1f2937' : '#ffffff' },
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: isDark ? '#374151' : '#eef2ff' },
            ]}
          >
            <Feather name="music" size={28} color={colors.primary} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Add audio files
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Pick one or more tracks from your device. Titles will be read from
            the filenames.
          </Text>

          <TouchableOpacity
            onPress={handleBrowse}
            disabled={busy}
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.primary },
              busy && { opacity: 0.6 },
            ]}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="folder" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Browse files</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 19, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 19,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: '100%',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { paddingVertical: 12, marginTop: 4 },
  cancelText: { fontSize: 14, fontWeight: '600' },
});