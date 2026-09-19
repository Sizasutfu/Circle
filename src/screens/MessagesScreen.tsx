import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useWs } from '../contexts/WsContext';
import { Avatar } from '../components/Avatar';
import VerificationBadge from '../components/VerificationBadge';
import { useTabBarHeight } from '../hooks/useTabBarHeight';
import api from '../api/client';
import { timeAgo } from '../utils/helpers';
import { resolveMediaUrl } from '../lib/media';

interface Conversation {
  id: string;
  other_id: string;
  other_name: string;
  other_picture?: string;
  other_verified?: boolean;
  last_message: string;
  last_sender_id: string;
  last_message_at: string;
  last_media_type?: string;
  unread_count: number;
  is_encrypted?: boolean;
}

// How long we wait for a "stop typing" event before auto-clearing.
// Matches the server's own timeout in wsServer.js.
const TYPING_TIMEOUT_MS = 4000;

// ── Inline three-dot indicator used in the preview line ──
function TypingPreview({ color }: { color: string }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const make = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 300,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 300,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.delay(450 - delay),
        ])
      );

    const a1 = make(dot1, 0);
    const a2 = make(dot2, 150);
    const a3 = make(dot3, 300);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  const dotStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [
      { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
    ],
  });

  return (
    <View style={styles.typingRow}>
      <Text style={[styles.typingLabel, { color }]}>typing</Text>
      <Animated.View style={[styles.typingDot, { backgroundColor: color }, dotStyle(dot1)]} />
      <Animated.View style={[styles.typingDot, { backgroundColor: color }, dotStyle(dot2)]} />
      <Animated.View style={[styles.typingDot, { backgroundColor: color }, dotStyle(dot3)]} />
    </View>
  );
}

