import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Modal,
  ScrollView,
  Share,
  Alert,
  StyleSheet,
  Dimensions,
} from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { usePostActions } from '../hooks/useFeed';
import { useTheme } from '../contexts/ThemeContext';
import { useLive } from '../contexts/LiveContext';
import { Avatar } from './Avatar';
import VerificationBadge from './VerificationBadge';
import { timeAgo, formatNumber, safeString } from '../utils/helpers';
import { extractMentions } from '../lib/formatText';
import api from '../api/client';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Helpers ─────────────────────────────────────────────────
function isUserInList(list: any, currentUserId: any): boolean {
  if (!currentUserId) return false;
  if (!Array.isArray(list)) return false;
  const uid = String(currentUserId);
  return list.some((entry: any) => {
    if (entry == null) return false;
    if (typeof entry === 'string' || typeof entry === 'number') return String(entry) === uid;
    const candidate =
      entry.id ?? entry.userId ?? entry.user_id ?? entry.user?.id ?? entry.actorId ?? entry.actor_id;
    return candidate != null && String(candidate) === uid;
  });
}

function isLikedByMe(post: any, currentUserId: any): boolean {
  if (!post || !currentUserId) return false;
  const flag = post.likedByMe ?? post.liked_by_me ?? post.isLiked ?? post.is_liked ?? post.liked;
  if (typeof flag === 'boolean') return flag;
  return isUserInList(post.likes, currentUserId);
}

function isRepostedByMe(post: any, currentUserId: any): boolean {
  if (!post || !currentUserId) return false;
  const flag = post.repostedByMe ?? post.reposted_by_me ?? post.isReposted ?? post.is_reposted ?? post.reposted;
  if (typeof flag === 'boolean') return flag;
  return isUserInList(post.reposts, currentUserId);
}

function getLikeCount(post: any): number {
  if (!post) return 0;
  if (typeof post.likesCount === 'number') return post.likesCount;
  if (typeof post.likeCount === 'number') return post.likeCount;
  if (typeof post.like_count === 'number') return post.like_count;
  if (Array.isArray(post.likes)) return post.likes.length;
  return 0;
}

function getRepostCount(post: any): number {
  if (!post) return 0;
  if (typeof post.repostsCount === 'number') return post.repostsCount;
  if (typeof post.repostCount === 'number') return post.repostCount;
  if (typeof post.repost_count === 'number') return post.repost_count;
  if (Array.isArray(post.reposts)) return post.reposts.length;
  return 0;
}

function getCommentCount(post: any, fallbackComments?: any[]): number {
  if (!post) return fallbackComments?.length || 0;
  if (typeof post.commentCount === 'number') return post.commentCount;
  if (typeof post.comment_count === 'number') return post.comment_count;
  if (Array.isArray(post.comments)) return post.comments.length;
  if (Array.isArray(fallbackComments)) return fallbackComments.length;
  return 0;
}

function getVideoViewCount(post: any): number {
  if (!post) return 0;
  if (typeof post.videoViews === 'number') return post.videoViews;
  if (typeof post.video_views === 'number') return post.video_views;
  if (typeof post.videoViewCount === 'number') return post.videoViewCount;
  if (typeof post.video_view_count === 'number') return post.video_view_count;
  return 0;
}

function formatDuration(ms: number): string {
  if (!ms || ms < 0 || !isFinite(ms)) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function throttle(fn: Function, limit: number) {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  return function (...args: any[]) {
    const now = Date.now();
    if (!pending) {
      pending = true;
      timeoutId = setTimeout(() => {
        pending = false;
        if (now - lastCall >= limit) {
          lastCall = now;
          fn(...args);
        }
      }, limit);
    }
  };
}

// ─── Rich text tokenizer for mentions / hashtags / URLs ──────
type RichToken =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; username: string }
  | { type: 'hashtag'; value: string; tag: string }
  | { type: 'url'; value: string };

// Matches URLs first, then @mentions, then #hashtags. Word-boundary
// checks are done manually in the loop so we don't rely on lookbehind
// (Hermes doesn't support it everywhere).
const RICH_TOKEN_REGEX = /(https?:\/\/[^\s]+)|@([\w\u00C0-\u017F\-]+)|#([\w\u00C0-\u017F]+)/g;

function tokenizeRichText(text: string): RichToken[] {
  const tokens: RichToken[] = [];
  if (!text) return tokens;

  RICH_TOKEN_REGEX.lastIndex = 0;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = RICH_TOKEN_REGEX.exec(text)) !== null) {
    const [full, url, mention, hashtag] = match;
    const start = match.index;
    const prevChar = start > 0 ? text[start - 1] : '';
    // Same rule as formatText.js's `(?<!\w)`: the @ or # must not be
    // preceded by a word character (so emails and #hashtag-within-word
    // don't trigger).
    const boundaryOk = start === 0 || !/[A-Za-z0-9_]/.test(prevChar);

    if (url) {
      if (start > lastIndex) tokens.push({ type: 'text', value: text.slice(lastIndex, start) });
      tokens.push({ type: 'url', value: url });
      lastIndex = start + full.length;
      continue;
    }

    if (!boundaryOk) continue;

    if (mention) {
      if (start > lastIndex) tokens.push({ type: 'text', value: text.slice(lastIndex, start) });
      tokens.push({ type: 'mention', value: full, username: mention });
      lastIndex = start + full.length;
      continue;
    }

    if (hashtag) {
      if (start > lastIndex) tokens.push({ type: 'text', value: text.slice(lastIndex, start) });
      tokens.push({ type: 'hashtag', value: full, tag: hashtag });
      lastIndex = start + full.length;
      continue;
    }
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}

