import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, RefreshControl, Share, Modal, TextInput, Image, ScrollView, KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useWhisper, WhisperMessage } from '../contexts/WhisperContext';
import WhisperCardPreview from '../components/WhisperCardPreview';
import { generateWhisperCard } from '../lib/whisperCard';
import api from '../api/client';
import { timeAgo } from '../utils/helpers';

// Public base URL for shareable links (your web app)
const PUBLIC_WEB_URL = 'https://your-web-app.com'; // ← change to your real URL

export default function WhisperInboxScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const {
    messages, loading, hasMore, fetchInbox, deleteMessage, reportMessage,
    settings, fetchSettings, updateSettings, regenerateSlug,
  } = useWhisper();

  const [refreshing, setRefreshing] = useState(false);
  const [replyTarget, setReplyTarget] = useState<WhisperMessage | null>(null);
  const [replyText, setReplyText] = useState('');
  const [posting, setPosting] = useState(false);

  // Hidden card view for capture
  const cardRef = useRef<View>(null);
  const [cardData, setCardData] = useState<{ message: string; username: string } | null>(null);

  useEffect(() => {
    if (user) {
      fetchSettings();
      fetchInbox();
    }
  }, [user, fetchSettings, fetchInbox]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchSettings(), fetchInbox()]);
    setRefreshing(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMessage(id) },
    ]);
  };

  const handleReport = async (id: string) => {
    try {
      await reportMessage(id);
      Alert.alert('Reported', 'Thanks for keeping Circle safe.');
    } catch {
      Alert.alert('Error', 'Failed to report message.');
    }
  };

  const handleCopyLink = async () => {
    const url = `${PUBLIC_WEB_URL}/whisper/send/${settings.link_slug}`;
    await Clipboard.setStringAsync(url);
    Alert.alert('Copied', 'Whisper link copied to clipboard.');
  };

  const handleRegenerate = () => {
    Alert.alert(
      'Generate new link?',
      'Your old link will stop working.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            try { await regenerateSlug(); }
            catch { Alert.alert('Error', 'Failed to regenerate link.'); }
          },
        },
      ]
    );
  };

  // ── Post flow: capture the hidden card, upload, mark posted ──
  const handlePost = async () => {
    if (!replyTarget || !replyText.trim() || !user) return;
    setPosting(true);

    try {
      // 1. Render the card view with the whisper text
      setCardData({ message: replyTarget.message, username: user.username });

      // 2. Wait for the next frame so the view is mounted
      await new Promise(r => setTimeout(r, 250));

      // 3. Capture it to a PNG file
      const uri = await generateWhisperCard(cardRef);

      // 4. Upload as FormData
      const formData = new FormData();
      formData.append('text', replyText.trim());
      formData.append('image', {
        uri,
        name: `whisper-${replyTarget.id}.png`,
        type: 'image/png',
      } as any);

      await api.post(`/whisper/${replyTarget.id}/post`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // 5. Mark posted locally
      setReplyTarget(null);
      setReplyText('');
      setCardData(null);
      await fetchInbox();

      Alert.alert('Posted', 'Your reply is live on the feed.');
    } catch (err: any) {
      console.error('Whisper post failed:', err);
      Alert.alert('Error', err?.response?.data?.message || 'Failed to post. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const renderItem = ({ item }: { item: WhisperMessage }) => (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.anonBadge, { backgroundColor: isDark ? '#2d1a4a' : '#ede9fe' }]}>
          <Feather name="user" size={12} color="#8b5cf6" />
          <Text style={styles.anonText}>Anonymous</Text>
        </View>
        <Text style={[styles.time, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
        {item.posted && <Text style={styles.postedLabel}>✓ Posted</Text>}
      </View>

      <Text style={[styles.message, { color: colors.text }]}>{item.message}</Text>

      <View style={styles.actions}>
        {!item.posted && (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setReplyTarget(item); setReplyText(''); }}
          >
            <Feather name="message-circle" size={14} color="white" />
            <Text style={styles.primaryBtnText}>Reply & Post</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.iconBtn}>
          <Feather name="trash-2" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleReport(item.id)} style={styles.iconBtn}>
          <Feather name="alert-triangle" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const publicLink = `${PUBLIC_WEB_URL}/whisper/send/${settings.link_slug}`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Whisper Inbox</Text>
        <View style={styles.toggleRow}>
          <Text style={[styles.toggleLabel, { color: colors.textSecondary }]}>Accepting</Text>
          <TouchableOpacity
            onPress={() => updateSettings(!settings.enabled)}
            style={[
              styles.toggle,
              { backgroundColor: settings.enabled ? colors.primary : colors.border },
            ]}
          >
            <View style={[styles.toggleKnob, { left: settings.enabled ? 22 : 2 }]} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={[styles.linkCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.linkLabel, { color: colors.textMuted }]}>YOUR WHISPER LINK</Text>
            <Text style={[styles.linkUrl, { color: colors.primary }]} numberOfLines={1}>
              {settings.link_slug ? publicLink : 'No link generated yet.'}
            </Text>
            <View style={styles.linkActions}>
              {!!settings.link_slug && (
                <TouchableOpacity onPress={handleCopyLink} style={styles.smallBtn}>
                  <Feather name="copy" size={14} color={colors.primary} />
                  <Text style={[styles.smallBtnText, { color: colors.primary }]}>Copy</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleRegenerate} style={styles.smallBtn}>
                <Feather name="refresh-cw" size={14} color={colors.text} />
                <Text style={[styles.smallBtnText, { color: colors.text }]}>New link</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Feather name="message-square" size={56} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No whispers yet</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Share your link to start receiving anonymous messages.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity
              style={[styles.loadMore, { borderColor: colors.border }]}
              onPress={() => fetchInbox()}
              disabled={loading}
            >
              <Text style={{ color: colors.textSecondary }}>
                {loading ? 'Loading…' : 'Load more'}
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {/* ── Hidden card view for capture (do NOT remove) ── */}
      {cardData && (
        <View style={styles.hidden}>
          <WhisperCardPreview ref={cardRef} message={cardData.message} username={cardData.username} />
        </View>
      )}

      {/* ── Reply modal ── */}
      <Modal visible={!!replyTarget} transparent animationType="slide" onRequestClose={() => setReplyTarget(null)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modal, { backgroundColor: colors.surface }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>✍️ Reply & Post</Text>
                <TouchableOpacity onPress={() => setReplyTarget(null)}>
                  <Feather name="x" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.modalContent}>
                {/* Preview bubble */}
                <View style={styles.previewBubble}>
                  <Text style={styles.previewLabel}>WHISPER ON CIRCLE</Text>
                  <Text style={styles.previewText}>"{replyTarget?.message}"</Text>
                </View>

                <TextInput
                  style={[styles.replyInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder="Your reply… this becomes the post caption"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={500}
                />
                <Text style={[styles.charCount, { color: colors.textMuted }]}>
                  {500 - replyText.length} left
                </Text>

                <TouchableOpacity
                  style={[styles.primaryBtnLg, { backgroundColor: colors.primary, opacity: posting || !replyText.trim() ? 0.5 : 1 }]}
                  onPress={handlePost}
                  disabled={posting || !replyText.trim()}
                >
                  {posting ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <Feather name="send" size={16} color="white" />
                      <Text style={styles.primaryBtnText}>Post to Circle feed</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleLabel: { fontSize: 12, fontWeight: '600' },
  toggle: { width: 44, height: 24, borderRadius: 12, justifyContent: 'center' },
  toggleKnob: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: 'white' },

  listContent: { padding: 16, paddingBottom: 32 },
  linkCard: {
    padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 16,
  },
  linkLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  linkUrl: { fontSize: 13, fontWeight: '600' },
  linkActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(108,99,255,0.1)' },
  smallBtnText: { fontSize: 12, fontWeight: '700' },

  card: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  anonBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  anonText: { color: '#8b5cf6', fontSize: 11, fontWeight: '700' },
  time: { fontSize: 11 },
  postedLabel: { fontSize: 11, color: '#22c55e', fontWeight: '600' },
  message: { fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, justifyContent: 'flex-end' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  primaryBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  iconBtn: { padding: 8 },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 6, paddingHorizontal: 32 },

  loadMore: { padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginTop: 12 },

  hidden: { position: 'absolute', left: -9999, top: -9999 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalContent: { padding: 16 },
  previewBubble: { backgroundColor: '#1a1030', borderRadius: 12, padding: 16, marginBottom: 16 },
  previewLabel: { color: '#a78bfa', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  previewText: { color: '#e2d9f3', fontSize: 15, fontStyle: 'italic' },
  replyInput: { minHeight: 90, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  charCount: { fontSize: 11, alignSelf: 'flex-end', marginTop: 4 },
  primaryBtnLg: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 24, marginTop: 16 },
});