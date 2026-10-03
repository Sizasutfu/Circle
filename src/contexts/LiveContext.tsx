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
  hostId: string | number | null;
  title: string;
  broadcasterName: string;
  broadcasterAvatar: string;
  viewerCount: number;
  chatMessages: ChatMessage[];
  localStream: MediaStream | null;
  localPreviewUrl: string | null;
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

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const MEDIA_CONSTRAINTS: any = {
  video: { width: 1280, height: 720, frameRate: 30, facingMode: 'user' },
  audio: true,
};

// A second getUserMedia() on the same camera can steal it from the first
// capture and black out the local preview. Keep this false unless you have
// verified (preview tracks stay readyState=live) that your device allows it.
const ALLOW_SECOND_CAPTURE = false;

// One entry per remote peer. `sendStream` is whatever we handed to
// pc.addTrack for that peer. `ownsSendTracks` is true only when those tracks
// are per-peer clones (safe to stop when the peer closes). The shared
// "second getUserMedia" send stream is never stopped per peer.
interface PeerEntry {
  pc: RTCPeerConnection;
  sendStream: MediaStream | null;
  ownsSendTracks: boolean;
}

// ─── Diagnostics (temporary — remove once the fix is verified) ──
function logStream(label: string, stream: MediaStream | null) {
  if (!stream) {
    console.log(`[Live] getUserMedia stream (${label}): null`);
    return;
  }
  console.log(`[Live] getUserMedia stream (${label}) id=${stream.id}`);
  stream.getTracks().forEach((t: any) =>
    console.log(
      `[Live]   track id=${t.id} kind=${t.kind} enabled=${t.enabled} readyState=${t.readyState}`
    )
  );
}

function logSdpDirections(label: string, sdp?: string | null) {
  if (!sdp) return;
  sdp
    .split(/\r?\nm=/)
    .slice(1)
    .forEach((section) => {
      const kind = section.split(' ')[0];
      const dir =
        section.match(/a=(sendrecv|sendonly|recvonly|inactive)/)?.[1] ?? 'unspecified';
      console.log(`[Live] ${label} SDP m=${kind} direction=${dir}`);
      if (kind === 'video' && dir === 'sendonly') {
        console.warn(`[Live] ${label}: video m-line is sendonly`);
      }
    });
}

// Offerer must never declare sendonly, or the answerer can't send back.
function forceSendRecv(pc: any) {
  try {
    const transceivers = typeof pc.getTransceivers === 'function' ? pc.getTransceivers() : [];
    transceivers.forEach((t: any) => {
      if (t.direction === 'sendonly') {
        console.warn('[Live] transceiver was sendonly — switching to sendrecv');
        t.direction = 'sendrecv';
      }
    });
  } catch (err) {
    console.warn('[Live] forceSendRecv failed', err);
  }
}

// Does this react-native-webrtc build implement MediaStreamTrack.clone()?
// (Older builds throw "Not implemented".) Probed once per acquired stream.
function probeCloneSupport(stream: MediaStream): boolean {
  const track: any = stream.getTracks()[0];
  if (!track || typeof track.clone !== 'function') return false;
  try {
    const probe = track.clone();
    if (!probe || probe.id === track.id) return false; // not a real clone
    if (typeof probe.stop === 'function') probe.stop();
    return true;
  } catch (_) {
    return false;
  }
}