// ─── RichText component ──────────────────────────────────────
interface RichTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  mentionStyle?: StyleProp<TextStyle>;
  hashtagStyle?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
  onPress?: () => void;
  onMentionPress?: (username: string) => void;
  onHashtagPress?: (tag: string) => void;
  onUrlPress?: (url: string) => void;
}

function RichText({
  text,
  style,
  mentionStyle,
  hashtagStyle,
  linkStyle,
  numberOfLines,
  onPress,
  onMentionPress,
  onHashtagPress,
  onUrlPress,
}: RichTextProps) {
  const tokens = useMemo(() => tokenizeRichText(text), [text]);

  return (
    <Text
      style={style}
      numberOfLines={numberOfLines}
      onPress={onPress}
      suppressHighlighting
    >
      {tokens.map((tok, i) => {
        if (tok.type === 'mention' && onMentionPress) {
          return (
            <Text
              key={i}
              style={mentionStyle}
              onPress={() => onMentionPress(tok.username)}
              suppressHighlighting
            >
              {tok.value}
            </Text>
          );
        }
        if (tok.type === 'hashtag' && onHashtagPress) {
          return (
            <Text
              key={i}
              style={hashtagStyle}
              onPress={() => onHashtagPress(tok.tag)}
              suppressHighlighting
            >
              {tok.value}
            </Text>
          );
        }
        if (tok.type === 'url' && onUrlPress) {
          return (
            <Text
              key={i}
              style={linkStyle}
              onPress={() => onUrlPress(tok.value)}
              suppressHighlighting
            >
              {tok.value}
            </Text>
          );
        }
        return <Text key={i}>{tok.value}</Text>;
      })}
    </Text>
  );
}

export interface Post {
  id: string;
  text: string;
  image?: string | null;
  video?: string | null;
  createdAt: string;
  likes: string[];
  comments: any[];
  reposts: string[];
  shares: number;
  viewCount: number;
  videoViews: number;
  isLive: boolean;
  liveSessionId?: string | null;
  commentCount: number;
  repostCount: number;
  isRepost: boolean;
  originalPost?: Post | null;
  groupId?: string | null;
  reasons: string[];
  user: {
    id: string;
    name: string;
    username: string;
    avatar?: string | null;
    verified: boolean;
  };
}

interface PostCardProps {
  post: Post;
  onComment?: (postId: string) => void;
  onQuote?: (postId: string) => void;
  groupMap?: Map<string, { displayName: string; topic: string }>;
  isMentioned?: boolean;
  showFollowButton?: boolean;
  isFollowing?: boolean;
  onFollowToggle?: () => void;
  isVisible?: boolean;
}

const throttleLinkPreview = throttle((fn: Function) => fn(), 500);

