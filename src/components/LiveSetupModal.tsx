import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { Feather } from '@expo/vector-icons';
import { useLive } from '../contexts/LiveContext';
import { useTheme } from '../contexts/ThemeContext';

export default function LiveSetupModal() {
  const { colors, isDark } = useTheme();
  const {
    isSetupOpen,
    closeSetup,
    startLive,
    localStream,
    setupError,
    openSetup,
    collaborationEnabled,
    setCollaborationEnabled,
  } = useLive();

  const [title, setTitle] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  // Re-render when the stream arrives so RTCView picks it up
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (localStream) forceUpdate((n) => n + 1);
  }, [localStream]);

  const handleStart = async () => {
    if (!title.trim()) return;
    setIsStarting(true);
    await startLive(title.trim());
    setIsStarting(false);
  };

  const streamURL =
    localStream && typeof (localStream as any).toURL === 'function'
      ? (localStream as any).toURL()
      : null;

  return (
    <Modal
      visible={isSetupOpen}
      transparent
      animationType="fade"
      onRequestClose={closeSetup}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.card,
            { backgroundColor: isDark ? '#1f2937' : '#fff' },
          ]}
        >
          <Text style={[styles.title, { color: colors.text }]}>Go Live</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Share a live moment with your Circle.
          </Text>

          {/* Camera preview */}
          <View style={styles.preview}>
            {streamURL ? (
              <RTCView
                streamURL={streamURL}
                style={styles.previewVideo}
                objectFit="cover"
                mirror
              />
            ) : (
              <View style={styles.previewLoading}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.previewText}>Starting camera…</Text>
              </View>
            )}
          </View>

          {/* Title input */}
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? '#111827' : '#f3f4f6',
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="What's happening? (e.g. Studio session, Q&A…)"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />

          {/* Collaboration toggle */}
          <View style={styles.toggleRow}>
            <Switch
              value={collaborationEnabled}
              onValueChange={setCollaborationEnabled}
              trackColor={{ false: '#d1d5db', true: colors.primary }}
              thumbColor="white"
            />
            <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
              Enable collaboration (up to 4 broadcasters)
            </Text>
          </View>

          {/* Error */}
          {setupError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{setupError}</Text>
              <TouchableOpacity
                style={styles.retrySmall}
                onPress={() => {
                  closeSetup();
                  setTimeout(() => openSetup(), 300);
                }}
              >
                <Text style={styles.retrySmallText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Start button */}
          <TouchableOpacity
            style={[
              styles.startButton,
              {
                opacity:
                  isStarting || !title.trim() || !!setupError ? 0.5 : 1,
              },
            ]}
            onPress={handleStart}
            disabled={isStarting || !title.trim() || !!setupError}
            activeOpacity={0.85}
          >
            {isStarting ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Feather name="radio" size={16} color="white" />
                <Text style={styles.startText}>Go Live</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity onPress={closeSetup} style={styles.cancelButton}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    padding: 20,
  },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 2, marginBottom: 14 },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#000',
    overflow: 'hidden',
    marginBottom: 14,
  },
  previewVideo: { width: '100%', height: '100%', transform: [{ scaleX: -1 }] },
  previewLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  previewText: { color: '#fff', fontSize: 12 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  toggleText: { fontSize: 13, flex: 1 },
  errorBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: { flex: 1, color: '#ef4444', fontSize: 13 },
  retrySmall: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#ef4444',
  },
  retrySmallText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  startButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#ef4444',
  },
  startText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelButton: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontSize: 14 },
});