// ─── Broadcaster list helpers ─────────────────────────────
// Every list mutation goes through these helpers so a tile can never
// be duplicated, dropped, or have its stream clobbered by an unrelated
// update. This is what prevents a collaborator from "replacing" the host.
function upsertBroadcaster(
  list: Broadcaster[],
  entry: Partial<Broadcaster> & { userId: string | number }
): Broadcaster[] {
  const id = String(entry.userId);
  const idx = list.findIndex((b) => String(b.userId) === id);
  if (idx === -1) {
    return [
      ...list,
      {
        userId: entry.userId,
        name: entry.name ?? 'Broadcaster',
        avatar: entry.avatar ?? '',
        stream: entry.stream ?? null,
      },
    ];
  }
  const next = list.slice();
  next[idx] = {
    ...next[idx],
    // Only overwrite fields that were actually provided.
    ...(entry.name !== undefined ? { name: entry.name } : {}),
    ...(entry.avatar !== undefined ? { avatar: entry.avatar } : {}),
    ...(entry.stream !== undefined ? { stream: entry.stream } : {}),
  };
  return next;
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { sendMessage: wsSend, registerHandler } = useWs();

  const [activeSessions, setActiveSessions] = useState<LiveSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [role, setRole] = useState<Role>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | number | null>(null);
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
  // Cached once per preview stream so the local tile's RTCView gets a frozen URL.
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  // Synchronous mirrors of role / isBroadcaster for callbacks that can run on stale state.
  const roleRef = useRef<Role>(null);
  const isBroadcasterRef = useRef(false);

  // localStreamRef  = preview only (what RTCView renders; never handed to a peer connection)
  // sendStreamRef   = independent capture used for sending when track.clone() is unavailable
  const localStreamRef = useRef<MediaStream | null>(null);
  const sendStreamRef = useRef<MediaStream | null>(null);
  const cloneSupportedRef = useRef(false);
  const peersRef = useRef<Record<string, PeerEntry>>({});
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const livePostIdRef = useRef<string | number | null>(null);
  const pendingPeersRef = useRef<Set<string>>(new Set());

  const log = (msg: string, data?: any) =>
    console.log(`[Live:${role || 'none'}] ${msg}`, data || '');

  const applyRole = useCallback((r: Role) => {
    roleRef.current = r;
    setRole(r);
  }, []);

  const applyIsBroadcaster = useCallback((v: boolean) => {
    isBroadcasterRef.current = v;
    setIsBroadcaster(v);
  }, []);

  // Resolve + cache the preview URL ONCE per preview stream.
  const publishPreviewUrl = useCallback((stream: MediaStream | null) => {
    const url =
      stream && typeof (stream as any).toURL === 'function' ? (stream as any).toURL() : null;
    console.log('[Live] preview URL cached:', url);
    setLocalPreviewUrl(url);
  }, []);

  // ── Peer lifecycle ──
  const closePeer = useCallback((key: string) => {
    const entry = peersRef.current[key];
    if (!entry) return;
    try {
      entry.pc.close();
    } catch (err) {
      console.warn('[Live] pc.close failed for', key, err);
    }
    // Only per-peer CLONES are stopped here — never the preview or shared send stream.
    if (entry.ownsSendTracks) {
      entry.sendStream?.getTracks().forEach((t: any) => {
        try {
          t.stop();
        } catch (_) {}
      });
    }
    delete peersRef.current[key];
  }, []);

  const closeAllPeers = useCallback(() => {
    Object.keys(peersRef.current).forEach(closePeer);
  }, [closePeer]);

  // ── Local media lifecycle ──
  // The ONLY places that stop preview / send tracks: closeSetup (when not live),
  // closeLive, and the unmount effect — all via this function.
  const releaseLocalMedia = useCallback(
    (updateState = true) => {
      closeAllPeers();
      localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
      localStreamRef.current = null;
      sendStreamRef.current?.getTracks().forEach((t: any) => t.stop());
      sendStreamRef.current = null;
      cloneSupportedRef.current = false;
      if (updateState) setLocalPreviewUrl(null);
    },
    [closeAllPeers]
  );

  // Acquire the preview stream and make sure we have an independent way to send.
  const acquireLocalMedia = useCallback(async (): Promise<MediaStream> => {
    const preview = (await mediaDevices.getUserMedia(MEDIA_CONSTRAINTS)) as MediaStream;
    localStreamRef.current = preview;
    logStream('preview', preview);

    cloneSupportedRef.current = probeCloneSupport(preview);
    console.log('[Live] track.clone() supported:', cloneSupportedRef.current);

    if (!cloneSupportedRef.current && ALLOW_SECOND_CAPTURE) {
      try {
        const send = (await mediaDevices.getUserMedia(MEDIA_CONSTRAINTS)) as MediaStream;
        sendStreamRef.current = send;
        logStream('send (second getUserMedia)', send);
        // If the second capture stole the camera, the preview tracks will say 'ended' here.
        preview.getTracks().forEach((t: any) =>
          console.log(`[Live] preview track after 2nd capture id=${t.id} kind=${t.kind} readyState=${t.readyState}`)
        );
      } catch (err) {
        releaseLocalMedia();
        throw err;
      }
    }

    publishPreviewUrl(preview);
    return preview;
  }, [publishPreviewUrl, releaseLocalMedia]);

  // Fresh stream for a peer connection. NEVER returns the preview tracks.
  const buildSendableStream = useCallback((): { stream: MediaStream | null; ownsTracks: boolean } => {
    const preview = localStreamRef.current;
    if (!preview) return { stream: null, ownsTracks: false };

    if (cloneSupportedRef.current) {
      const cloned: any[] = [];
      try {
        preview.getTracks().forEach((t: any) => cloned.push(t.clone()));
        const stream = new (MediaStream as any)(cloned) as MediaStream;
        console.log(
          `[Live] sendable stream (clone) id=${stream.id} tracks=`,
          cloned.map((t) => `${t.kind}:${t.id}`).join(', ')
        );
        return { stream, ownsTracks: true };
      } catch (err) {
        console.error('[Live] track.clone() failed', err);
        cloned.forEach((t) => {
          try {
            t.stop();
          } catch (_) {}
        });
        return { stream: null, ownsTracks: false };
      }
    }

    // No clone support. Use the second capture if enabled, otherwise share the
    // original stream (single camera open — the pre-collaboration behaviour).
    const shared = sendStreamRef.current ?? (ALLOW_SECOND_CAPTURE ? null : preview);
    if (!shared) {
      console.warn('[Live] no send stream available — sending nothing');
      return { stream: null, ownsTracks: false };
    }
    console.log(
      `[Live] sendable stream (${sendStreamRef.current ? 'second capture' : 'shared original'}) id=${shared.id} tracks=`,
      shared.getTracks().map((t: any) => `${t.kind}:${t.id}`).join(', ')
    );
    return { stream: shared, ownsTracks: false };
  }, []);

  const addSendableTracksTo = useCallback(
    (pc: RTCPeerConnection) => {
      const { stream, ownsTracks } = buildSendableStream();
      if (stream) {
        stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));
      }
      return { sendStream: stream, ownsTracks };
    },
    [buildSendableStream]
  );

  const attachOnTrack = useCallback(
    (
      pc: RTCPeerConnection,
      remoteUserId: string | number,
      label: string,
      renderTile = true
    ) => {
      (pc as any).ontrack = (event: any) => {
        const remoteStream = event.streams && event.streams[0];
        console.log(
          `[Live] ontrack(${label}) from user=${remoteUserId} track=${event.track?.id} kind=${event.track?.kind} stream=${remoteStream?.id}`
        );
        if (!remoteStream || !renderTile) return;
        setBroadcasters((prev) =>
          upsertBroadcaster(prev, { userId: remoteUserId, stream: remoteStream })
        );
      };
    },
    []
  );

  // Flip `enabled` on every outgoing track of a kind: preview, shared send stream, per-peer clones.
  const setOutgoingEnabled = useCallback((kind: 'audio' | 'video', enabled: boolean) => {
    const flip = (t: any) => {
      if (t.kind === kind) t.enabled = enabled;
    };
    localStreamRef.current?.getTracks().forEach(flip);
    sendStreamRef.current?.getTracks().forEach(flip);
    Object.values(peersRef.current).forEach((p) => {
      if (p.ownsSendTracks) p.sendStream?.getTracks().forEach(flip);
    });
  }, []);

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
    // Already hosting / broadcasting: never replace the live capture.
    if (roleRef.current === 'host' || isBroadcasterRef.current) return;

    setSetupError(null);
    setIsSetupOpen(true);
    try {
      if (localStreamRef.current) releaseLocalMedia(); // leftover from an abandoned setup
      await acquireLocalMedia();
      log('Media stream acquired');
    } catch (err: any) {
      console.error('[Live] Camera/mic error:', err);
      setSetupError(
        'Could not access camera/microphone: ' + (err?.message || 'unknown error')
      );
    }
  }, [user, acquireLocalMedia, releaseLocalMedia]);

  // ── Close setup ──
  // Guarded by refs (not React state) so a stale closure can never stop the
  // tracks of an active host or broadcaster.
  const closeSetup = useCallback(() => {
    setIsSetupOpen(false);
    setSetupError(null);
    const live =
      roleRef.current === 'host' ||
      roleRef.current === 'broadcaster' ||
      isBroadcasterRef.current;
    if (live) {
      console.log('[Live] closeSetup: active host/broadcaster — leaving tracks running');
      return;
    }
    if (localStreamRef.current) releaseLocalMedia();
  }, [releaseLocalMedia]);

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
        setHostId(user!.id);
        setTitle(data.title || titleText);
        applyRole('host');
        applyIsBroadcaster(true);
        publishPreviewUrl(localStreamRef.current);
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
        setMicMuted(false);

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
    [user, wsSend, collaborationEnabled, applyRole, applyIsBroadcaster, publishPreviewUrl]
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
      applyRole('viewer');
      applyIsBroadcaster(false);
      setIsOverlayOpen(true);
      setLikeCount(0);
      setBroadcasters([]);
      setHostId(null);
      setPendingRequests([]);
      pendingPeersRef.current.clear();
      closeAllPeers();

      try {
        const res = await api.get(`/live/${sid}`);
        const data = res.data?.data ?? res.data;
        setBroadcasterName(data.broadcasterName || '');
        setBroadcasterAvatar(data.broadcasterAvatar || '');
        setTitle(data.title || '');
        setHostId(data.hostId ?? null);
      } catch (_) {}

      wsSend({
        type: 'live:viewer_join',
        sessionId: sid,
        viewerId: user.id,
        viewerName: user.username || user.name || null,
      });
    },
    [user, wsSend, applyRole, applyIsBroadcaster, closeAllPeers]
  );

  // ── Close live ──
  const closeLive = useCallback(async () => {
    if (roleRef.current === 'host') {
      try {
        await api.post('/live/end', { sessionId });
      } catch (_) {}
      closeAllPeers();
      wsSend({ type: 'live:ended', sessionId });

      if (livePostIdRef.current) {
        try {
          await api.put(`/posts/${livePostIdRef.current}`, { isLive: false });
          log('Live post updated (isLive: false)', livePostIdRef.current);
        } catch (_) {}
        livePostIdRef.current = null;
      }
    } else if (sessionId) {
      wsSend({
        type: 'live:viewer_leave',
        sessionId,
        viewerId: user?.id,
      });
    }

    closeAllPeers();
    pendingPeersRef.current.clear();

    setIsOverlayOpen(false);
    applyRole(null);
    applyIsBroadcaster(false);
    setRequestingToBroadcast(false);
    setSessionId(null);
    setHostId(null);
    setTitle('');
    setBroadcasterName('');
    setBroadcasterAvatar('');
    setChatMessages([]);
    setViewerCount(0);
    setBroadcasters([]);
    setPendingRequests([]);
    setFloatingReactions([]);
    setLikeCount(0);
    // Legitimate stop point #1: tears down preview + send tracks.
    releaseLocalMedia();
    setMicMuted(false);
    setCamOff(false);
  }, [sessionId, user, wsSend, closeAllPeers, releaseLocalMedia, applyRole, applyIsBroadcaster]);

  // ── Toggles ── (flip the preview AND every outgoing track)
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const newState = !micMuted;
    setMicMuted(newState);
    setOutgoingEnabled('audio', !newState);
  }, [micMuted, setOutgoingEnabled]);

  const toggleCam = useCallback(() => {
    if (!localStreamRef.current) return;
    const newState = !camOff;
    setCamOff(newState);
    setOutgoingEnabled('video', !newState);
  }, [camOff, setOutgoingEnabled]);

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

  // ── Peer to peer ──
  const createPeerToBroadcaster = useCallback(
    (targetUserId: string | number) => {
      if (!sessionId || !user) return;
      const key = String(targetUserId);
      closePeer(key);

      const pc = new RTCPeerConnection(RTC_CONFIG);

      // Fresh, independent tracks — never the ones RTCView is rendering.
      const { sendStream, ownsTracks } = addSendableTracksTo(pc);

      attachOnTrack(pc, targetUserId, 'createPeer');

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

      peersRef.current[key] = { pc, sendStream, ownsSendTracks: ownsTracks };

      forceSendRecv(pc);
      pc.createOffer()
        .then((offer: any) => {
          logSdpDirections(`offer->${targetUserId}`, offer?.sdp);
          return pc.setLocalDescription(offer);
        })
        .then(() => {
          wsSend({
            type: 'live:offer',
            sessionId,
            offer: pc.localDescription,
            from: user.id,
            to: targetUserId,
          });
          log(`Offer sent to ${targetUserId}`);
        })
        .catch((err: any) =>
          console.error(`[Live] Offer error to ${targetUserId}:`, err)
        );
    },
    [sessionId, user, wsSend, closePeer, addSendableTracksTo, attachOnTrack]
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
            isBroadcasterRef.current &&
            sessionId === msg.sessionId &&
            viewerId !== user?.id
          ) {
            const key = String(viewerId);
            closePeer(key);

            const pc = new RTCPeerConnection(RTC_CONFIG);
            const { sendStream, ownsTracks } = addSendableTracksTo(pc);
            // Viewers only receive from us; log but don't render a tile.
            attachOnTrack(pc, viewerId, 'viewer_joined', false);
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
            peersRef.current[key] = { pc, sendStream, ownsSendTracks: ownsTracks };
            forceSendRecv(pc);
            pc.createOffer()
              .then((offer: any) => {
                logSdpDirections(`offer->viewer ${viewerId}`, offer?.sdp);
                return pc.setLocalDescription(offer);
              })
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
          if (isBroadcasterRef.current && sessionId === msg.sessionId) {
            closePeer(String(msg.viewerId));
          }
          break;
        }

        case 'live:viewer_count':
          if (sessionId === msg.sessionId) setViewerCount(msg.count);
          break;

        case 'live:like_count':
          if (sessionId === msg.sessionId) setLikeCount(msg.count);
          break;

        // A collaborator joined the room. Add them to the roster but DO NOT
        // dial — the collaborator is responsible for dialing everyone
        // after they acquire their own local stream.
        case 'live:new_broadcaster': {
          const {
            broadcasterId,
            broadcasterName: bn,
            broadcasterAvatar: ba,
          } = msg;
          if (String(broadcasterId) === String(user?.id)) break;
          setBroadcasters((prev) =>
            upsertBroadcaster(prev, {
              userId: broadcasterId,
              name: bn || 'Broadcaster',
              avatar: ba || '',
            })
          );
          break;
        }

        // Roster sent to the just-approved collaborator. Merge (never replace)
        // so we never drop a tile we already have.
        case 'live:existing_broadcasters': {
          const { broadcasters: existing } = msg;
          const filtered = (existing || []).filter(
            (b: any) => String(b.userId) !== String(user?.id)
          );
          setBroadcasters((prev) => {
            let next = prev;
            for (const b of filtered) {
              next = upsertBroadcaster(next, {
                userId: b.userId,
                name: b.name,
                avatar: b.avatar,
              });
            }
            return next;
          });
          filtered.forEach((b: any) =>
            pendingPeersRef.current.add(String(b.userId))
          );
          break;
        }

        case 'live:existing_viewers': {
          const { viewers } = msg;
          (viewers || []).forEach((v: any) => {
            if (String(v.userId) !== String(user?.id)) {
              pendingPeersRef.current.add(String(v.userId));
            }
          });
          break;
        }

        case 'live:peer_reset': {
          if (msg.sessionId !== sessionId) break;
          closePeer(String(msg.from));
          break;
        }

        case 'live:current_broadcasters': {
          const { broadcasters: current } = msg;
          // Merge, don't replace: preserve any streams we already have.
          setBroadcasters((prev) => {
            let next = prev;
            for (const b of current || []) {
              next = upsertBroadcaster(next, {
                userId: b.userId,
                name: b.name,
                avatar: b.avatar,
              });
            }
            return next;
          });
          break;
        }

        case 'live:request_broadcast': {
          const { userId: requesterId, userName, userAvatar } = msg;
          if (isBroadcaster && sessionId === msg.sessionId) {
            setPendingRequests((prev) => {
              if (prev.some((r) => String(r.userId) === String(requesterId))) {
                return prev;
              }
              return [
                ...prev,
                { userId: requesterId, name: userName, avatar: userAvatar },
              ];
            });
          }
          break;
        }

        // The viewer was approved. Acquire a stream, flip role, reset
        // every stale peer, and dial everyone. Crucially: merge — never
        // replace — so the host's tile is never dropped.
        case 'live:request_approved': {
          if (roleRef.current !== 'viewer' || sessionId !== msg.sessionId) break;

          (async () => {
            try {
              let stream = localStreamRef.current;
              if (!stream) {
                stream = await acquireLocalMedia(); // also caches localPreviewUrl
              } else {
                logStream('preview (reused)', stream);
                publishPreviewUrl(stream);
              }

              const selfId = user?.id;
              const selfName = user?.username || user?.name || 'You';
              const selfAvatar = (user as any)?.avatar || '';

              applyIsBroadcaster(true);
              applyRole('broadcaster');
              setRequestingToBroadcast(false);
              setMicMuted(false);
              setCamOff(false);

              // Merge our own tile in — DO NOT rebuild the list.
              setBroadcasters((prev) =>
                upsertBroadcaster(prev, {
                  userId: selfId!,
                  name: selfName,
                  avatar: selfAvatar,
                  stream,
                })
              );

              closeAllPeers();

              const targets = Array.from(pendingPeersRef.current);
              pendingPeersRef.current.clear();

              targets.forEach((id) =>
                wsSend({ type: 'live:peer_reset', sessionId, targetId: id })
              );

              targets.forEach((id) => createPeerToBroadcaster(id));
            } catch (err) {
              console.error(
                '[Live] Failed to acquire stream on approval:',
                err
              );
              Alert.alert('Error', 'Could not access camera/microphone.');
              setRequestingToBroadcast(false);
            }
          })();

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
          closePeer(key);
          logSdpDirections(`offer<-${from}`, offer?.sdp);

          const pc = new RTCPeerConnection(RTC_CONFIG);
          const sendable =
            localStreamRef.current && isBroadcasterRef.current
              ? addSendableTracksTo(pc)
              : { sendStream: null as MediaStream | null, ownsTracks: false };

          attachOnTrack(pc, from, 'offer');
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
          peersRef.current[key] = {
            pc,
            sendStream: sendable.sendStream,
            ownsSendTracks: sendable.ownsTracks,
          };

          pc.setRemoteDescription(new RTCSessionDescription(offer))
            .then(() => pc.createAnswer())
            .then((answer: any) => {
              logSdpDirections(`answer->${from}`, answer?.sdp);
              return pc.setLocalDescription(answer);
            })
            .then(() => {
              wsSend({
                type: 'live:answer',
                sessionId,
                answer: pc.localDescription,
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
          closePeer(String(broadcasterId));
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
      closePeer,
      closeAllPeers,
      addSendableTracksTo,
      attachOnTrack,
      acquireLocalMedia,
      publishPreviewUrl,
      applyRole,
      applyIsBroadcaster,
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
      'live:existing_viewers',
      'live:current_broadcasters',
      'live:broadcaster_left',
      'live:peer_reset',
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
  // Legitimate stop point #2: provider unmount.
  useEffect(() => {
    return () => {
      closeAllPeers();
      releaseLocalMedia(false); // no setState during unmount
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
    };
  }, [closeAllPeers, releaseLocalMedia]);

  const value: LiveContextValue = {
    activeSessions,
    isLoadingSessions,
    role,
    sessionId,
    hostId,
    title,
    broadcasterName,
    broadcasterAvatar,
    viewerCount,
    chatMessages,
    localStream: localStreamRef.current,
    localPreviewUrl,
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