function PostCard({
  post,
  onComment,
  onQuote,
  groupMap = new Map(),
  isMentioned = false,
  showFollowButton = false,
  isFollowing = false,
  onFollowToggle,
  isVisible = true,
}: PostCardProps) {
  const navigation = useNavigation();
  const { user: currentUser } = useAuth();
  const { colors, isDark } = useTheme();
  const { likePost, unlikePost, repost: repostPost } = usePostActions(currentUser);
  const { watchSession } = useLive();

  const {
    id = '', text = '', image = null, video = null, createdAt = '',
    shares = 0, viewCount = 0, videoViews = 0, isLive = false, liveSessionId = null,
    commentCount = 0, repostCount = 0, isRepost = false, originalPost = null,
    groupId = null, reasons = [], user = undefined
  } = post || {};

  const safeComments = Array.isArray(post?.comments) ? post.comments : [];

  const propLiked = isLikedByMe(post, currentUser?.id);
  const propLikeCount = getLikeCount(post);
  const propReposted = isRepostedByMe(post, currentUser?.id);
  const propRepostCount = getRepostCount(post);
  const propCommentCount = getCommentCount(post, safeComments);
  const propVideoViews = getVideoViewCount(post);

  const [localLiked, setLocalLiked] = useState(propLiked);
  const [localLikeCount, setLocalLikeCount] = useState(propLikeCount);
  const [localReposted, setLocalReposted] = useState(propReposted);
  const [localRepostCount, setLocalRepostCount] = useState(propRepostCount);
  const [localVideoViews, setLocalVideoViews] = useState(propVideoViews);

  useEffect(() => { setLocalLiked(propLiked); }, [propLiked]);
  useEffect(() => { setLocalLikeCount(propLikeCount); }, [propLikeCount]);
  useEffect(() => { setLocalReposted(propReposted); }, [propReposted]);
  useEffect(() => { setLocalRepostCount(propRepostCount); }, [propRepostCount]);
  useEffect(() => { setLocalVideoViews(propVideoViews); }, [propVideoViews]);

  const displayName = user?.name || 'Anonymous';
  const username = user?.username || '';
  const avatarUrl = user?.avatar || null;
  const isVerified = !!user?.verified;
  const userId = user?.id;

  const groupTopic = groupId ? (groupMap.get(groupId)?.displayName || groupMap.get(groupId)?.topic) : null;
  const relativeTime = timeAgo(createdAt);

  const isLivePost = !!isLive && !!liveSessionId;

  const [isExpanded, setIsExpanded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<View>(null);
  const [showReasons, setShowReasons] = useState(false);
  const reasonRef = useRef<View>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const videoRef = useRef<Video>(null);
  const videoViewRecorded = useRef(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [showVideoOverlay, setShowVideoOverlay] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  // ── Fullscreen video state ──
  const [videoFullscreen, setVideoFullscreen] = useState(false);
  const fullscreenVideoRef = useRef<Video>(null);
  const fsHasSeekedRef = useRef(false);
  const [fsIsPlaying, setFsIsPlaying] = useState(false);
  const [fsPositionMs, setFsPositionMs] = useState(0);
  const [fsDurationMs, setFsDurationMs] = useState(0);
  const [fsShowControls, setFsShowControls] = useState(true);
  const [fsProgressBarWidth, setFsProgressBarWidth] = useState(0);
  const fsControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMentionedInText = useMemo(() => {
    if (!currentUser || !text) return false;
    const mentions = extractMentions(text);
    return mentions.some((m: string) => m.toLowerCase() === currentUser.username?.toLowerCase());
  }, [text, currentUser]);

  const goToProfile = () => {
    if (userId) (navigation.navigate as any)('Profile', { userId });
    else if (username) (navigation.navigate as any)('Profile', { username });
  };
  const goToPostDetail = () => (navigation.navigate as any)('PostDetail', { postId: id });
  const handleEditPost = () => {
    setIsDropdownOpen(false);
    (navigation.navigate as any)('EditPost', { postId: id });
  };

  // ── Rich-text press handlers ──
  const handleMentionPress = (mentionedUsername: string) => {
    if (!mentionedUsername) return;
    (navigation.navigate as any)('Profile', { username: mentionedUsername });
  };

  const handleHashtagPress = (tag: string) => {
    if (!tag) return;
    (navigation.navigate as any)('TopicDetail', { topic: tag });
  };

  const handleUrlPress = (url: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open link.');
    });
  };

  const handleOpenLive = () => {
    if (!liveSessionId) return;
    watchSession(liveSessionId);
  };

  const previewFetchedRef = useRef(false);

  useEffect(() => {
    if (!post || !isVisible || previewFetchedRef.current) return;
    if (image || video || !text) return;
    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    if (!urlMatch) return;
    const url = urlMatch[0];

    previewFetchedRef.current = true;
    const controller = new AbortController();

    throttleLinkPreview(() => {
      if (!post || !isVisible || previewFetchedRef.current === false) return;
      setPreviewLoading(true);
      setPreviewError(false);

      api.get(`/link-preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
        .then((res) => {
          const data = res.data;
          if (data && (data.title || data.description || data.image)) {
            setPreviewData({ ...data, url });
          } else {
            setPreviewError(true);
          }
        })
        .catch((err: any) => {
          if (err?.name === 'CanceledError' || err?.name === 'AbortError') {
            previewFetchedRef.current = false;
          } else {
            setPreviewError(true);
          }
        })
        .finally(() => setPreviewLoading(false));
    });

    return () => {
      controller.abort();
      previewFetchedRef.current = false;
    };
  }, [id, text, image, video, isVisible]);

  useEffect(() => {
    if (!isVisible) {
      videoRef.current?.pauseAsync?.().catch(() => {});
      setIsPlaying(false);
      setShowVideoOverlay(true);
    }
  }, [isVisible]);

  useEffect(() => {
    return () => {
      if (fsControlsTimeout.current) clearTimeout(fsControlsTimeout.current);
    };
  }, []);

  const handleVideoPlaybackStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setIsPlaying(!!status.isPlaying);
    setPositionMs(status.positionMillis ?? 0);
    setDurationMs(status.durationMillis ?? 0);

    if (status.didJustFinish) {
      videoRef.current?.setPositionAsync(0).catch(() => {});
      videoRef.current?.pauseAsync().catch(() => {});
      setIsPlaying(false);
      setShowVideoOverlay(true);
      setPositionMs(0);
    }

    if (videoViewRecorded.current) return;
    if (status.durationMillis && status.positionMillis / status.durationMillis > 0.3) {
      videoViewRecorded.current = true;
      const watchedSeconds = Math.round(status.positionMillis / 1000);
      const duration = Math.round(status.durationMillis / 1000);
      api.post(`/posts/${id}/video-view`, { watchedSeconds, duration })
        .then((res) => {
          const body = res.data?.data ?? res.data ?? {};
          if (body?.counted && typeof body.views === 'number') {
            setLocalVideoViews(body.views);
          }
        })
        .catch(() => {});
    }
  };

  const handleVideoAreaPress = async () => {
    if (!videoRef.current) return;
    try {
      const status = await videoRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        setShowVideoOverlay((prev) => !prev);
      } else {
        if (status.durationMillis && status.positionMillis >= status.durationMillis - 100) {
          await videoRef.current.setPositionAsync(0);
        }
        await videoRef.current.playAsync();
        setShowVideoOverlay(false);
      }
    } catch (err) {
      console.warn('Video press error:', err);
    }
  };

  const handleOverlayButtonPress = async () => {
    if (!videoRef.current) return;
    try {
      const status = await videoRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await videoRef.current.pauseAsync();
        setShowVideoOverlay(true);
      } else {
        if (status.durationMillis && status.positionMillis >= status.durationMillis - 100) {
          await videoRef.current.setPositionAsync(0);
        }
        await videoRef.current.playAsync();
        setShowVideoOverlay(false);
      }
    } catch (err) {
      console.warn('Video button error:', err);
    }
  };

  const handleSeek = async (locationX: number) => {
    if (!videoRef.current || !durationMs || !progressBarWidth) return;
    const ratio = Math.max(0, Math.min(1, locationX / progressBarWidth));
    const targetMs = Math.round(ratio * durationMs);
    try {
      await videoRef.current.setPositionAsync(targetMs);
      setPositionMs(targetMs);
    } catch (err) {
      console.warn('Seek failed:', err);
    }
  };

  // ── Fullscreen video handlers ──
  const scheduleFsControlsHide = () => {
    if (fsControlsTimeout.current) clearTimeout(fsControlsTimeout.current);
    fsControlsTimeout.current = setTimeout(() => setFsShowControls(false), 3000);
  };

  const openVideoFullscreen = async () => {
    if (!video) return;
    fsHasSeekedRef.current = false;

    try {
      const status = await videoRef.current?.getStatusAsync();
      if (status && status.isLoaded) {
        setFsPositionMs(status.positionMillis ?? 0);
        setFsDurationMs(status.durationMillis ?? 0);
        await videoRef.current?.pauseAsync();
      }
    } catch {}

    setVideoFullscreen(true);
    setFsShowControls(true);
    scheduleFsControlsHide();
  };

  const closeVideoFullscreen = async () => {
    let pos = fsPositionMs;
    try {
      const status = await fullscreenVideoRef.current?.getStatusAsync();
      if (status && status.isLoaded) pos = status.positionMillis ?? pos;
      await fullscreenVideoRef.current?.pauseAsync();
    } catch {}

    setVideoFullscreen(false);

    try {
      await videoRef.current?.setPositionAsync(pos);
      setPositionMs(pos);
    } catch {}
    setShowVideoOverlay(true);
  };

  const handleFullscreenStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setFsIsPlaying(!!status.isPlaying);
    setFsPositionMs(status.positionMillis ?? 0);
    setFsDurationMs(status.durationMillis ?? 0);

    if (status.didJustFinish) {
      fullscreenVideoRef.current?.setPositionAsync(0).catch(() => {});
      fullscreenVideoRef.current?.pauseAsync().catch(() => {});
      setFsIsPlaying(false);
      setFsShowControls(true);
    }
  };

  const handleFullscreenVideoLoad = async () => {
    if (fsHasSeekedRef.current) return;
    fsHasSeekedRef.current = true;
    try {
      if (fsPositionMs > 0) {
        await fullscreenVideoRef.current?.setPositionAsync(fsPositionMs);
      }
      await fullscreenVideoRef.current?.playAsync();
    } catch {}
  };

  const toggleFsPlayPause = async () => {
    try {
      const status = await fullscreenVideoRef.current?.getStatusAsync();
      if (!status || !status.isLoaded) return;
      if (status.isPlaying) {
        await fullscreenVideoRef.current?.pauseAsync();
      } else {
        if (status.durationMillis && status.positionMillis >= status.durationMillis - 100) {
          await fullscreenVideoRef.current?.setPositionAsync(0);
        }
        await fullscreenVideoRef.current?.playAsync();
      }
      scheduleFsControlsHide();
    } catch {}
  };

  const toggleFsControls = () => {
    setFsShowControls((prev) => {
      const next = !prev;
      if (next) scheduleFsControlsHide();
      else if (fsControlsTimeout.current) clearTimeout(fsControlsTimeout.current);
      return next;
    });
  };

  const handleFsSeek = async (locationX: number) => {
    if (!fullscreenVideoRef.current || !fsDurationMs || !fsProgressBarWidth) return;
    const ratio = Math.max(0, Math.min(1, locationX / fsProgressBarWidth));
    const targetMs = Math.round(ratio * fsDurationMs);
    try {
      await fullscreenVideoRef.current.setPositionAsync(targetMs);
      setFsPositionMs(targetMs);
      scheduleFsControlsHide();
    } catch {}
  };

  const handleLike = async () => {
    if (!currentUser) {
      Alert.alert('Sign In Required', 'Please log in to like posts.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log In', onPress: () => (navigation.navigate as any)('Login') },
      ]);
      return;
    }
    const wasLiked = localLiked;
    const prevCount = localLikeCount;
    setLocalLiked(!wasLiked);
    setLocalLikeCount(wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1);
    try {
      if (wasLiked) await unlikePost(id);
      else await likePost(id);
    } catch (error: any) {
      setLocalLiked(wasLiked);
      setLocalLikeCount(prevCount);
      console.warn('Like failed:', error);
      if (error.response?.status === 401) {
        Alert.alert('Session Expired', 'Please log in again to continue.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log In', onPress: () => (navigation.navigate as any)('Login') },
        ]);
      } else {
        Alert.alert('Error', 'Failed to like post. Please try again.');
      }
    }
  };

  const handleRepost = async () => {
    if (!currentUser) {
      Alert.alert('Sign In Required', 'Please log in to repost.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log In', onPress: () => (navigation.navigate as any)('Login') },
      ]);
      return;
    }
    const wasReposted = localReposted;
    const prevCount = localRepostCount;
    setLocalReposted(!wasReposted);
    setLocalRepostCount(wasReposted ? Math.max(0, prevCount - 1) : prevCount + 1);
    try {
      await repostPost(id);
    } catch (error: any) {
      setLocalReposted(wasReposted);
      setLocalRepostCount(prevCount);
      console.warn('Repost failed:', error);
    }
  };

  const handleComment = () => {
    (navigation.navigate as any)('PostDetail', { postId: id, focusComment: true });
    onComment?.(id);
  };

  const handleShare = async () => {
    try { await Share.share({ message: text || 'Check this post!' }); } catch (e) {}
  };
  const handleQuote = () => onQuote && onQuote(id);

  const toggleExpand = () => setIsExpanded(!isExpanded);
  const shouldTruncate = text?.length > 200 && !isExpanded;

  const openLightbox = () => setLightboxVisible(true);
  const closeLightbox = () => setLightboxVisible(false);

  const renderMentionBadge = () => {
    if (!isMentionedInText && !isMentioned) return null;
    return (
      <View style={[styles.mentionBadge, { backgroundColor: isDark ? '#374151' : '#eff6ff' }]}>
        <Feather name="info" size={12} color="#3b82f6" />
        <Text style={[styles.mentionBadgeText, { color: '#3b82f6' }]}>Mentioned</Text>
      </View>
    );
  };

  const renderLivePreview = () => {
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handleOpenLive}
        style={[styles.livePreview, { backgroundColor: '#0f172a' }]}
      >
        <View style={styles.liveGlow} pointerEvents="none" />

        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>

        <View style={styles.liveCenter}>
          <View style={styles.liveAvatarWrap}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.liveAvatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.liveAvatar, styles.liveAvatarFallback]}>
                <Feather name="user" size={28} color="#9ca3af" />
              </View>
            )}
          </View>
          <Text style={styles.liveName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.liveHint}>Tap to watch live</Text>
        </View>

        <View style={styles.livePlayWrap}>
          <Feather name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderMedia = () => {
    if (isLivePost) return renderLivePreview();

    if (video) {
      const progressRatio = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

      return (
        <View style={styles.mediaContainer}>
          {videoError ? (
            <View style={[styles.videoErrorContainer, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
              <Feather name="video-off" size={32} color={colors.textMuted} />
              <Text style={[styles.videoErrorText, { color: colors.textSecondary }]}>Video failed to load</Text>
            </View>
          ) : isVisible ? (
            <>
              <TouchableOpacity
                activeOpacity={1}
                onPress={handleVideoAreaPress}
                style={styles.videoTouchable}
              >
                <Video
                  ref={videoRef}
                  source={{ uri: video }}
                  style={styles.mediaPlayer}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay={false}
                  isLooping={false}
                  isMuted={false}
                  useNativeControls={false}
                  progressUpdateIntervalMillis={250}
                  onError={() => setVideoError(true)}
                  onPlaybackStatusUpdate={handleVideoPlaybackStatus}
                />
              </TouchableOpacity>

              {showVideoOverlay && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleOverlayButtonPress}
                  style={styles.centerPlayOverlay}
                >
                  <View style={styles.centerPlayButton}>
                    <Feather
                      name={isPlaying ? 'pause' : 'play'}
                      size={32}
                      color="#ffffff"
                      style={!isPlaying ? { marginLeft: 4 } : undefined}
                    />
                  </View>
                </TouchableOpacity>
              )}

              {localVideoViews > 0 && (
                <View style={styles.videoViewsOverlay} pointerEvents="none">
                  <Feather name="eye" size={12} color="#ffffff" />
                  <Text style={styles.videoViewsText}>
                    {formatNumber(localVideoViews)}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                onPress={openVideoFullscreen}
                style={styles.fullscreenButton}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="maximize-2" size={16} color="#ffffff" />
              </TouchableOpacity>

              {durationMs > 0 && (
                <View style={styles.progressContainer}>
                  <Text style={styles.progressTime}>
                    {formatDuration(positionMs)}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={1}
                    onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
                    onPress={(e) => handleSeek(e.nativeEvent.locationX)}
                    style={styles.progressBarTouchable}
                  >
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${progressRatio * 100}%` },
                        ]}
                      />
                      <View
                        style={[
                          styles.progressThumb,
                          { left: `${progressRatio * 100}%` },
                        ]}
                      />
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.progressTime}>
                    {formatDuration(durationMs)}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={[styles.videoPlaceholder, { backgroundColor: isDark ? '#374151' : '#1f2937' }]}>
              <Feather name="play-circle" size={40} color={colors.textMuted} />
            </View>
          )}
        </View>
      );
    }

    if (image) {
      return (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={openLightbox}
          style={styles.mediaContainer}
        >
          <Image
            source={{ uri: image }}
            style={[styles.mediaImage, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            recyclingKey={image}
            onError={() => console.log('Image failed to load:', image)}
          />
        </TouchableOpacity>
      );
    }

    return null;
  };

  const renderViewCounts = () => {
    const count = (viewCount || 0) + (localVideoViews || 0);
    if (count === 0) return null;
    return (
      <View style={styles.viewCountRow}>
        <Feather name="eye" size={14} color={colors.textMuted} />
        <Text style={[styles.viewCountText, { color: colors.textMuted }]}>{formatNumber(count)}</Text>
      </View>
    );
  };

  const renderReasonButton = () => {
    if (!reasons || reasons.length === 0) return null;
    return (
      <View ref={reasonRef}>
        <TouchableOpacity onPress={() => setShowReasons(!showReasons)} style={styles.reasonButton}>
          <Feather name="info" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        {showReasons && (
          <View style={[styles.reasonPopover, {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: isDark ? 'transparent' : '#000',
          }]}>
            <Text style={[styles.reasonTitle, { color: colors.text }]}>Why you're seeing this</Text>
            {reasons.map((reason: string, i: number) => (
              <Text key={i} style={[styles.reasonItem, { color: colors.textSecondary }]}>• {reason}</Text>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderDropdown = () => (
    <View ref={dropdownRef}>
      <TouchableOpacity onPress={() => setIsDropdownOpen(!isDropdownOpen)} style={styles.dropdownButton}>
        <Feather name="more-horizontal" size={20} color={colors.textMuted} />
      </TouchableOpacity>
      {isDropdownOpen && (
        <View style={[styles.dropdownMenu, {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: isDark ? 'transparent' : '#000',
        }]}>
          <TouchableOpacity onPress={() => { Alert.alert('Download', 'Image download not implemented yet.'); setIsDropdownOpen(false); }} style={styles.dropdownItem}>
            <Feather name="download" size={16} color={colors.text} />
            <Text style={[styles.dropdownItemText, { color: colors.text }]}>Download as Image</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { Alert.alert('Share', 'Image sharing not implemented yet.'); setIsDropdownOpen(false); }} style={styles.dropdownItem}>
            <Feather name="share" size={16} color={colors.text} />
            <Text style={[styles.dropdownItemText, { color: colors.text }]}>Share as Image</Text>
          </TouchableOpacity>
          {image && (
            <>
              <View style={[styles.dropdownDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity onPress={() => { Alert.alert('Download', 'Original image download not implemented yet.'); setIsDropdownOpen(false); }} style={styles.dropdownItem}>
                <Feather name="image" size={16} color={colors.text} />
                <Text style={[styles.dropdownItemText, { color: colors.text }]}>Download Original</Text>
              </TouchableOpacity>
            </>
          )}
          {userId === currentUser?.id && (
            <>
              <View style={[styles.dropdownDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity onPress={handleEditPost} style={styles.dropdownItem}>
                <Feather name="edit-2" size={16} color={colors.text} />
                <Text style={[styles.dropdownItemText, { color: colors.text }]}>Edit Post</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );

  if (!post) return null;

  if (isRepost && (!text || text.trim() === '') && originalPost) {
    return (
      <View style={[styles.repostWrapper, { borderBottomColor: colors.border }]}>
        <View style={styles.repostBanner}>
          <Feather name="repeat" size={14} color={colors.textMuted} />
          <Text style={[styles.repostBannerText, { color: colors.textSecondary }]}>{displayName} reposted</Text>
          <Text style={[styles.repostBannerTime, { color: colors.textMuted }]}>{relativeTime}</Text>
        </View>
        <PostCard post={originalPost} groupMap={groupMap} onComment={onComment} onQuote={onQuote} isMentioned={isMentioned} isVisible={isVisible} />
      </View>
    );
  }

  const hasMedia = !!(image || video) || isLivePost;

  return (
    <View style={[styles.card, { borderBottomColor: colors.border }]}>
      {isRepost && originalPost && (
        <View style={styles.repostBanner}>
          <Feather name="repeat" size={14} color={colors.textMuted} />
          <Text style={[styles.repostBannerText, { color: colors.textSecondary }]}>{displayName} quoted</Text>
          <Text style={[styles.repostBannerTime, { color: colors.textMuted }]}>{relativeTime}</Text>
        </View>
      )}

      <View style={styles.cardInner}>
        <TouchableOpacity onPress={goToProfile} style={styles.avatarTouch}>
          <Avatar source={avatarUrl} size={40} fallback={displayName} />
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={styles.userInfo}>
              <TouchableOpacity onPress={goToProfile} style={styles.nameContainer}>
                <Text style={[styles.name, { color: colors.text }]}>
                  {displayName}
                </Text>
                {isVerified && (
                  <VerificationBadge size={14} style={styles.verifiedBadge} />
                )}
              </TouchableOpacity>

              {isLivePost && (
                <View style={styles.liveIndicator}>
                  <View style={styles.liveIndicatorDot} />
                  <Text style={styles.liveIndicatorText}>LIVE</Text>
                </View>
              )}

              {renderMentionBadge()}

              {username && (
                <TouchableOpacity onPress={goToProfile}>
                  <Text style={[styles.username, { color: colors.textSecondary }]}>@{username}</Text>
                </TouchableOpacity>
              )}

              <Text style={[styles.time, { color: colors.textMuted }]}>· {relativeTime}</Text>

              {groupTopic && (
                <View style={[styles.groupBadge, { backgroundColor: isDark ? '#374151' : '#eff6ff' }]}>
                  <Text style={[styles.groupBadgeText, { color: '#3b82f6' }]}>{groupTopic}</Text>
                </View>
              )}
            </View>

            <View style={styles.actionsRow}>
              {renderViewCounts()}
              {renderReasonButton()}
              {renderDropdown()}
            </View>
          </View>

          {!!text && (
            <View>
              <RichText
                text={text}
                style={[styles.postText, { color: colors.text }]}
                mentionStyle={[styles.inlineLink, { color: colors.primary }]}
                hashtagStyle={[styles.inlineLink, { color: colors.primary }]}
                linkStyle={[styles.inlineLink, styles.inlineUrl, { color: colors.primary }]}
                numberOfLines={shouldTruncate ? 3 : undefined}
                onPress={goToPostDetail}
                onMentionPress={handleMentionPress}
                onHashtagPress={handleHashtagPress}
                onUrlPress={handleUrlPress}
              />
              {shouldTruncate && (
                <TouchableOpacity onPress={toggleExpand}>
                  <Text style={[styles.showMore, { color: colors.primary }]}>Show more</Text>
                </TouchableOpacity>
              )}
              {isExpanded && text?.length > 200 && (
                <TouchableOpacity onPress={toggleExpand}>
                  <Text style={[styles.showMore, { color: colors.primary }]}>Show less</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>

      {hasMedia && (
        <View style={styles.fullBleedWrapper}>
          {renderMedia()}
        </View>
      )}

      <View style={styles.cardInner}>
        <View style={styles.avatarTouch} />
        <View style={styles.content}>
          <View style={[styles.engagementBar, { marginTop: hasMedia ? 12 : 0 }]}>
            <TouchableOpacity style={styles.engagementButton} onPress={handleLike}>
              <Feather name="heart" size={22} color={localLiked ? '#ef4444' : colors.textMuted} />
              <Text style={[
                styles.engagementText,
                { color: localLiked ? '#ef4444' : colors.textSecondary },
              ]}>
                {localLikeCount}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.engagementButton} onPress={handleComment}>
              <Feather name="message-circle" size={22} color={colors.textMuted} />
              <Text style={[styles.engagementText, { color: colors.textSecondary }]}>
                {propCommentCount}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.engagementButton} onPress={handleRepost}>
              <Feather name="repeat" size={22} color={localReposted ? '#22c55e' : colors.textMuted} />
              <Text style={[
                styles.engagementText,
                { color: localReposted ? '#22c55e' : colors.textSecondary },
              ]}>
                {localRepostCount}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.engagementButton} onPress={handleShare}>
              <Feather name="share-2" size={22} color={colors.textMuted} />
              <Text style={[styles.engagementText, { color: colors.textSecondary }]}>{shares || 0}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Image lightbox ── */}
      <Modal visible={lightboxVisible} transparent>
        <SafeAreaView style={styles.lightbox}>
          <TouchableOpacity style={styles.lightboxClose} onPress={closeLightbox}>
            <Feather name="x" size={30} color="white" />
          </TouchableOpacity>
          <ScrollView
            contentContainerStyle={styles.lightboxScroll}
            maximumZoomScale={3}
            minimumZoomScale={1}
            centerContent
          >
            {image && (
              <Image
                source={{ uri: image }}
                style={styles.lightboxImage}
                contentFit="contain"
                transition={300}
                cachePolicy="memory-disk"
              />
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Fullscreen video ── */}
      <Modal
        visible={videoFullscreen}
        animationType="fade"
        transparent={false}
        statusBarTranslucent
        onRequestClose={closeVideoFullscreen}
        supportedOrientations={['portrait', 'landscape']}
      >
        <View style={styles.fsContainer}>
          <StatusBar hidden />

          <TouchableOpacity
            activeOpacity={1}
            onPress={toggleFsControls}
            style={styles.fsTouchable}
          >
            {video && (
              <Video
                ref={fullscreenVideoRef}
                source={{ uri: video }}
                style={styles.fsVideo}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
                isLooping={false}
                isMuted={false}
                useNativeControls={false}
                progressUpdateIntervalMillis={250}
                onLoad={handleFullscreenVideoLoad}
                onPlaybackStatusUpdate={handleFullscreenStatus}
              />
            )}
          </TouchableOpacity>

          {fsShowControls && (
            <>
              <TouchableOpacity
                onPress={closeVideoFullscreen}
                style={styles.fsClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={26} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={toggleFsPlayPause}
                style={styles.fsCenterButton}
              >
                <View style={styles.fsCenterButtonInner}>
                  <Feather
                    name={fsIsPlaying ? 'pause' : 'play'}
                    size={40}
                    color="#ffffff"
                    style={!fsIsPlaying ? { marginLeft: 6 } : undefined}
                  />
                </View>
              </TouchableOpacity>

              <View style={styles.fsBottomBar}>
                <Text style={styles.fsTime}>{formatDuration(fsPositionMs)}</Text>
                <TouchableOpacity
                  activeOpacity={1}
                  onLayout={(e) => setFsProgressBarWidth(e.nativeEvent.layout.width)}
                  onPress={(e) => handleFsSeek(e.nativeEvent.locationX)}
                  style={styles.fsProgressTouchable}
                >
                  <View style={styles.fsProgressTrack}>
                    <View
                      style={[
                        styles.fsProgressFill,
                        {
                          width: `${
                            fsDurationMs > 0
                              ? Math.min(100, (fsPositionMs / fsDurationMs) * 100)
                              : 0
                          }%`,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.fsProgressThumb,
                        {
                          left: `${
                            fsDurationMs > 0
                              ? Math.min(100, (fsPositionMs / fsDurationMs) * 100)
                              : 0
                          }%`,
                        },
                      ]}
                    />
                  </View>
                </TouchableOpacity>
                <Text style={styles.fsTime}>{formatDuration(fsDurationMs)}</Text>

                <TouchableOpacity
                  onPress={closeVideoFullscreen}
                  style={styles.fsExitButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="minimize-2" size={18} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

export default React.memo(PostCard);

const styles = StyleSheet.create({
  card: {
    borderBottomWidth: 1,
    paddingHorizontal: 0,
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  repostWrapper: {
    paddingHorizontal: 0,
    paddingVertical: 8,
    borderBottomWidth: 1,
    backgroundColor: 'transparent',
  },
  repostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 44,
    marginBottom: 4,
  },
  repostBannerText: { fontSize: 12, marginLeft: 4 },
  repostBannerTime: { fontSize: 12, marginLeft: 8 },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
  },
  avatarTouch: { width: 40, marginRight: 12 },
  content: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    flex: 1,
  },
  nameContainer: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700' },
  verifiedBadge: { marginLeft: 4 },
  username: { fontSize: 13, marginLeft: 4 },
  time: { fontSize: 13, marginLeft: 4 },
  groupBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginLeft: 6 },
  groupBadgeText: { fontSize: 11 },

  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#ef4444',
    marginLeft: 6,
  },
  liveIndicatorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
  },
  liveIndicatorText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  actionsRow: { flexDirection: 'row', alignItems: 'center' },
  viewCountRow: { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  viewCountText: { fontSize: 12, marginLeft: 4 },
  reasonButton: { padding: 4 },
  reasonPopover: {
    position: 'absolute', top: 28, right: 0, borderWidth: 1, borderRadius: 8,
    padding: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, width: 200, zIndex: 10,
  },
  reasonTitle: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  reasonItem: { fontSize: 12, marginTop: 4 },
  dropdownButton: { padding: 4 },
  dropdownMenu: {
    position: 'absolute', right: 0, top: 28, borderWidth: 1, borderRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
    minWidth: 160, paddingVertical: 4, zIndex: 10,
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  dropdownItemText: { fontSize: 14, marginLeft: 12 },
  dropdownDivider: { height: 1, marginVertical: 4 },
  mentionBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginLeft: 6,
  },
  mentionBadgeText: { fontSize: 11, marginLeft: 4 },
  postText: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  showMore: { fontSize: 14, marginTop: 4 },

  // ── Inline rich text link styles ──
  inlineLink: {
    fontWeight: '600',
  },
  inlineUrl: {
    textDecorationLine: 'underline',
  },

  fullBleedWrapper: { width: '100%', marginTop: 12 },

  livePreview: {
    width: '100%',
    height: SCREEN_WIDTH * 0.75,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveGlow: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 260,
    height: 260,
    marginLeft: -130,
    marginTop: -130,
    borderRadius: 130,
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#ef4444',
    zIndex: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  liveCenter: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  liveAvatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#ef4444',
    marginBottom: 12,
  },
  liveAvatar: {
    width: '100%',
    height: '100%',
  },
  liveAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2937',
  },
  liveName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: SCREEN_WIDTH * 0.7,
  },
  liveHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  livePlayWrap: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },

  mediaContainer: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000',
  },
  videoTouchable: {
    width: '100%',
  },
  mediaPlayer: { width: '100%', height: SCREEN_WIDTH * 0.5625 },
  mediaImage: { width: '100%', height: SCREEN_WIDTH },
  videoPlaceholder: {
    width: '100%', height: SCREEN_WIDTH * 0.5625,
    alignItems: 'center', justifyContent: 'center',
  },
  videoErrorContainer: { padding: 24, alignItems: 'center' },
  videoErrorText: { fontSize: 14, marginTop: 8 },

  centerPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlayButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },

  videoViewsOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  videoViewsText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },

  fullscreenButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 3,
  },

  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  progressTime: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    minWidth: 34,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  progressBarTouchable: {
    flex: 1,
    paddingVertical: 8,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    position: 'relative',
    justifyContent: 'center',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
    marginLeft: -5,
    top: -3.5,
  },

  engagementBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  engagementButton: { flexDirection: 'row', alignItems: 'center' },
  engagementText: { fontSize: 14, marginLeft: 6 },
  lightbox: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center', alignItems: 'center',
  },
  lightboxClose: { position: 'absolute', top: 40, right: 20, zIndex: 10 },
  lightboxScroll: { flexGrow: 1, justifyContent: 'center' },
  lightboxImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 1.2 },

  // ── Fullscreen video modal ──
  fsContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fsTouchable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsVideo: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  fsClose: {
    position: 'absolute',
    top: 48,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  fsCenterButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -40,
    marginTop: -40,
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsCenterButtonInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  fsBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 12,
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  fsTime: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  fsProgressTouchable: {
    flex: 1,
    paddingVertical: 10,
  },
  fsProgressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    position: 'relative',
    justifyContent: 'center',
  },
  fsProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  fsProgressThumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    marginLeft: -6,
    top: -4.5,
  },
  fsExitButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
});