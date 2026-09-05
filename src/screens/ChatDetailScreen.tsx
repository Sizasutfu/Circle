import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useWs } from '../contexts/WsContext';
import { Avatar } from '../components/Avatar';
import api from '../api/client';
import { timeAgo } from '../utils/helpers';
import { resolveMediaUrl } from '../lib/media';

// ── Types ──
interface RouteParams {
  conversationId: string;
  otherUserId: string;
  otherName: string;
  otherPicture?: string;
}

interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  is_read?: boolean;
  is_encrypted?: boolean;
  media_type?: string;
  media_url?: string;
  media_name?: string;
  media_size?: number;
  edited_at?: string;
  _plain?: string;
}

export default function ChatDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { 
    isAlive, 
    sendMessage, 
    registerHandler, 
    joinConversation, 
    leaveConversation, 
    sendTyping,
  } = useWs();

  const { conversationId, otherUserId, otherName, otherPicture } = route.params as RouteParams;

  // ✅ Resolve other user's avatar
  const otherAvatarUrl = resolveMediaUrl(otherPicture);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Presence: polled via REST, matching the web app's approach ──
  // The backend's WS layer doesn't broadcast user_online/user_offline/
  // presence events (confirmed against the web client, which never
  // listens for them either) — presence is derived server-side from
  // recent heartbeats and fetched per-conversation via
  // GET /dm/conversations/:id/presence. Poll it the same way the web
  // app's DmContext does: once on open, then every 30s.
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherLastActive, setOtherLastActive] = useState<string | null>(null);
  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const fetchPresence = useCallback(async () => {
    if (!conversationId) return;
    try {
      const response = await api.get(`/dm/conversations/${conversationId}/presence`);
      // getPresence returns via the standard sendOk envelope
      // ({ success, message, data: presence }), so the fields live under
      // response.data.data — not flat on response.data like the web
      // client's apiClient wrapper exposes them.
      const body = response.data?.data ?? response.data ?? {};
      setOtherOnline(!!body.online);
      setOtherLastActive(body.last_seen_at ?? body.lastSeenAt ?? null);
    } catch (error) {
      // Silent fail — leave whatever presence state we last had rather
      // than flipping to "offline" on a transient network hiccup.
    }
  }, [conversationId]);

  useEffect(() => {
    fetchPresence();
    presenceIntervalRef.current = setInterval(fetchPresence, 30000);
    return () => {
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current);
        presenceIntervalRef.current = null;
      }
    };
  }, [fetchPresence]);

  // ── Fetch messages ──
  const fetchMessages = useCallback(async (beforeId?: string) => {
    try {
      const url = beforeId 
        ? `/dm/conversations/${conversationId}/messages?limit=20&before_id=${beforeId}`
        : `/dm/conversations/${conversationId}/messages?limit=20`;
      
      const response = await api.get(url);
      const data = response.data;
      
      let msgs = [];
      let hasMoreData = false;
      
      if (data?.messages) {
        msgs = data.messages;
        hasMoreData = data.hasMore || false;
      } 
      else if (data?.data?.messages) {
        msgs = data.data.messages;
        hasMoreData = data.data.hasMore || false;
      } 
      else if (data?.data && Array.isArray(data.data)) {
        msgs = data.data;
        hasMoreData = msgs.length === 20;
      } 
      else if (Array.isArray(data)) {
        msgs = data;
        hasMoreData = msgs.length === 20;
      }
      else if (data?.results && Array.isArray(data.results)) {
        msgs = data.results;
        hasMoreData = data.hasMore || false;
      }
      else if (data?.items && Array.isArray(data.items)) {
        msgs = data.items;
        hasMoreData = data.hasMore || false;
      }
      
      return { messages: msgs, hasMore: hasMoreData };
    } catch (error) {
      console.error('Error fetching messages:', error);
      return { messages: [], hasMore: false };
    }
  }, [conversationId]);

  // ── Initial messages load ──
  useEffect(() => {
    const loadMessages = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchMessages();
        setMessages(result.messages);
        setHasMore(result.hasMore);
        if (result.messages.length > 0) {
          setCursor(result.messages[0].id);
          api.patch(`/dm/conversations/${conversationId}/read`).catch(() => {});
        }
      } catch (err) {
        console.error('Load error:', err);
        setError('Failed to load messages');
      } finally {
        setIsLoading(false);
      }
    };
    loadMessages();
  }, [conversationId, fetchMessages]);

  // ── Join conversation on mount ──
  useEffect(() => {
    if (conversationId) {
      joinConversation(conversationId);
    }
    return () => {
      if (conversationId) {
        leaveConversation(conversationId);
      }
    };
  }, [conversationId, joinConversation, leaveConversation]);

  // ── WebSocket handlers ──
  useEffect(() => {
    const unregNewMessage = registerHandler('new_dm', (data: any) => {
      if (data.conversationId === conversationId && data.message) {
        const msg = data.message;
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        api.patch(`/dm/conversations/${conversationId}/read`).catch(() => {});
      }
    });

    const unregTyping = registerHandler('typing', (data: any) => {
      if (data.conversationId === conversationId) {
        setTyping(data.isTyping);
        if (data.isTyping) {
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setTyping(false);
          }, 3000);
        }
      }
    });

    const unregMessageRead = registerHandler('message_read', (data: any) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId ? { ...m, is_read: true } : m
          )
        );
      }
    });

    return () => {
      unregNewMessage();
      unregTyping();
      unregMessageRead();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [conversationId, registerHandler]);

  // ── Poll for new messages ──
  useEffect(() => {
    const interval = setInterval(async () => {
      if (messages.length === 0) return;
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage) return;
      
      try {
        const response = await api.get(
          `/dm/conversations/${conversationId}/messages/new?after_id=${lastMessage.id}`
        );
        const newMsgs = response.data?.messages || response.data || [];
        if (newMsgs.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const filtered = newMsgs.filter((m: any) => !existingIds.has(m.id));
            return [...prev, ...filtered];
          });
          api.patch(`/dm/conversations/${conversationId}/read`).catch(() => {});
        }
      } catch (error) {
        // Silent fail
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [conversationId, messages]);

  // ── Send message ──
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSending(true);
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const tempMsg: Message = {
      id: tempId,
      sender_id: user?.id || '',
      body: trimmed,
      created_at: new Date().toISOString(),
      is_read: false,
    };
    setMessages((prev) => [...prev, tempMsg]);
    setInput('');

    try {
      const response = await api.post(`/dm/conversations/${conversationId}/messages`, {
        body: trimmed,
        media: null,
      });
      
      const saved = response.data?.data || response.data || response;
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      if (saved && saved.id) {
        setMessages((prev) => [...prev, saved]);
      }
      
      if (isAlive()) {
        sendMessage({
          type: 'send_message',
          conversationId: conversationId,
          message: saved,
        });
      }
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // ── Handle input change with typing indicator ──
  const handleInputChange = (text: string) => {
    setInput(text);
    if (!typing && isAlive()) {
      sendTyping(conversationId, true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(conversationId, false);
    }, 2000);
  };

  // ── Load more messages ──
  const loadMoreMessages = async () => {
    if (!hasMore || loadingMore || !cursor) return;
    setLoadingMore(true);
    try {
      const result = await fetchMessages(cursor);
      if (result.messages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = result.messages.filter((m: any) => !existingIds.has(m.id));
          return [...newMsgs, ...prev];
        });
        setCursor(result.messages[0]?.id || null);
      }
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Load more error:', error);
    }
    setLoadingMore(false);
  };

  // ── Render message ──
  const renderMessage = ({ item }: { item: Message }) => {
    const rawSenderId =
      item.sender_id ?? (item as any).senderId ?? (item as any).userId ?? (item as any).user_id;
    const isMine = rawSenderId != null && user?.id != null && String(rawSenderId) === String(user.id);
    const isTemp = String(item.id).startsWith('tmp_');
    const time = timeAgo(item.created_at);

    return (
      <View 
        style={[
          styles.messageRow,
          isMine ? styles.messageRowRight : styles.messageRowLeft,
        ]}
      >
        <View 
          style={[
            styles.messageBubble,
            isMine 
              ? [styles.bubbleRight, { backgroundColor: colors.primary }] 
              : [styles.bubbleLeft, { 
                  backgroundColor: isDark ? '#374151' : '#f3f4f6',
                  borderWidth: isDark ? 0 : 1,
                  borderColor: colors.border,
                }]
          ]}
        >
          <Text 
            style={[
              styles.messageText,
              { color: isMine ? 'white' : colors.text }
            ]}
          >
            {item.body || item._plain || '(empty message)'}
          </Text>
          <Text 
            style={[
              styles.messageTime,
              { color: isMine ? 'rgba(255,255,255,0.7)' : colors.textMuted }
            ]}
          >
            {time}
            {isTemp && ' (sending...)'}
            {item.is_read && isMine && !isTemp && ' ✓✓'}
          </Text>
        </View>
      </View>
    );
  };

  // ── Key extractor with unique keys ──
  const keyExtractor = useCallback((item: Message, index: number) => {
    return item.id ? `${item.id}-${index}` : `msg-${index}`;
  }, []);

  // ── Scroll to bottom on new messages ──
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <SafeAreaView style={[styles.errorContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <Feather name="alert-circle" size={48} color="#ef4444" />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Failed to load messages</Text>
        <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>{error}</Text>
        <TouchableOpacity 
          style={[styles.retryButton, { backgroundColor: colors.primary }]} 
          onPress={() => {
            setError(null);
            setIsLoading(true);
            fetchMessages().then(result => {
              setMessages(result.messages);
              setHasMore(result.hasMore);
              setIsLoading(false);
            }).catch(() => {
              setError('Failed to load messages');
              setIsLoading(false);
            });
          }}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* ─── Header ─── */}
      <View style={[styles.header, { 
        backgroundColor: colors.surface, 
        borderBottomColor: colors.border 
      }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.headerInfo} 
          onPress={() => (navigation.navigate as any)('Profile', { userId: otherUserId })}
        >
          <Avatar source={otherAvatarUrl} size={36} fallback={otherName || 'User'} />
          <View style={styles.headerText}>
            <Text style={[styles.headerName, { color: colors.text }]}>{otherName || 'User'}</Text>
            <View style={styles.headerStatus}>
              <View style={[styles.statusDot, { backgroundColor: typing ? '#22c55e' : (otherOnline ? '#22c55e' : colors.textMuted) }]} />
              <Text style={[styles.headerStatusText, { color: colors.textSecondary }]}>
                {typing ? 'Typing...' : (otherOnline ? 'Online' : 'Offline')}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <View style={styles.headerRight} />
      </View>

      {/* ─── Messages ─── */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={keyExtractor}
        renderItem={renderMessage}
        contentContainerStyle={[styles.messagesContainer, { backgroundColor: colors.background }]}
        onEndReached={loadMoreMessages}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          loadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        inverted={false}
        showsVerticalScrollIndicator={false}
      />

      {/* ─── Input Bar ─── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={[styles.inputBar, { 
          backgroundColor: colors.surface, 
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
        }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { 
              backgroundColor: colors.input || (isDark ? '#1f2937' : '#f3f4f6'), 
              color: colors.text 
            }]}
            placeholder="Type a message..."
            placeholderTextColor={colors.placeholder || '#9ca3af'}
            value={input}
            onChangeText={handleInputChange}
            multiline
            maxLength={500}
            editable={!sending}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: colors.primary },
              (!input.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
          >
            {sending ? (
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
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  headerText: {
    marginLeft: 10,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  headerStatusText: {
    fontSize: 12,
  },
  headerRight: {
    width: 40,
  },
  messagesContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexGrow: 1,
  },
  messageRow: {
    marginVertical: 3,
    flexDirection: 'row',
    width: '100%',
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleLeft: {
    borderBottomLeftRadius: 4,
  },
  bubbleRight: {
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  loadingMore: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});