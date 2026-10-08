import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  Keyboard,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from './Avatar';
import VerificationBadge from './VerificationBadge';
import { timeAgo } from '../utils/helpers';
import api from '../api/client';
import {
  Comment,
  FlatComment,
  extractCommentsFromResponse,
  flattenComments,
} from '../lib/comments';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.78, 640);

// Low-end / small-screen devices (e.g. Samsung A03 Core, Android 11 Go)
// default to `adjustPan` behavior instead of `adjustResize`. The OS
// pans the whole screen visually, so our bottom-anchored sheet doesn't
// shift the way it should. We compensate by adding extra bottom offset
// when the keyboard is up on these devices.
const IS_SMALL_DEVICE = SCREEN_HEIGHT < 720;
const EXTRA_KEYBOARD_PADDING = IS_SMALL_DEVICE ? 120 : 0;

interface CommentSheetProps {
  visible: boolean;
  onClose: () => void;
  postId: string;
  commentCount?: number;
}

export default function CommentSheet({
  visible,
  onClose,
  postId,
  commentCount = 0,
}: CommentSheetProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<FlatComment>>(null);

  // ── Fetch comments when the sheet opens ──
  useEffect(() => {
    if (!visible || !postId) return;

    let cancelled = false;
    setLoading(true);
    setError(false);
    setText('');
    setReplyingTo(null);

    api
      .get(`/posts/${postId}/comments`)
      .then((res) => {
        if (cancelled) return;
        setComments(extractCommentsFromResponse(res.data));
      })
      .catch((err) => {
        if (cancelled) return;
        console.log('[CommentSheet] fetch error:', err?.response?.status);
        setError(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, postId]);

  // ── Keyboard height tracking ──
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      const h = e.endCoordinates?.height ?? 0;
      console.log('[CommentSheet] keyboardDidShow height:', h);
      setKbHeight(h);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKbHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Reset when the sheet closes
  useEffect(() => {
    if (!visible) setKbHeight(0);
  }, [visible]);

  // ── Post a comment / reply ──
  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !postId) return;

    if (!user) {
      Alert.alert('Sign In Required', 'Please log in to comment.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log In', onPress: () => (navigation.navigate as any)('Login') },
      ]);
      return;
    }

    setSending(true);
    try {
      const body: any = { text: trimmed };
      if (replyingTo) body.parentId = replyingTo.id;

      await api.post(`/posts/${postId}/comment`, body);

      const refetch = await api.get(`/posts/${postId}/comments`);
      setComments(extractCommentsFromResponse(refetch.data));

      setText('');
      setReplyingTo(null);
      Keyboard.dismiss();

      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 120);
    } catch (err: any) {
      Alert.alert(
        'Error',
        err?.response?.data?.message || 'Could not post comment.'
      );
    } finally {
      setSending(false);
    }
  };

  const handleReply = (comment: Comment) => {
    setReplyingTo(comment);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const cancelReply = () => setReplyingTo(null);

  const handleViewAll = () => {
    onClose();
    setTimeout(() => {
      (navigation.navigate as any)('PostDetail', { postId });
    }, 180);
  };

  const flatComments = flattenComments(comments);
  const count = flatComments.length || commentCount;
  const keyboardUp = kbHeight > 0;

  const renderComment = ({ item }: { item: FlatComment }) => {
    const u = item.user || { id: '', name: 'Unknown', username: '', avatar: null };
    const isReply = item._depth > 0;
    const indent = Math.min(item._depth, 3) * 20;

    return (
      <View
        style={[
          styles.commentRow,
          { paddingLeft: 16 + indent, paddingRight: 16 },
        ]}
      >
        <Avatar source={u.avatar} size={isReply ? 28 : 34} />
        <View style={styles.commentBody}>
          <View style={styles.commentHeader}>
            <Text
              style={[styles.commentName, { color: colors.text }]}
              numberOfLines={1}
            >
              {u.name}
            </Text>
            {u.verified && (
              <VerificationBadge size={12} style={{ marginLeft: 4 }} />
            )}
            {!!u.username && (
              <Text
                style={[styles.commentUsername, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                @{u.username}
              </Text>
            )}
            <Text style={[styles.commentTime, { color: colors.textMuted }]}>
              · {timeAgo(item.createdAt)}
            </Text>
          </View>

          <Text style={[styles.commentText, { color: colors.text }]}>
            {item.text}
          </Text>

          <TouchableOpacity
            style={styles.replyBtn}
            onPress={() => handleReply(item)}
            activeOpacity={0.6}
            hitSlop={6}
          >
            <Feather name="corner-down-right" size={12} color={colors.textMuted} />
            <Text style={[styles.replyBtnText, { color: colors.textMuted }]}>
              Reply
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.centeredState}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centeredState}>
          <Feather name="alert-circle" size={32} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Couldn't load comments
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.centeredState}>
        <Feather name="message-circle" size={36} color={colors.textMuted} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          No comments yet
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          Be the first to say something
        </Text>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* Backdrop */}
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (keyboardUp) {
              Keyboard.dismiss();
            } else {
              onClose();
            }
          }}
        />

        {/* Sheet — absolute bottom-anchored. `bottom` shifts it up by the
            reported keyboard height, plus a small-device compensation for
            Go Edition devices that use adjustPan instead of adjustResize. */}
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              height: SHEET_HEIGHT,
              bottom: kbHeight + (keyboardUp ? EXTRA_KEYBOARD_PADDING : 0),
              paddingBottom: keyboardUp ? 8 : Math.max(insets.bottom, 8),
            },
          ]}
        >
          <View style={styles.handleWrap}>
            <View
              style={[
                styles.handle,
                { backgroundColor: isDark ? '#3a3f45' : '#cfd9de' },
              ]}
            />
          </View>

          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Feather name="x" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {count} {count === 1 ? 'Comment' : 'Comments'}
            </Text>
            <TouchableOpacity onPress={handleViewAll} style={styles.headerBtn}>
              <Feather name="maximize-2" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <FlatList
            ref={listRef}
            data={flatComments}
            keyExtractor={(item, index) => item.id || `c-${index}`}
            renderItem={renderComment}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={
              flatComments.length === 0
                ? styles.listEmptyContent
                : styles.listContent
            }
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          />

          {replyingTo && (
            <View
              style={[
                styles.replyBanner,
                { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' },
              ]}
            >
              <Feather
                name="corner-down-right"
                size={14}
                color={colors.primary}
              />
              <Text
                style={[styles.replyBannerText, { color: colors.text }]}
                numberOfLines={1}
              >
                Replying to{' '}
                <Text style={{ color: colors.primary, fontWeight: '600' }}>
                  @{replyingTo.user.username || replyingTo.user.name}
                </Text>
              </Text>
              <TouchableOpacity
                onPress={cancelReply}
                style={styles.replyBannerClose}
              >
                <Feather name="x" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.inputBar, { borderTopColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
                  color: colors.text,
                },
              ]}
              placeholder={
                replyingTo
                  ? `Reply to @${replyingTo.user.username || replyingTo.user.name}…`
                  : 'Add a comment…'
              }
              placeholderTextColor={colors.placeholder}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
              editable={!sending}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: colors.primary },
                (!text.trim() || sending) && { opacity: 0.45 },
              ]}
              onPress={handleSubmit}
              disabled={!text.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="send" size={16} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 6 },
  headerTitle: { fontSize: 15, fontWeight: '700' },

  listContent: { paddingVertical: 8 },
  listEmptyContent: { flexGrow: 1, justifyContent: 'center' },

  commentRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    gap: 10,
  },
  commentBody: { flex: 1, minWidth: 0 },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  commentName: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  commentUsername: { fontSize: 12, marginLeft: 4, flexShrink: 1 },
  commentTime: { fontSize: 11, marginLeft: 4 },
  commentText: { fontSize: 14, lineHeight: 19, marginTop: 3 },
  replyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  replyBtnText: { fontSize: 12, fontWeight: '600' },

  centeredState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
  emptySubtitle: { fontSize: 13 },

  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  replyBannerText: { flex: 1, fontSize: 12 },
  replyBannerClose: { padding: 4 },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 20,
    fontSize: 15,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});