export default function MessagesScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { registerHandler } = useWs();
  const queryClient = useQueryClient();
  const { contentBottomPadding } = useTabBarHeight();
  const [refreshing, setRefreshing] = useState(false);

  // Set of conversation ids whose other participant is currently typing.
  // We auto-clear each entry if we don't hear from them again within
  // TYPING_TIMEOUT_MS, mirroring the server's own timeout so a dropped
  // "stop typing" event can't leave a stale indicator on screen.
  const [typingConversations, setTypingConversations] = useState<Set<string>>(new Set());
  const typingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const {
    data: conversations = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dm-inbox'],
    queryFn: async () => {
      try {
        const response = await api.get('/dm/inbox');
        const data = Array.isArray(response.data) ? response.data : response.data.data || [];
        return data as Conversation[];
      } catch (error) {
        console.error('Error fetching inbox:', error);
        return [];
      }
    },
    enabled: !!user,
  });

  // ── Typing indicator handling ──
  const clearTyping = (conversationId: string) => {
    const timer = typingTimeoutsRef.current.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      typingTimeoutsRef.current.delete(conversationId);
    }
    setTypingConversations((prev) => {
      if (!prev.has(conversationId)) return prev;
      const next = new Set(prev);
      next.delete(conversationId);
      return next;
    });
  };

  const markTyping = (conversationId: string) => {
    const existing = typingTimeoutsRef.current.get(conversationId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      clearTyping(conversationId);
    }, TYPING_TIMEOUT_MS);
    typingTimeoutsRef.current.set(conversationId, timer);

    setTypingConversations((prev) => {
      if (prev.has(conversationId)) return prev;
      const next = new Set(prev);
      next.add(conversationId);
      return next;
    });
  };

  useEffect(() => {
    const unregisterTyping = registerHandler('typing', (data: any) => {
      const conversationId = String(data?.conversationId ?? '');
      if (!conversationId) return;

      // Ignore our own typing events (we don't want "typing…" on our own row)
      if (data?.userId != null && user?.id != null && String(data.userId) === String(user.id)) {
        return;
      }

      if (data.isTyping) {
        markTyping(conversationId);
      } else {
        clearTyping(conversationId);
      }
    });

    // When a message actually lands, clear the indicator immediately —
    // the server may not always emit a matching stop event.
    const unregisterNewDm = registerHandler('new_dm', (data: any) => {
      const conversationId = String(data?.conversationId ?? '');
      if (!conversationId) return;
      clearTyping(conversationId);
      // Refresh the inbox so the new message preview + ordering update
      queryClient.invalidateQueries({ queryKey: ['dm-inbox'] });
    });

    return () => {
      unregisterTyping();
      unregisterNewDm();
      // Clean up any pending timers on unmount
      typingTimeoutsRef.current.forEach((t) => clearTimeout(t));
      typingTimeoutsRef.current.clear();
    };
  }, [registerHandler, user?.id, queryClient]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const openConversation = (conversation: Conversation) => {
    (navigation.navigate as any)('ChatDetail', {
      conversationId: conversation.id,
      otherUserId: conversation.other_id,
      otherName: conversation.other_name,
      otherPicture: conversation.other_picture,
    });
  };

  const handleNewMessage = () => {
    (navigation.navigate as any)('NewMessage');
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const isUnread = item.unread_count > 0;
    const isMine = item.last_sender_id === user?.id;
    const preview = isMine ? `You: ${item.last_message || 'Media'}` : item.last_message || 'Media';
    const time = timeAgo(item.last_message_at);
    const isTyping = typingConversations.has(String(item.id));

    const avatarUrl = resolveMediaUrl(item.other_picture);
    // Coerce to a real boolean — the API sends other_verified as 0/1 from
    // MySQL, and `0 && (...)` evaluates to the number 0, which React Native
    // tries to render as a bare text node outside a <Text>.
    const isVerified = !!item.other_verified;

    // When someone is typing, the preview line shows the animated dots
    // instead of the last message. The unread tint still wins so an
    // unread thread doesn't lose its highlight just because it's being
    // typed in — but the message preview is overridden either way.
    const showTyping = isTyping;

    return (
      <TouchableOpacity
        style={[
          styles.conversationItem,
          { backgroundColor: colors.background },
          isUnread && { backgroundColor: isDark ? '#1f2937' : '#f0f4ff' },
        ]}
        onPress={() => openConversation(item)}
        activeOpacity={0.7}
      >
        <Avatar source={avatarUrl} size={50} />
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <View style={styles.nameRow}>
              <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                {item.other_name}
              </Text>
              {isVerified && (
                <VerificationBadge
                  size={14}
                  color={colors.primary}
                  style={styles.verifiedBadge}
                />
              )}
            </View>
            <Text
              style={[
                styles.timestamp,
                { color: isUnread ? colors.primary : colors.textMuted },
              ]}
            >
              {time}
            </Text>
          </View>

          {showTyping ? (
            <TypingPreview color={colors.primary} />
          ) : (
            <Text
              style={[
                styles.lastMessage,
                { color: colors.textSecondary },
                isUnread && { color: colors.text, fontWeight: '700' },
              ]}
              numberOfLines={1}
            >
              {item.last_media_type === 'image' ? '📷 Image' :
               item.last_media_type === 'video' ? '🎬 Video' :
               item.last_media_type === 'audio' ? '🎵 Audio' :
               preview}
            </Text>
          )}
        </View>
        {isUnread && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Feather name="message-circle" size={48} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No messages yet</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Start a conversation with someone!</Text>
      <TouchableOpacity style={[styles.emptyButton, { backgroundColor: colors.primary }]} onPress={handleNewMessage}>
        <Text style={styles.emptyButtonText}>New Message</Text>
      </TouchableOpacity>
    </View>
  );

  if (!user) {
    return (
      <SafeAreaView style={[styles.placeholderContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <Feather name="lock" size={48} color={colors.textMuted} />
        <Text style={[styles.placeholderTitle, { color: colors.text }]}>Not signed in</Text>
        <Text style={[styles.placeholderSubtitle, { color: colors.textSecondary }]}>
          Sign in to view your messages.
        </Text>
        <TouchableOpacity
          style={[styles.signInButton, { backgroundColor: colors.primary }]}
          onPress={() => (navigation.navigate as any)('Login')}
        >
          <Text style={styles.signInButtonText}>Sign In</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={[styles.errorContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <Feather name="alert-circle" size={48} color="#ef4444" />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Failed to load messages</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={handleRefresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
        <TouchableOpacity onPress={handleNewMessage} style={styles.newButton}>
          <Feather name="edit-2" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderConversation}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: contentBottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  placeholderTitle: { fontSize: 20, fontWeight: '600', marginTop: 16 },
  placeholderSubtitle: { fontSize: 14, textAlign: 'center', marginTop: 8 },
  signInButton: { marginTop: 24, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  signInButtonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  retryButton: { marginTop: 20, paddingHorizontal: 32, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  newButton: { padding: 6 },
  listContent: { paddingTop: 8 },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  conversationContent: { flex: 1, marginLeft: 12 },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  userName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  verifiedBadge: { marginLeft: 4 },
  timestamp: { fontSize: 12 },
  lastMessage: { fontSize: 14, marginTop: 2 },

  // ── Typing indicator ──
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 3,
    height: 18,
  },
  typingLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: 2,
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  emptySubtitle: { fontSize: 14, marginTop: 4 },
  emptyButton: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  emptyButtonText: { color: 'white', fontWeight: '600', fontSize: 14 },
});