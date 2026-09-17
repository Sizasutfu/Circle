import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import { useWs } from './WsContext';
import api from '../api/client';

// ─── Types ────────────────────────────────────────────────
type Role = 'host' | 'viewer' | 'broadcaster' | null;

interface LiveSession {
  sessionId: string;
  title: string;
  viewerCount: number;
  startedAt: string;
  hostId: number | string;
  broadcasterName: string;
  broadcasterAvatar: string;
}

interface ChatMessage {
  senderName: string;
  text: string;
  isSelf: boolean;
  isSystem: boolean;
}

interface Broadcaster {
  userId: string | number;
  name: string;
  avatar: string;
  stream: MediaStream | null;
}

interface PendingRequest {
  userId: string | number;
  name: string;
  avatar: string;
}

interface FloatingReaction {
  id: number;
  emoji: string;
  x: number;
}

interface LiveContextValue {
  activeSessions: LiveSession[];
  isLoadingSessions: boolean;
  role: Role;
  sessionId: string | null;
  title: string;
  broadcasterName: string;
  broadcasterAvatar: string;
  viewerCount: number;
  chatMessages: ChatMessage[];
  localStream: MediaStream | null;
  broadcasters: Broadcaster[];
  isBroadcaster: boolean;
  requestingToBroadcast: boolean;
  pendingRequests: PendingRequest[];
  micMuted: boolean;
  camOff: boolean;
  isOverlayOpen: boolean;
  isSetupOpen: boolean;
  setupError: string | null;
  floatingReactions: FloatingReaction[];
  likeCount: number;
  collaborationEnabled: boolean;
  setCollaborationEnabled: (v: boolean) => void;
  openSetup: () => Promise<void>;
  closeSetup: () => void;
  startLive: (title: string) => Promise<void>;
  watchSession: (sessionId: string) => Promise<void>;
  closeLive: () => Promise<void>;
  toggleMic: () => void;
  toggleCam: () => void;
  sendChat: (text: string) => void;
  sendReaction: (emoji: string) => void;
  sendLike: () => void;
  loadActiveSessions: () => Promise<void>;
  requestBroadcast: () => void;
  approveRequest: (userId: string | number) => void;
  rejectRequest: (userId: string | number) => void;
}

const LiveContext = createContext<LiveContextValue | null>(null);

