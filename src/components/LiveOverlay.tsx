import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RTCView } from 'react-native-webrtc';
import { Feather } from '@expo/vector-icons';
import { useLive } from '../../contexts/LiveContext';
import { useTheme } from '../../contexts/ThemeContext';

const REACTIONS = ['❤️', '🔥', '👏', '😂'];
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Floating heart animation ──
function FloatingHeart({ x, y, onComplete }: { x: number; y: number; onComplete: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start(() => onComplete());
  }, [anim, onComplete]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -120],
  });
  const opacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1.3],
  });

  return (
    <Animated.Text
      style={[
        styles.floatingHeart,
        { left: x, top: y, opacity, transform: [{ translateY }, { scale }] },
      ]}
      pointerEvents="none"
    >
      ❤️
    </Animated.Text>
  );
}

// ── Floating emoji reaction ──
function FloatingEmoji({ emoji, x, onComplete }: { emoji: string; x: number; onComplete: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 2500,
      useNativeDriver: true,
    }).start(() => onComplete());
  }, [anim, onComplete]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -SCREEN_HEIGHT * 0.55],
  });
  const opacity = anim.interpolate({
    inputRange: [0, 0.9, 1],
    outputRange: [1, 0.4, 0],
  });

  return (
    <Animated.Text
      style={[
        styles.floatingEmoji,
        {
          left: (x / 100) * SCREEN_WIDTH,
          bottom: 100,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="none"
    >
      {emoji}
    </Animated.Text>
  );
}

export default function LiveOverlay() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    role,
    sessionId,
    title,
    broadcasterName,
    broadcasterAvatar,
    viewerCount,
    chatMessages,
    localStream,
    broadcasters,
    isBroadcaster,
    requestingToBroadcast,
    pendingRequests,
    micMuted,
    camOff,
    isOverlayOpen,
    closeLive,
    toggleMic,
    toggleCam,
    sendChat,
    sendReaction,
    watchSession,
    floatingReactions,
    likeCount,
    sendLike,
    requestBroadcast,
    approveRequest,
    rejectRequest,
  } = useLive();

  const [chatInput, setChatInput] = useState('');
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [showRequests, setShowRequests] = useState(false);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  const isViewer = role === 'viewer';

  // Auto-scroll chat
  useEffect(() => {
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [chatMessages]);

  // Timeout for viewer waiting for stream
  useEffect(() => {
    if (isViewer && broadcasters.length === 0) {
      const t = setTimeout(() => setLoadingTimeout(true), 5000);
      return () => clearTimeout(t);
    }
    setLoadingTimeout(false);
  }, [isViewer, broadcasters]);

  // Reset local overlay state when overlay toggles
  useEffect(() => {
    if (isOverlayOpen) {
      setHearts([]);
      setShowRequests(false);
      setLoadingTimeout(false);
    }
  }, [isOverlayOpen]);

  if (!isOverlayOpen) return null;

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChat(chatInput.trim());
    setChatInput('');
  };

  const handleVideoTap = (e: any) => {
    if (isBroadcaster) return;
    const { locationX, locationY } = e.nativeEvent;
    const id = Date.now() + Math.random();
    setHearts((prev) => [...prev, { id, x: locationX, y: locationY }]);
    sendLike();
  };

  const removeHeart = (id: number) =>
    setHearts((prev) => prev.filter((h) => h.id !== id));

  const hasStream =
    broadcasters.some((b) => b.stream) || (isBroadcaster && localStream);

  // Grid layout: 1, 2, or 4 tiles
  const numTiles = broadcasters.length;

  return (
    <View style={styles.root}>
      {/* ── Video area ── */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleVideoTap}
        style={styles.videoArea}
      >
        {!hasStream ? (
          <View style={styles.placeholderWrap}>
            <Text style={styles.placeholderText}>
              {isBroadcaster ? 'Initializing camera…' : 'Connecting to stream…'}
            </Text>
            {isViewer && loadingTimeout && (
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => {
                  setLoadingTimeout(false);
                  if (sessionId) watchSession(sessionId);
                }}
              >
                <Text style={styles.retryText}>Retry Connection</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.gridWrap}>
            {broadcasters.map((b, idx) => {
              const url =
                b.stream && typeof (b.stream as any).toURL === 'function'
                  ? (b.stream as any).toURL()
                  : null;

              // Grid geometry
              const isSingle = numTiles === 1;
              const isDouble = numTiles === 2;
              const tileStyle = isSingle
                ? styles.tileFull
                : isDouble
                ? styles.tileHalf
                : styles.tileQuarter;

              return (
                <View key={String(b.userId)} style={[styles.tile, tileStyle]}>
                  {url ? (
                    <RTCView
                      streamURL={url}
                      style={styles.rtcView}
                      objectFit="cover"
                      mirror={String(b.userId) === String(useLiveUserIdFallback())}
                    />
                  ) : (
                    <View style={styles.tileLoading}>
                      <Text style={styles.tileLoadingText}>Connecting…</Text>
                    </View>
                  )}
                  <View style={styles.tileName}>
                    <Text style={styles.tileNameText}>
                      {b.name || 'Unknown'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Floating hearts */}
        {hearts.map((h) => (
          <FloatingHeart
            key={h.id}
            x={h.x}
            y={h.y}
            onComplete={() => removeHeart(h.id)}
          />
        ))}

        {/* Floating emoji reactions */}
        {floatingReactions.map((r) => (
          <FloatingEmoji
            key={r.id}
            emoji={r.emoji}
            x={r.x}
            onComplete={() => {}}
          />
        ))}
      </TouchableOpacity>

      {/* ── Like counter (top-right) ── */}
      <SafeAreaView style={styles.topSafe} edges={['top']} pointerEvents="box-none">
        <View style={styles.topBar}>
          <View style={styles.authorWrap}>
            <View style={styles.authorAvatarWrap}>
              {broadcasterAvatar ? (
                <View style={styles.authorAvatar} />
              ) : (
                <View style={styles.authorAvatarFallback} />
              )}
            </View>
            <View style={styles.authorText}>
              <Text style={styles.authorName} numberOfLines={1}>
                {broadcasterName || 'Unknown'}
              </Text>
              <Text style={styles.authorTitle} numberOfLines={1}>
                {title || 'Live stream'}
              </Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            {isBroadcaster && (
              <View style={styles.broadcasterBadge}>
                <Text style={styles.broadcasterText}>Broadcaster</Text>
              </View>
            )}
            {isBroadcaster && pendingRequests.length > 0 && (
              <TouchableOpacity
                style={styles.requestsBtn}
                onPress={() => setShowRequests((p) => !p)}
              >
                <Text style={styles.requestsBtnText}>
                  {pendingRequests.length} request
                  {pendingRequests.length > 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.topRight}>
            <View style={styles.likeCounter}>
              <Feather name="heart" size={14} color="#f43f5e" />
              <Text style={styles.likeCounterText}>{likeCount}</Text>
            </View>
            <View style={styles.viewerCounter}>
              <Feather name="eye" size={13} color="#fff" />
              <Text style={styles.viewerCounterText}>{viewerCount || 0}</Text>
            </View>
            <TouchableOpacity style={styles.iconBtn} onPress={closeLive}>
              <Feather name="x" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Pending requests dropdown */}
        {isBroadcaster && showRequests && pendingRequests.length > 0 && (
          <View style={styles.requestsPanel}>
            <Text style={styles.requestsPanelTitle}>Pending requests</Text>
            {pendingRequests.map((req) => (
              <View key={String(req.userId)} style={styles.requestRow}>
                <Text style={styles.requestName} numberOfLines={1}>
                  {req.name || 'Unknown'}
                </Text>
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => approveRequest(req.userId)}
                  >
                    <Text style={styles.acceptText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.declineBtn}
                    onPress={() => rejectRequest(req.userId)}
                  >
                    <Text style={styles.declineText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </SafeAreaView>

      {/* ── Bottom bar ── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottomWrapper}
      >
        <SafeAreaView style={styles.bottomSafe} edges={['bottom']}>
          {/* Broadcaster controls */}
          {isBroadcaster && (
            <View style={styles.hostControls}>
              <TouchableOpacity
                style={[
                  styles.iconBtn,
                  micMuted && { borderColor: '#ef4444' },
                ]}
                onPress={toggleMic}
              >
                <Feather
                  name={micMuted ? 'mic-off' : 'mic'}
                  size={18}
                  color={micMuted ? '#ef4444' : '#fff'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.iconBtn,
                  camOff && { borderColor: '#ef4444' },
                ]}
                onPress={toggleCam}
              >
                <Feather
                  name={camOff ? 'video-off' : 'video'}
                  size={18}
                  color={camOff ? '#ef4444' : '#fff'}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.endBtn} onPress={closeLive}>
                <Text style={styles.endBtnText}>
                  {role === 'host' ? 'End Stream' : 'Leave'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Reaction buttons */}
          <View style={styles.reactionsRow}>
            {REACTIONS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.reactionBtn}
                onPress={() => sendReaction(emoji)}
                activeOpacity={0.75}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}

            {isViewer && !isBroadcaster && (
              <TouchableOpacity
                style={[
                  styles.joinBroadcasterBtn,
                  requestingToBroadcast && { opacity: 0.5 },
                ]}
                onPress={requestBroadcast}
                disabled={requestingToBroadcast}
              >
                <Text style={styles.joinBroadcasterText}>
                  {requestingToBroadcast ? 'Requesting…' : 'Join as Broadcaster'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Chat */}
          <ScrollView
            ref={chatScrollRef}
            style={styles.chatScroll}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
          >
            {chatMessages.map((msg, idx) =>
              msg.isSystem ? (
                <Text key={idx} style={styles.chatSystem}>
                  {msg.text}
                </Text>
              ) : (
                <View key={idx} style={styles.chatRow}>
                  <Text
                    style={[
                      styles.chatSender,
                      { color: msg.isSelf ? '#22c55e' : '#a78bfa' },
                    ]}
                  >
                    {msg.senderName}:
                  </Text>
                  <Text style={styles.chatText}>{msg.text}</Text>
                </View>
              )
            )}
          </ScrollView>

          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Say something…"
              placeholderTextColor="rgba(255,255,255,0.5)"
              maxLength={200}
              onSubmitEditing={handleSendChat}
              returnKeyType="send"
            />
            <TouchableOpacity style={styles.sendBtn} onPress={handleSendChat}>
              <Feather name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

// Small helper so the mirror prop works even though useLive doesn't expose the current user id directly
function useLiveUserIdFallback() {
  // Avoid importing useAuth here to keep the file self-contained.
  // Mirror isn't critical — returning null just means "don't mirror".
  return null;
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 1000,
  },
  videoArea: { flex: 1 },
  placeholderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  placeholderText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#6C63FF',
  },
  retryText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  gridWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#000',
  },
  tile: { position: 'relative', backgroundColor: '#111' },
  tileFull: { width: '100%', height: '100%' },
  tileHalf: { width: '50%', height: '100%' },
  tileQuarter: { width: '50%', height: '50%' },
  rtcView: { width: '100%', height: '100%' },
  tileLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLoadingText: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  tileName: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tileNameText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  floatingHeart: { position: 'absolute', fontSize: 28 },
  floatingEmoji: { position: 'absolute', fontSize: 40 },

  topSafe: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  authorWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authorAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  authorAvatar: { flex: 1, backgroundColor: '#4b5563' },
  authorAvatarFallback: { flex: 1, backgroundColor: '#4b5563' },
  authorText: { flexShrink: 1 },
  authorName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  authorTitle: { color: 'rgba(255,255,255,0.65)', fontSize: 11 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  liveText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  broadcasterBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: '#6C63FF',
  },
  broadcasterText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  requestsBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: '#6C63FF',
    marginLeft: 4,
  },
  requestsBtnText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  likeCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  likeCounterText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  viewerCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  viewerCounterText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },

  requestsPanel: {
    marginHorizontal: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: 260,
  },
  requestsPanelTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 8,
  },
  requestName: { color: '#fff', fontSize: 13, flex: 1 },
  requestActions: { flexDirection: 'row', gap: 6 },
  acceptBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#22c55e',
  },
  acceptText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  declineBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#ef4444',
  },
  declineText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  bottomWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bottomSafe: {
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  hostControls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  endBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ef4444',
  },
  endBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  reactionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  reactionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  reactionEmoji: { fontSize: 20 },
  joinBroadcasterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#6C63FF',
  },
  joinBroadcasterText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  chatScroll: { maxHeight: 130 },
  chatContent: { paddingVertical: 4, gap: 2 },
  chatRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  chatSender: { fontSize: 13, fontWeight: '800' },
  chatText: { color: '#fff', fontSize: 13, flexShrink: 1 },
  chatSystem: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 2,
  },

  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  chatInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6C63FF',
  },
});