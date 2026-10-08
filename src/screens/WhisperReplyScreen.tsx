import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Dimensions,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useWhisper } from '../contexts/WhisperContext';
import api from '../api/client';

const HORIZONTAL_MARGIN = 24;
const CARD_WIDTH = Dimensions.get('window').width - HORIZONTAL_MARGIN * 2;
const MAX_REPLY = 280;
const BRAND_URL = 'www.circlenet.social';

type RouteParams = { whisperId: string };

export default function WhisperReplyScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<Record<string, RouteParams>, string>>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { messages, fetchInbox } = useWhisper();

  const insets = useSafeAreaInsets();

  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState<'save' | 'share' | 'post' | null>(null);
  const [kbHeight, setKbHeight] = useState(0);
  const cardRef = useRef<View>(null);

  const whisper = useMemo(
    () => messages.find((m) => m.id === route.params.whisperId),
    [messages, route.params.whisperId]
  );

  const handle = user?.username || user?.name || '';
  const canPost = !!reply.trim() && !busy && !!whisper;

  // Track keyboard height manually. Works on both platforms even with
  // Android 15 edge-to-edge, where KeyboardAvoidingView is unreliable.
  useEffect(() => {
    const showEvt =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, (e) =>
      setKbHeight(e.endCoordinates?.height ?? 0)
    );
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Capture the card as a PNG. Returns a file:// URI.
  const captureCard = async (): Promise<string> =>
    captureRef(cardRef, {
      format: 'png',
      quality: 0.95,
      result: 'tmpfile',
    });

  const handleSave = async () => {
    if (!whisper) return;
    setBusy('save');
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo access to save the card.');
        return;
      }
      const uri = await captureCard();
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'The whisper card has been saved to your photos.');
    } catch (err: any) {
      console.error('[WhisperReply] save error:', err);
      Alert.alert('Error', 'Could not save the card.');
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    if (!whisper) return;
    setBusy('share');
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Not available', 'Sharing is not available on this device.');
        return;
      }
      const uri = await captureCard();
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share whisper card',
      });
    } catch (err: any) {
      console.error('[WhisperReply] share error:', err);
      Alert.alert('Error', 'Could not share the card.');
    } finally {
      setBusy(null);
    }
  };

  const handlePost = async () => {
    if (!canPost || !whisper) return;
    setBusy('post');
    try {
      const uri = await captureCard();

      const formData = new FormData();
      formData.append('image', {
        uri,
        name: `whisper-reply-${whisper.id}.png`,
        type: 'image/png',
      } as any);
      formData.append('text', reply.trim());

      await api.post(`/whisper/${whisper.id}/post`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Server already flipped posted_as. Refresh the inbox so the badge appears.
      await fetchInbox();

      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });

      Alert.alert('Posted', 'Your reply is now live on your feed.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      console.error('[WhisperReply] post error:', err);
      Alert.alert(
        'Error',
        err?.response?.data?.message || 'Could not post your reply.'
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          disabled={!!busy}
          style={styles.headerBtn}
        >
          <Feather name="x" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Reply & Post
        </Text>

        <TouchableOpacity
          onPress={handlePost}
          disabled={!canPost}
          style={[
            styles.postBtn,
            { backgroundColor: colors.primary },
            !canPost && { opacity: 0.45 },
          ]}
        >
          {busy === 'post' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.postBtnText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Content area — paddingBottom = keyboard height pushes the input
          above the keyboard on both platforms. */}
      <View style={[styles.contentArea, { paddingBottom: kbHeight }]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Preview
          </Text>

          {!whisper ? (
            <View style={styles.notFound}>
              <Feather name="alert-circle" size={40} color={colors.textMuted} />
              <Text
                style={[styles.notFoundText, { color: colors.textSecondary }]}
              >
                Whisper not found.
              </Text>
            </View>
          ) : (
            <View ref={cardRef} collapsable={false} style={styles.captureTarget}>
              <LinearGradient
                colors={['#1a1030', '#2d1a4a', '#1a1030']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
              >
                <LinearGradient
                  colors={[
                    'rgba(139,92,246,0.35)',
                    'rgba(139,92,246,0.05)',
                    'rgba(139,92,246,0)',
                  ]}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.orb}
                  pointerEvents="none"
                />

                <Text style={styles.cardLabel}>💬  WHISPER ON CIRCLE</Text>
                <View style={styles.cardDivider} />
                <Text style={styles.whisperText}>"{whisper.message}"</Text>

                <View style={styles.cardFooter}>
                  <Text style={styles.brandText}>{BRAND_URL}</Text>
                  {!!handle && (
                    <Text style={styles.handleText}>@{handle}</Text>
                  )}
                </View>
              </LinearGradient>
            </View>
          )}

          <View style={styles.secondaryRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={handleSave}
              disabled={!!busy || !whisper}
              activeOpacity={0.7}
            >
              {busy === 'save' ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <>
                  <Feather name="download" size={16} color={colors.text} />
                  <Text style={[styles.secondaryText, { color: colors.text }]}>
                    Save
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={handleShare}
              disabled={!!busy || !whisper}
              activeOpacity={0.7}
            >
              {busy === 'share' ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <>
                  <Feather name="share-2" size={16} color={colors.text} />
                  <Text style={[styles.secondaryText, { color: colors.text }]}>
                    Share
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <Text style={[styles.captionLabel, { color: colors.textMuted }]}>
            YOUR REPLY
          </Text>
          <Text style={[styles.captionHint, { color: colors.textSecondary }]}>
            This becomes the caption on your post — it is not part of the card.
          </Text>
        </ScrollView>

        {/* Input bar — paddingBottom swaps between safe-area inset (keyboard
            down) and a small gap (keyboard up). */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: kbHeight > 0 ? 12 : Math.max(insets.bottom, 12),
            },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
                color: colors.text,
              },
            ]}
            placeholder="Write your reply…"
            placeholderTextColor={colors.placeholder}
            multiline
            maxLength={MAX_REPLY}
            value={reply}
            onChangeText={setReply}
            editable={!busy}
          />
          <Text style={[styles.counter, { color: colors.textMuted }]}>
            {reply.length}/{MAX_REPLY}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  postBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  contentArea: { flex: 1 },

  scrollContent: { paddingHorizontal: HORIZONTAL_MARGIN, paddingBottom: 24 },
  hint: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },

  captureTarget: {
    width: CARD_WIDTH,
    alignSelf: 'center',
  },
  card: {
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.35)',
    padding: 26,
    overflow: 'hidden',
    minHeight: 200,
    justifyContent: 'space-between',
  },
  orb: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  cardLabel: {
    color: '#a78bfa',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  cardDivider: {
    height: 1.5,
    backgroundColor: 'rgba(167,139,250,0.2)',
    marginBottom: 18,
  },
  whisperText: {
    color: '#e2d9f3',
    fontSize: 18,
    lineHeight: 28,
    fontStyle: 'italic',
    fontWeight: '500',
    flexShrink: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
  },
  brandText: {
    color: 'rgba(167,139,250,0.5)',
    fontSize: 11,
    fontWeight: '500',
  },
  handleText: {
    color: 'rgba(244,243,248,0.5)',
    fontSize: 11,
    fontWeight: '500',
  },

  notFound: { alignItems: 'center', marginTop: 60, gap: 12 },
  notFoundText: { fontSize: 14 },

  secondaryRow: { flexDirection: 'row', gap: 12, marginTop: 22 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  secondaryText: { fontSize: 14, fontWeight: '600' },

  captionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 28,
    marginBottom: 4,
  },
  captionHint: { fontSize: 12, lineHeight: 17, marginBottom: 8 },

  inputBar: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  input: {
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 22,
    fontSize: 15,
  },
  counter: {
    fontSize: 10,
    textAlign: 'right',
    marginTop: 4,
    marginRight: 8,
    fontVariant: ['tabular-nums'],
  },
});