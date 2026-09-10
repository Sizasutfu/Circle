import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useWhisper, WhisperMessage } from '../contexts/WhisperContext';
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

  // Copy link via the system share sheet (no expo-clipboard needed)
  const handleCopyLink = async () => {
    const url = `${PUBLIC_WEB_URL}/whisper/send/${settings.link_slug}`;
    try {
      await Share.share({ message: url, url });
    } catch {
      // user dismissed — no-op
    }
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

  // Reply & Post requires react-native-view-shot — needs a rebuilt dev client
  const handleReplyPress = () => {
    Alert.alert(
      'Coming soon',
      'Reply & Post needs a rebuilt dev client. Rebuild the app to enable this feature.'
    );
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
            style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: 0.5 }]}
            onPress={handleReplyPress}
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
                  <Feather name="share-2" size={14} color={colors.primary} />
                  <Text style={[styles.smallBtnText, { color: colors.primary }]}>Share</Text>
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
  linkCard: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  linkLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  linkUrl: { fontSize: 13, fontWeight: '600' },
  linkActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  smallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: 'rgba(108,99,255,0.1)',
  },
  smallBtnText: { fontSize: 12, fontWeight: '700' },

  card: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  anonBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  anonText: { color: '#8b5cf6', fontSize: 11, fontWeight: '700' },
  time: { fontSize: 11 },
  postedLabel: { fontSize: 11, color: '#22c55e', fontWeight: '600' },
  message: { fontSize: 15, lineHeight: 22 },
  actions: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, justifyContent: 'flex-end',
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  primaryBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  iconBtn: { padding: 8 },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 6, paddingHorizontal: 32 },

  loadMore: { padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginTop: 12 },
});