// ✅ STUN only for now — see "TURN" note at bottom of this message.
//    Without TURN, some mobile-to-mobile connections will fail to establish.
const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function LiveProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { sendMessage: wsSend, registerHandler } = useWs();

  const [activeSessions, setActiveSessions] = useState<LiveSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [role, setRole] = useState<Role>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [broadcasterName, setBroadcasterName] = useState('');
  const [broadcasterAvatar, setBroadcasterAvatar] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [broadcasters, setBroadcasters] = useState<Broadcaster[]>([]);
  const [isBroadcaster, setIsBroadcaster] = useState(false);
  const [requestingToBroadcast, setRequestingToBroadcast] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const [collaborationEnabled, setCollaborationEnabled] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, { pc: RTCPeerConnection; stream: MediaStream | null }>>({});
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const livePostIdRef = useRef<string | number | null>(null);

  const log = (msg: string, data?: any) =>
    console.log(`[Live:${role || 'none'}] ${msg}`, data || '');

  // ── Floating reactions ──
  const addFloatingReaction = useCallback((emoji: string) => {
    const id = Date.now() + Math.random();
    const x = 5 + Math.random() * 90;
    setFloatingReactions((prev) => [...prev, { id, emoji, x }]);
    if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
    reactionTimerRef.current = setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2500);
  }, []);

  const sendLike = useCallback(() => {
    if (!sessionId) return;
    setLikeCount((prev) => prev + 1);
    wsSend({ type: 'live:like', sessionId });
  }, [sessionId, wsSend]);

  // ── Load active sessions ──
  const loadActiveSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const res = await api.get('/live/active');
      const body = res.data?.data ?? res.data ?? [];
      const sessions = Array.isArray(body) ? body : [];
      setActiveSessions(sessions);
    } catch (_) {
      console.warn('[Live] Failed to load active sessions');
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  // ── Open setup (request camera/mic) ──
  const openSetup = useCallback(async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please log in to go live.');
      return;
    }
    setSetupError(null);
    setIsSetupOpen(true);
    try {
      const stream = (await mediaDevices.getUserMedia({
        video: {
          width: 1280,
          height: 720,
          frameRate: 30,
          facingMode: 'user',
        },
        audio: true,
      })) as MediaStream;
      localStreamRef.current = stream;
      // Small delay so UI shows the stream attached
      setTimeout(() => setIsSetupOpen((prev) => prev), 0);
      log('Media stream acquired');
    } catch (err: any) {
      console.error('[Live] Camera/mic error:', err);
      setSetupError(
        'Could not access camera/microphone: ' + (err?.message || 'unknown error')
      );
    }
  }, [user]);

  // ── Close setup ──
  const closeSetup = useCallback(() => {
    setIsSetupOpen(false);
    setSetupError(null);
    if (localStreamRef.current && role !== 'host' && !isBroadcaster) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  }, [role, isBroadcaster]);

  // ── Start live ──
  const startLive = useCallback(
    async (titleText: string) => {
      if (!localStreamRef.current) {
        Alert.alert('Error', 'No camera or microphone access.');
        return;
      }
      try {
        const res = await api.post('/live/start', {
          title: titleText,
          collaborationEnabled,
        });
        const data = res.data?.data ?? res.data;
        const sid: string = data.sessionId;
        setSessionId(sid);
        setTitle(data.title || titleText);
        setRole('host');
        setIsBroadcaster(true);
        setBroadcasterName(data.broadcasterName || user?.name || user?.username || '');
        setBroadcasterAvatar(data.broadcasterAvatar || (user as any)?.avatar || '');
        setBroadcasters([
          {
            userId: user!.id,
            name: data.broadcasterName || user?.name || user?.username || '',
            avatar: data.broadcasterAvatar || (user as any)?.avatar || '',
            stream: localStreamRef.current,
          },
        ]);
        setIsSetupOpen(false);
        setIsOverlayOpen(true);
        setCamOff(false);

        // Create the live post
        try {
          const postRes = await api.post('/posts', {
            text: `🔴 I'm live now! ${titleText}`,
            isLive: true,
            liveSessionId: sid,
          });
          const postData = postRes.data?.data ?? postRes.data;
          livePostIdRef.current = postData?.id ?? null;
          log('Live post created', postData?.id);
        } catch (err) {
          console.warn('[Live] Failed to create live post:', err);
        }

        wsSend({
          type: 'live:started',
          sessionId: sid,
          broadcasterName: data.broadcasterName || user?.name,
          broadcasterAvatar: data.broadcasterAvatar || (user as any)?.avatar,
          title: titleText,
          hostId: user!.id,
          collaborationEnabled,
        });
        log('Live started', sid);
      } catch (err: any) {
        console.error('[Live] Failed to start:', err);
        Alert.alert('Error', err?.response?.data?.message || 'Could not start stream.');
      }
    },
    [user, wsSend, collaborationEnabled]
  );

  // ── Watch session ──
  const watchSession = useCallback(
    async (sid: string) => {
      if (!user) {
        Alert.alert('Sign In Required', 'Please log in to watch.');
        return;
      }
      log('Attempting to watch', sid);
      setSessionId(sid);
      setRole('viewer');
      setIsBroadcaster(false);
      setIsOverlayOpen(true);
      setLikeCount(0);
      setBroadcasters([]);
      setPendingRequests([]);
      Object.values(peersRef.current).forEach((p) => p.pc.close());
      peersRef.current = {};

      try {
        const res = await api.get(`/live/${sid}`);
        const data = res.data?.data ?? res.data;
        setBroadcasterName(data.broadcasterName || '');
        setBroadcasterAvatar(data.broadcasterAvatar || '');
        setTitle(data.title || '');
      } catch (_) {}

      wsSend({
        type: 'live:viewer_join',
        sessionId: sid,
        viewerId: user.id,
        viewerName: user.username || user.name || null,
      });
    },
    [user, wsSend]
  );

  // ── Close live ──
  const closeLive = useCallback(async () => {
    if (role === 'host') {
      try {
        await api.post('/live/end', { sessionId });
      } catch (_) {}
      Object.values(peersRef.current).forEach((p) => p.pc.close());
      peersRef.current = {};
      wsSend({ type: 'live:ended', sessionId });

      if (livePostIdRef.current) {
        try {
          await api.put(`/posts/${livePostIdRef.current}`, { isLive: false });
          log('Live post updated (isLive: false)', livePostIdRef.current);
        } catch (_) {}
        livePostIdRef.current = null;
      }
    } else if (sessionId) {
      const entry = peersRef.current[sessionId];
      if (entry) {
        entry.pc.close();
        delete peersRef.current[sessionId];
      }
      wsSend({
        type: 'live:viewer_leave',
        sessionId,
        viewerId: user?.id,
      });
    }

    setIsOverlayOpen(false);
    setRole(null);
    setIsBroadcaster(false);
    setSessionId(null);
    setTitle('');
    setBroadcasterName('');
    setBroadcasterAvatar('');
    setChatMessages([]);
    setViewerCount(0);
    setBroadcasters([]);
    setPendingRequests([]);
    setFloatingReactions([]);
    setLikeCount(0);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setMicMuted(false);
    setCamOff(false);
  }, [role, sessionId, user, wsSend]);

  // ── Toggles ──
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const newState = !micMuted;
    setMicMuted(newState);
    localStreamRef.current.getAudioTracks().forEach((t) => {
      (t as any).enabled = !newState;
    });
  }, [micMuted]);

  const toggleCam = useCallback(() => {
    if (!localStreamRef.current) return;
    const newState = !camOff;
    setCamOff(newState);
    localStreamRef.current.getVideoTracks().forEach((t) => {
      (t as any).enabled = !newState;
    });
  }, [camOff]);

  // ── Chat ──
  const sendChat = useCallback(
    (text: string) => {
      if (!text.trim() || !sessionId || !user) return;
      const msg = {
        type: 'live:chat_message',
        sessionId,
        senderId: user.id,
        senderName: user.username || user.name || 'You',
        text: text.trim(),
        isSystem: false,
      };
      wsSend(msg);
      setChatMessages((prev) => [
        ...prev,
        {
          senderName: msg.senderName,
          text: msg.text,
          isSelf: true,
          isSystem: false,
        },
      ]);
    },
    [sessionId, user, wsSend]
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      if (!sessionId) return;
      addFloatingReaction(emoji);
      wsSend({ type: 'live:reaction', sessionId, emoji });
      setLikeCount((prev) => prev + 1);
      wsSend({ type: 'live:like', sessionId });
    },
    [sessionId, wsSend, addFloatingReaction]
  );

  // ── Collaborative broadcast ──
  const requestBroadcast = useCallback(() => {
    if (!sessionId || !user) return;
    setRequestingToBroadcast(true);
    wsSend({ type: 'live:become_broadcaster', sessionId });
  }, [sessionId, user, wsSend]);

  const approveRequest = useCallback(
    (targetUserId: string | number) => {
      if (!sessionId || !user) return;
      wsSend({ type: 'live:approve_broadcaster', sessionId, targetUserId });
      setPendingRequests((prev) => prev.filter((r) => r.userId !== targetUserId));
    },
    [sessionId, user, wsSend]
  );

  const rejectRequest = useCallback(
    (targetUserId: string | number) => {
      if (!sessionId || !user) return;
      wsSend({ type: 'live:reject_broadcaster', sessionId, targetUserId });
      setPendingRequests((prev) => prev.filter((r) => r.userId !== targetUserId));
    },
    [sessionId, user, wsSend]
  );

  // ── Peer to peer: broadcaster ↔ broadcaster ──
  const createPeerToBroadcaster = useCallback(
    (targetUserId: string | number) => {
      if (!sessionId || !user) return;
      const key = String(targetUserId);
      if (peersRef.current[key]) return;

      const pc = new RTCPeerConnection(RTC_CONFIG);

      if (localStreamRef.current) {
        localStreamRef.current
          .getTracks()
          .forEach((track: any) => pc.addTrack(track, localStreamRef.current!));
      }

      (pc as any).ontrack = (event: any) => {
        log(`Received track from broadcaster ${targetUserId}`);
        setBroadcasters((prev) =>
          prev.map((b) =>
            String(b.userId) === key ? { ...b, stream: event.streams[0] } : b
          )
        );
      };

      (pc as any).onicecandidate = (event: any) => {
        if (event.candidate) {
          wsSend({
            type: 'live:ice_candidate',
            sessionId,
            candidate: event.candidate,
            from: user.id,
            to: targetUserId,
          });
        }
      };

      peersRef.current[key] = { pc, stream: null };

      pc.createOffer()
        .then((offer: any) => pc.setLocalDescription(offer))
        .then(() => {
          wsSend({
            type: 'live:offer',
            sessionId,
            offer: pc.localDescription,
            from: user.id,
            to: targetUserId,
          });
          log(`Offer sent to broadcaster ${targetUserId}`);
        })
        .catch((err: any) =>
          console.error(`[Live] Offer error to ${targetUserId}:`, err)
        );
    },
    [sessionId, user, wsSend]
  );

  // ── WebSocket message handler ──
  const handleWsMessage = useCallback(
    (msg: any) => {
      log('Received WS message', msg.type);
      switch (msg.type) {
        case 'live:started':
          loadActiveSessions();
          break;

        case 'live:ended':
          setActiveSessions((prev) =>
            prev.filter((s) => s.sessionId !== msg.sessionId)
          );
          if (
            (role === 'viewer' || isBroadcaster) &&
            sessionId === msg.sessionId
          ) {
            setIsOverlayOpen(false);
          }
          break;

        case 'live:viewer_joined': {
          const { viewerId, viewerCount: count } = msg;
          setViewerCount(count);
          if (
            isBroadcaster &&
            sessionId === msg.sessionId &&
            viewerId !== user?.id
          ) {
            const pc = new RTCPeerConnection(RTC_CONFIG);
            if (localStreamRef.current) {
              localStreamRef.current
                .getTracks()
                .forEach((track: any) =>
                  pc.addTrack(track, localStreamRef.current!)
                );
            }
            (pc as any).ontrack = () => {};
            (pc as any).onicecandidate = (event: any) => {
              if (event.candidate) {
                wsSend({
                  type: 'live:ice_candidate',
                  sessionId,
                  candidate: event.candidate,
                  from: user!.id,
                  to: viewerId,
                });
              }
            };
            peersRef.current[String(viewerId)] = { pc, stream: null };
            pc.createOffer()
              .then((offer: any) => pc.setLocalDescription(offer))
              .then(() => {
                wsSend({
                  type: 'live:offer',
                  sessionId,
                  offer: pc.localDescription,
                  from: user!.id,
                  to: viewerId,
                });
              })
              .catch((err: any) =>
                console.error(`[Live] Offer to viewer ${viewerId} error:`, err)
              );
          }
          break;
        }

        case 'live:viewer_left': {
          setViewerCount(msg.viewerCount);
          if (isBroadcaster && sessionId === msg.sessionId) {
            const peer = peersRef.current[String(msg.viewerId)];
            if (peer) {
              peer.pc.close();
              delete peersRef.current[String(msg.viewerId)];
            }
          }
          break;
        }

        case 'live:viewer_count':
          if (sessionId === msg.sessionId) setViewerCount(msg.count);
          break;

        case 'live:like_count':
          if (sessionId === msg.sessionId) setLikeCount(msg.count);
          break;

        case 'live:new_broadcaster': {
          const { broadcasterId, broadcasterName: bn, broadcasterAvatar: ba } = msg;
          if (broadcasterId === user?.id) break;
          setBroadcasters((prev) => [
            ...prev,
            { userId: broadcasterId, name: bn, avatar: ba, stream: null },
          ]);
          if (isBroadcaster && sessionId === msg.sessionId) {
            createPeerToBroadcaster(broadcasterId);
          }
          break;
        }

        case 'live:existing_broadcasters': {
          const { broadcasters: existing } = msg;
          const filtered = existing.filter((b: any) => b.userId !== user?.id);
          setBroadcasters((prev) => {
            const existingIds = new Set(prev.map((b) => String(b.userId)));
            const toAdd = filtered.filter(
              (b: any) => !existingIds.has(String(b.userId))
            );
            return [...prev, ...toAdd];
          });
          if (isBroadcaster && sessionId === msg.sessionId) {
            filtered.forEach((b: any) => {
              if (b.userId !== user?.id) createPeerToBroadcaster(b.userId);
            });
          }
          break;
        }

        case 'live:current_broadcasters': {
          const { broadcasters: current } = msg;
          setBroadcasters(
            current.map((b: any) => ({ ...b, stream: null }))
          );
          break;
        }

        case 'live:request_broadcast': {
          const { userId: requesterId, userName, userAvatar } = msg;
          if (isBroadcaster && sessionId === msg.sessionId) {
            setPendingRequests((prev) => [
              ...prev,
              { userId: requesterId, name: userName, avatar: userAvatar },
            ]);
          }
          break;
        }

        case 'live:request_approved': {
          if (role === 'viewer' && sessionId === msg.sessionId) {
            setIsBroadcaster(true);
            setRole('broadcaster');
            setRequestingToBroadcast(false);
          }
          break;
        }

        case 'live:request_rejected': {
          if (role === 'viewer' && sessionId === msg.sessionId) {
            setRequestingToBroadcast(false);
            Alert.alert('Declined', 'Your request to join as broadcaster was declined.');
          }
          break;
        }

        case 'live:offer': {
          const { from, offer } = msg;
          if (from === user?.id) break;
          const key = String(from);
          let peer = peersRef.current[key];
          if (!peer) {
            const pc = new RTCPeerConnection(RTC_CONFIG);
            if (localStreamRef.current && isBroadcaster) {
              localStreamRef.current
                .getTracks()
                .forEach((track: any) =>
                  pc.addTrack(track, localStreamRef.current!)
                );
            }
            (pc as any).ontrack = (event: any) => {
              setBroadcasters((prev) =>
                prev.map((b) =>
                  String(b.userId) === key
                    ? { ...b, stream: event.streams[0] }
                    : b
                )
              );
            };
            (pc as any).onicecandidate = (event: any) => {
              if (event.candidate) {
                wsSend({
                  type: 'live:ice_candidate',
                  sessionId,
                  candidate: event.candidate,
                  from: user!.id,
                  to: from,
                });
              }
            };
            peer = { pc, stream: null };
            peersRef.current[key] = peer;
          }
          peer.pc
            .setRemoteDescription(new RTCSessionDescription(offer))
            .then(() => peer!.pc.createAnswer())
            .then((answer: any) => peer!.pc.setLocalDescription(answer))
            .then(() => {
              wsSend({
                type: 'live:answer',
                sessionId,
                answer: peer!.pc.localDescription,
                from: user!.id,
                to: from,
              });
            })
            .catch((err: any) =>
              console.error(`[Live] Answer error to ${from}:`, err)
            );
          break;
        }

        case 'live:answer': {
          const { from, answer } = msg;
          if (from === user?.id) break;
          const peer = peersRef.current[String(from)];
          if (peer) {
            peer.pc
              .setRemoteDescription(new RTCSessionDescription(answer))
              .catch((err: any) =>
                console.error(`[Live] Set remote desc error from ${from}:`, err)
              );
          }
          break;
        }

        case 'live:ice_candidate': {
          const { from, candidate } = msg;
          if (from === user?.id) break;
          const peer = peersRef.current[String(from)];
          if (peer && candidate) {
            peer.pc
              .addIceCandidate(new RTCIceCandidate(candidate))
              .catch((err: any) =>
                console.warn(`[Live] ICE error from ${from}:`, err)
              );
          }
          break;
        }

        case 'live:reaction':
          if (sessionId === msg.sessionId && msg.from !== user?.id) {
            addFloatingReaction(msg.emoji);
          }
          break;

        case 'live:chat_message':
          if (sessionId === msg.sessionId) {
            const isSelf = msg.senderId === user?.id;
            setChatMessages((prev) => [
              ...prev,
              {
                senderName: msg.isSystem ? '' : msg.senderName || 'Anonymous',
                text: msg.text,
                isSelf: isSelf && !msg.isSystem,
                isSystem: !!msg.isSystem,
              },
            ]);
          }
          break;

        case 'live:broadcaster_left': {
          const { broadcasterId } = msg;
          setBroadcasters((prev) =>
            prev.filter((b) => String(b.userId) !== String(broadcasterId))
          );
          const peer = peersRef.current[String(broadcasterId)];
          if (peer) {
            peer.pc.close();
            delete peersRef.current[String(broadcasterId)];
          }
          break;
        }

        case 'live:error':
          Alert.alert('Live', msg.text);
          if (msg.text?.includes('limit')) setRequestingToBroadcast(false);
          break;

        default:
          break;
      }
    },
    [
      loadActiveSessions,
      role,
      sessionId,
      user,
      wsSend,
      addFloatingReaction,
      isBroadcaster,
      createPeerToBroadcaster,
    ]
  );

  // ── Register WS handlers ──
  useEffect(() => {
    const types = [
      'live:started',
      'live:ended',
      'live:viewer_joined',
      'live:viewer_left',
      'live:viewer_count',
      'live:like_count',
      'live:chat_message',
      'live:reaction',
      'live:offer',
      'live:answer',
      'live:ice_candidate',
      'live:new_broadcaster',
      'live:existing_broadcasters',
      'live:current_broadcasters',
      'live:broadcaster_left',
      'live:request_broadcast',
      'live:request_approved',
      'live:request_rejected',
      'live:error',
    ];
    const unsubs = types.map((type) => registerHandler(type, handleWsMessage));
    return () => unsubs.forEach((fn) => fn());
  }, [registerHandler, handleWsMessage]);

  // ── Periodic refresh ──
  useEffect(() => {
    loadActiveSessions();
    const interval = setInterval(loadActiveSessions, 30000);
    return () => clearInterval(interval);
  }, [loadActiveSessions]);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      Object.values(peersRef.current).forEach((p) => p.pc.close());
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
    };
  }, []);

  const value: LiveContextValue = {
    activeSessions,
    isLoadingSessions,
    role,
    sessionId,
    title,
    broadcasterName,
    broadcasterAvatar,
    viewerCount,
    chatMessages,
    localStream: localStreamRef.current,
    broadcasters,
    isBroadcaster,
    requestingToBroadcast,
    pendingRequests,
    micMuted,
    camOff,
    isOverlayOpen,
    isSetupOpen,
    setupError,
    floatingReactions,
    likeCount,
    collaborationEnabled,
    setCollaborationEnabled,
    openSetup,
    closeSetup,
    startLive,
    watchSession,
    closeLive,
    toggleMic,
    toggleCam,
    sendChat,
    sendReaction,
    sendLike,
    loadActiveSessions,
    requestBroadcast,
    approveRequest,
    rejectRequest,
  };

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useLive must be used within a LiveProvider');
  return ctx;
}