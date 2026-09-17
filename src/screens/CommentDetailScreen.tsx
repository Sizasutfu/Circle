import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import VerificationBadge from '../components/VerificationBadge';
import api from '../api/client';
import { timeAgo } from '../utils/helpers';
import { resolveMediaUrl } from '../lib/media';

// ===== TYPES =====
interface RouteParams {
  commentId: string;
  postId?: string;
}

interface Comment {
  id: string;
  text: string;
  createdAt: string;
  parentId?: string | null;
  replies?: Comment[];
  user: {
    id: string;
    name: string;
    username: string;
    avatar?: string | null;
    verified?: boolean;
  };
}

interface FlatComment extends Comment {
  _depth: number;
}

// ===== COMPONENT =====
export default function CommentDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { commentId, postId: initialPostId } = route.params as RouteParams;
  const { user: currentUser } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [commentText, setCommentText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Keyboard visibility for dynamic padding
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ---- Normalize comment (recursive for replies) ----
  const normalizeComment = (c: any): Comment => {
    const rawUser = c.user || {};
    const rawReplies = Array.isArray(c.replies) ? c.replies : [];

    return {
      id: String(c.id || ''),
      text: c.text || c.content || '',
      createdAt: c.createdAt || c.created_at || new Date().toISOString(),
      parentId: c.parentId ?? c.parent_id ?? null,
      replies: rawReplies.map(normalizeComment),
      user: {
        id: String(rawUser.id || c.userId || c.user_id || ''),
        name:
          rawUser.name ||
          c.name ||
          rawUser.username ||
          c.username ||
          'Anonymous',
        username: rawUser.username || c.username || '',
        avatar: resolveMediaUrl(
          rawUser.avatar ||
            rawUser.picture ||
            c.picture ||
            c.avatar ||
            null
        ),
        verified: !!(rawUser.verified || c.verified),
      },
    };
  };

  // ---- Fetch comment thread ----
  const {
    data: thread,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['comment-thread', commentId],
    queryFn: async () => {
      console.log('📦 Fetching comment thread:', commentId);
      const response = await api.get(`/comments/${commentId}/thread`);
      console.log('📦 Comment thread response:', JSON.stringify(response.data, null, 2));

      const body = response.data?.data ?? response.data ?? {};
      const raw = body.comment ?? body;

      return {
        comment: normalizeComment(raw),
        postId: body.postId ?? raw.postId ?? initialPostId ?? null,
      };
    },
    enabled: !!commentId,
  });

  const rootComment = thread?.comment;
  const postId = thread?.postId ?? initialPostId;

  // ---- Flatten replies for FlatList ----
  const flatten = (comments: Comment[], depth = 0): FlatComment[] => {
    const out: FlatComment[] = [];
    for (const c of comments) {
      out.push({ ...c, _depth: depth });
      if (c.replies?.length) out.push(...flatten(c.replies, depth + 1));
    }
    return out;
  };
  const flatReplies = rootComment?.replies ? flatten(rootComment.replies) : [];

  // ---- Add reply ----
  const addReplyMutation = useMutation({
    mutationFn: async ({ text, parentId }: { text: string; parentId: string }) => {
      const response = await api.post(`/comments/${parentId}/reply`, { text });
      return response.data;
    },
    onSuccess: () => {
      refetch();
      setCommentText('');
      setReplyingTo(null);
      Keyboard.dismiss();
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.message || 'Failed to post reply.');
    },
  });

  const handleSend = async () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;

    if (!currentUser) {
      Alert.alert('Sign In Required', 'Please log in to reply.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log In', onPress: () => (navigation.navigate as any)('Login') },
      ]);
      return;
    }

    // Reply target: the comment the user tapped, or the root comment
    const parentId = replyingTo?.id ?? rootComment?.id;
    if (!parentId) return;

    setIsSending(true);
    try {
      await addReplyMutation.mutateAsync({ text: trimmed, parentId: String(parentId) });
      inputRef.current?.blur();
    } catch (err) {
      console.warn('Reply failed:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleReplyPress = (comment: Comment) => {
    if (!currentUser) {
      Alert.alert('Sign In Required', 'Please log in to reply.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log In', onPress: () => (navigation.navigate as any)('Login') },
      ]);
      return;
    }
    setReplyingTo(comment);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const cancelReply = () => setReplyingTo(null);

  // ---- Render root comment as header card ----
  const renderRootComment = () => {
    if (!rootComment) return null;
    const u = rootComment.user;

    return (
      <View style={styles.rootCard}>
        <View style={styles.rootHeader}>
          <TouchableOpacity
            onPress={() => (navigation.navigate as any)('Profile', { userId: u.id })}
            style={styles.rootAvatar}
          >
            <Avatar source={u.avatar} size={48} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <TouchableOpacity
              onPress={() => (navigation.navigate as any)('Profile', { userId: u.id })}
              style={styles.nameRow}
            >
              <Text style={[styles.rootName, { color: colors.text }]} numberOfLines={1}>
                {u.name}
              </Text>
              {u.verified && (
                <VerificationBadge
                  size={14}
                  color={colors.primary}
                  style={styles.verifiedBadge}
                />
              )}
            </TouchableOpacity>
            {!!u.username && (
              <Text style={[styles.rootUsername, { color: colors.textSecondary }]}>
                @{u.username}
              </Text>
            )}
          </View>
        </View>

        <Text style={[styles.rootText, { color: colors.text }]}>{rootComment.text}</Text>

        <Text style={[styles.rootTime, { color: colors.textMuted }]}>
          {timeAgo(rootComment.createdAt)}
        </Text>

        <View style={styles.rootActions}>
          <TouchableOpacity
            style={styles.rootAction}
            onPress={() => handleReplyPress(rootComment)}
          >
            <Feather name="corner-down-right" size={16} color={colors.primary} />
            <Text style={[styles.rootActionText, { color: colors.primary }]}>Reply</Text>
          </TouchableOpacity>
          {postId && (
            <TouchableOpacity
              style={styles.rootAction}
              onPress={() => (navigation.navigate as any)('PostDetail', { postId })}
            >
              <Feather name="external-link" size={16} color={colors.textSecondary} />
              <Text style={[styles.rootActionText, { color: colors.textSecondary }]}>
                View post
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Replies header */}
        {flatReplies.length > 0 && (
          <Text style={[styles.repliesHeader, { color: colors.textSecondary }]}>
            {flatReplies.length} {flatReplies.length === 1 ? 'reply' : 'replies'}
          </Text>
        )}
      </View>
    );
  };

  // ---- Render reply row ----
  const renderReply = ({ item }: { item: FlatComment }) => {
    const u = item.user;
    const indent = Math.min(item._depth, 3) * 20;

    return (
      <View
        style={[
          styles.replyItem,
          { paddingLeft: 16 + indent },
        ]}
      >
        <TouchableOpacity
          onPress={() => (navigation.navigate as any)('Profile', { userId: u.id })}
        >
          <Avatar source={u.avatar} size={32} />
        </TouchableOpacity>
        <View style={styles.replyContent}>
          <View style={styles.replyHeader}>
            <Text style={[styles.replyName, { color: colors.text }]} numberOfLines={1}>
              {u.name}
            </Text>
            {u.verified && (
              <VerificationBadge
                size={12}
                color={colors.primary}
                style={styles.verifiedBadgeSmall}
              />
            )}
            {!!u.username && (
              <Text style={[styles.replyUsername, { color: colors.textSecondary }]}>
                @{u.username}
              </Text>
            )}
            <Text style={[styles.replyTime, { color: colors.textMuted }]}>
              · {timeAgo(item.createdAt)}
            </Text>
          </View>

          {/* If this reply is a nested reply, show who it's replying to */}
          {item._depth > 0 && item.parentId && (
            <Text style={[styles.replyingToLine, { color: colors.textMuted }]} numberOfLines={1}>
              Replying to{' '}
              <Text style={{ color: colors.primary }}>
                @{flatReplies.find((r) => r.id === String(item.parentId))?.user.username || 'someone'}
              </Text>
            </Text>
          )}

          <Text style={[styles.replyText, { color: colors.text }]}>{item.text}</Text>

          <TouchableOpacity
            style={styles.replyButton}
            onPress={() => handleReplyPress(item)}
            activeOpacity={0.6}
          >
            <Feather name="corner-down-right" size={13} color={colors.textMuted} />
            <Text style={[styles.replyButtonText, { color: colors.textMuted }]}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEmptyReplies = () => (
    <View style={styles.emptyReplies}>
      <Feather name="message-circle" size={40} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No replies yet</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        Be the first to reply
      </Text>
    </View>
  );

  // ---- Loading state ----
  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Comment</Text>
          <View style={{ width: 32 }} />
        </View>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  // ---- Error state ----
  if (isError || !rootComment) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Comment</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={48} color="#ef4444" />
          <Text style={[styles.errorTitle, { color: colors.text }]}>Comment not found</Text>
          <TouchableOpacity
            style={[styles.goBackButton, { backgroundColor: colors.primary }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.goBackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ---- Main render ----
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <KeyboardAvoidingView
        style={styles.flexContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Comment</Text>
          <View style={{ width: 32 }} />
        </View>

        <FlatList
          data={flatReplies}
          keyExtractor={(i) => i.id}
          renderItem={renderReply}
          ListHeaderComponent={renderRootComment}
          ListEmptyComponent={renderEmptyReplies}
          contentContainerStyle={[styles.listContent, { backgroundColor: colors.background }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />

        {/* Reply banner */}
        {replyingTo && (
          <View
            style={[
              styles.replyBanner,
              { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' },
            ]}
          >
            <Feather name="corner-down-right" size={16} color={colors.primary} />
            <Text
              style={[styles.replyBannerText, { color: colors.text }]}
              numberOfLines={1}
            >
              Replying to{' '}
              <Text style={{ color: colors.primary, fontWeight: '600' }}>
                @{replyingTo.user.username || replyingTo.user.name}
              </Text>
            </Text>
            <TouchableOpacity onPress={cancelReply} style={styles.replyBannerClose}>
              <Feather name="x" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.background,
              paddingBottom: keyboardVisible ? 0 : Math.max(insets.bottom, 8),
            },
          ]}
        >
          <TextInput
            ref={inputRef}
            style={[
              styles.input,
              { backgroundColor: colors.input, color: colors.text },
            ]}
            placeholder={
              replyingTo
                ? `Reply to @${replyingTo.user.username || replyingTo.user.name}...`
                : 'Add a reply...'
            }
            placeholderTextColor={colors.placeholder}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={500}
            editable={!isSending}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: colors.primary },
              (!commentText.trim() || isSending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!commentText.trim() || isSending}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Feather name="send" size={18} color="white" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flexContainer: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },

  listContent: { paddingBottom: 24 },

  // ── Root comment card ──
  rootCard: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  rootHeader: { flexDirection: 'row', alignItems: 'center' },
  rootAvatar: { marginRight: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  rootName: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  verifiedBadge: { marginLeft: 4 },
  verifiedBadgeSmall: { marginLeft: 3 },
  rootUsername: { fontSize: 13, marginTop: 1 },
  rootText: { fontSize: 17, lineHeight: 24, marginTop: 12 },
  rootTime: { fontSize: 12, marginTop: 8 },
  rootActions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 14,
    paddingTop: 12,
  },
  rootAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rootActionText: { fontSize: 13, fontWeight: '600' },

  repliesHeader: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
  },

  // ── Reply rows ──
  replyItem: {
    flexDirection: 'row',
    paddingRight: 16,
    paddingVertical: 12,
  },
  replyContent: { flex: 1, marginLeft: 10 },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  replyName: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  replyUsername: { fontSize: 12, marginLeft: 4 },
  replyTime: { fontSize: 11, marginLeft: 6 },
  replyingToLine: { fontSize: 11, marginTop: 2 },
  replyText: { fontSize: 14, marginTop: 2, lineHeight: 20 },
  replyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  replyButtonText: { fontSize: 12, fontWeight: '600' },

  // ── Empty replies ──
  emptyReplies: { paddingVertical: 48, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '600', marginTop: 12 },
  emptySubtitle: { fontSize: 13, marginTop: 4 },

  // ── Reply banner ──
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  replyBannerText: { flex: 1, fontSize: 13 },
  replyBannerClose: { padding: 4 },

  // ── Input bar ──
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 56,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: { opacity: 0.5 },

  // ── Error ──
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  goBackButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  goBackText: { color: 'white', fontWeight: '600' },
});