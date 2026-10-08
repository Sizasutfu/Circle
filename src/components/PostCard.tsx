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
  Pressable,
} from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { Image } from 'expo-image';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { usePostActions, useDeletePost } from '../hooks/useFeed';
import { useTheme } from '../contexts/ThemeContext';
import { useLive } from '../contexts/LiveContext';
import { Avatar } from './Avatar';
import VerificationBadge from './VerificationBadge';
import CommentSheet from './CommentSheet';
import { timeAgo, formatNumber, safeString } from '../utils/helpers';
import { extractMentions } from '../lib/formatText';
import api from '../api/client';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const DESTRUCTIVE = '#f4212e';

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

// ─── Private / non-previewable URL detection ────────────────
function isPrivateOrLocalUrl(url: string): boolean {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }

  if (host === 'localhost') return true;
  if (host === '127.0.0.1') return true;
  if (host === '0.0.0.0') return true;
  if (host.endsWith('.local')) return true;

  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;

  return false;
}

// ─── Rich text tokenizer ─────────────────────────────────────
type RichToken =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; username: string }
  | { type: 'hashtag'; value: string; tag: string }
  | { type: 'url'; value: string };

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
  onDeleteSuccess?: () => void;
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
  onDeleteSuccess,
}: PostCardProps) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useAuth();
  const { colors, isDark } = useTheme();
  const { likePost, unlikePost, repost: repostPost } = usePostActions(currentUser);
  const { mutateAsync: deletePost } = useDeletePost();
  const { watchSession } = useLive();

  const {
    id = '', text = '', image = null, video = null, createdAt = '',
    shares = 0, viewCount = 0, videoViews = 0, isLive = false, liveSessionId = null,
    commentCount = 0, repostCount = 0, isRepost = false, originalPost = null,
    groupId = null, reasons = [], user = undefined
  } = post || {};

  const isRepostBool = !!isRepost;
  const hasImage = !!image;
  const hasVideo = !!video;

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
  const username = user?.username || null;
  const avatarUrl = user?.avatar || null;
  const isVerified = !!user?.verified;
  const userId = user?.id;

  const groupTopic = groupId ? (groupMap.get(groupId)?.displayName || groupMap.get(groupId)?.topic) : null;
  const relativeTime = timeAgo(createdAt);

  const isLivePost = !!isLive && !!liveSessionId;

  const [isExpanded, setIsExpanded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [commentSheetVisible, setCommentSheetVisible] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const reasonRef = useRef<View>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const videoViewRecorded = useRef(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [showVideoOverlay, setShowVideoOverlay] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  const [videoFullscreen, setVideoFullscreen] = useState(false);
  const fsHasSeekedRef = useRef(false);
  const fsOpenRef = useRef(false);
  const [fsIsPlaying, setFsIsPlaying] = useState(false);
  const [fsPositionMs, setFsPositionMs] = useState(0);
  const [fsDurationMs, setFsDurationMs] = useState(0);
  const [fsShowControls, setFsShowControls] = useState(true);
  const [fsProgressBarWidth, setFsProgressBarWidth] = useState(0);
  const fsControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const videoPlayer = useVideoPlayer(video ?? null, (player) => {
    player.loop = false;
    player.muted = false;
    player.timeUpdateEventInterval = 0.25;
    player.pause();
  });

  const fsVideoPlayer = useVideoPlayer(video ?? null, (player) => {
    player.loop = false;
    player.muted = false;
    player.timeUpdateEventInterval = 0.25;
    player.pause();
  });

  useEffect(() => {
    fsOpenRef.current = videoFullscreen;
  }, [videoFullscreen]);

  useEffect(() => {
    const subs = [
      videoPlayer.addListener('playingChange', ({ isPlaying: p }) => {
        setIsPlaying(!!p);
      }),

      videoPlayer.addListener('timeUpdate', ({ currentTime }) => {
        const posMs = (currentTime ?? 0) * 1000;
        const durMs = (videoPlayer.duration ?? 0) * 1000;
        setPositionMs(posMs);
        if (durMs > 0) setDurationMs(durMs);

        if (videoViewRecorded.current) return;
        if (durMs > 0 && posMs / durMs > 0.3) {
          videoViewRecorded.current = true;
          const watchedSeconds = Math.round(posMs / 1000);
          const duration = Math.round(durMs / 1000);
          api.post(`/posts/${id}/video-view`, { watchedSeconds, duration })
            .then((res) => {
              const body = res.data?.data ?? res.data ?? {};
              if (body?.counted && typeof body.views === 'number') {
                setLocalVideoViews(body.views);
              }
            })
            .catch(() => {});
        }
      }),

      videoPlayer.addListener('statusChange', ({ status }) => {
        if (status === 'readyToPlay') {
          setDurationMs((videoPlayer.duration ?? 0) * 1000);
        } else if (status === 'error') {
          setVideoError(true);
        }
      }),

      videoPlayer.addListener('playToEnd', () => {
        videoPlayer.currentTime = 0;
        videoPlayer.pause();
        setIsPlaying(false);
        setShowVideoOverlay(true);
        setPositionMs(0);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [videoPlayer, id]);

  useEffect(() => {
    const subs = [
      fsVideoPlayer.addListener('playingChange', ({ isPlaying: p }) => {
        setFsIsPlaying(!!p);
      }),

      fsVideoPlayer.addListener('timeUpdate', ({ currentTime }) => {
        setFsPositionMs((currentTime ?? 0) * 1000);
        const durMs = (fsVideoPlayer.duration ?? 0) * 1000;
        if (durMs > 0) setFsDurationMs(durMs);
      }),

      fsVideoPlayer.addListener('statusChange', ({ status }) => {
        if (status === 'readyToPlay') {
          setFsDurationMs((fsVideoPlayer.duration ?? 0) * 1000);

          if (fsOpenRef.current && !fsHasSeekedRef.current) {
            fsHasSeekedRef.current = true;
            if (fsPositionMs > 0) {
              fsVideoPlayer.currentTime = fsPositionMs / 1000;
            }
            fsVideoPlayer.play();
          }
        }
      }),

      fsVideoPlayer.addListener('playToEnd', () => {
        fsVideoPlayer.currentTime = 0;
        fsVideoPlayer.pause();
        setFsIsPlaying(false);
        setFsShowControls(true);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [fsVideoPlayer, fsPositionMs]);

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

  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);

  const handleSheetEdit = () => {
    closeMenu();
    setTimeout(() => {
      (navigation.navigate as any)('EditPost', { postId: id });
    }, 150);
  };

  const handleSheetDownload = () => {
    closeMenu();
    setTimeout(() => {
      Alert.alert('Download', 'Image download not implemented yet.');
    }, 150);
  };

  const handleSheetShare = () => {
    closeMenu();
    setTimeout(() => {
      Alert.alert('Share', 'Image sharing not implemented yet.');
    }, 150);
  };

  const handleSheetDelete = () => {
    closeMenu();
    setTimeout(() => {
      Alert.alert(
        'Delete Post?',
        'This will permanently delete your post. This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deletePost(id);
                onDeleteSuccess?.();
              } catch (err: any) {
                console.error('Delete post error:', err);
                Alert.alert(
                  'Error',
                  err?.response?.data?.message || 'Could not delete post.'
                );
              }
            },
          },
        ]
      );
    }, 150);
  };

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

    if (isPrivateOrLocalUrl(url)) {
      previewFetchedRef.current = true;
      return;
    }

    previewFetchedRef.current = true;
    const controller = new AbortController();

    throttleLinkPreview(() => {
      if (!post || !isVisible || previewFetchedRef.current === false) return;
      setPreviewLoading(true);
      setPreviewError(false);

      api.get(`/link-preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
        .then((res) => {
          if (res.status === 204) {
            setPreviewData(null);
            return;
          }
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
    if (!isVisible || !isFocused) {
      try { videoPlayer.pause(); } catch {}
      setIsPlaying(false);
      setShowVideoOverlay(true);
    }
  }, [isVisible, isFocused, videoPlayer]);

  useEffect(() => {
    return () => {
      if (fsControlsTimeout.current) clearTimeout(fsControlsTimeout.current);
    };
  }, []);

  const handleVideoAreaPress = () => {
    if (videoPlayer.playing) {
      setShowVideoOverlay((prev) => !prev);
    } else {
      const dur = videoPlayer.duration ?? 0;
      const cur = videoPlayer.currentTime ?? 0;
      if (dur > 0 && cur >= dur - 0.1) {
        videoPlayer.currentTime = 0;
      }
      videoPlayer.play();
      setShowVideoOverlay(false);
    }
  };

  const handleOverlayButtonPress = () => {
    if (videoPlayer.playing) {
      videoPlayer.pause();
      setShowVideoOverlay(true);
    } else {
      const dur = videoPlayer.duration ?? 0;
      const cur = videoPlayer.currentTime ?? 0;
      if (dur > 0 && cur >= dur - 0.1) {
        videoPlayer.currentTime = 0;
      }
      videoPlayer.play();
      setShowVideoOverlay(false);
    }
  };

  const handleSeek = (locationX: number) => {
    if (!durationMs || !progressBarWidth) return;
    const ratio = Math.max(0, Math.min(1, locationX / progressBarWidth));
    const targetMs = Math.round(ratio * durationMs);
    videoPlayer.currentTime = targetMs / 1000;
    setPositionMs(targetMs);
  };

  const scheduleFsControlsHide = () => {
    if (fsControlsTimeout.current) clearTimeout(fsControlsTimeout.current);
    fsControlsTimeout.current = setTimeout(() => setFsShowControls(false), 3000);
  };

  const openVideoFullscreen = () => {
    if (!video) return;
    fsHasSeekedRef.current = false;

    setFsPositionMs((videoPlayer.currentTime ?? 0) * 1000);
    setFsDurationMs((videoPlayer.duration ?? 0) * 1000);
    try { videoPlayer.pause(); } catch {}

    setVideoFullscreen(true);
    setFsShowControls(true);
    scheduleFsControlsHide();

    if ((fsVideoPlayer.duration ?? 0) > 0 && !fsHasSeekedRef.current) {
      fsHasSeekedRef.current = true;
      const resumeSec = (videoPlayer.currentTime ?? 0);
      if (resumeSec > 0) {
        fsVideoPlayer.currentTime = resumeSec;
      }
      fsVideoPlayer.play();
    }
  };

  const closeVideoFullscreen = () => {
    const pos = (fsVideoPlayer.currentTime ?? 0) * 1000;
    try { fsVideoPlayer.pause(); } catch {}

    setVideoFullscreen(false);

    videoPlayer.currentTime = pos / 1000;
    setPositionMs(pos);
    setShowVideoOverlay(true);
  };

  const toggleFsPlayPause = () => {
    if (fsVideoPlayer.playing) {
      fsVideoPlayer.pause();
    } else {
      const dur = fsVideoPlayer.duration ?? 0;
      const cur = fsVideoPlayer.currentTime ?? 0;
      if (dur > 0 && cur >= dur - 0.1) {
        fsVideoPlayer.currentTime = 0;
      }
      fsVideoPlayer.play();
    }
    scheduleFsControlsHide();
  };

  const toggleFsControls = () => {
    setFsShowControls((prev) => {
      const next = !prev;
      if (next) scheduleFsControlsHide();
      else if (fsControlsTimeout.current) clearTimeout(fsControlsTimeout.current);
      return next;
    });
  };

  const handleFsSeek = (locationX: number) => {
    if (!fsDurationMs || !fsProgressBarWidth) return;
    const ratio = Math.max(0, Math.min(1, locationX / fsProgressBarWidth));
    const targetMs = Math.round(ratio * fsDurationMs);
    fsVideoPlayer.currentTime = targetMs / 1000;
    setFsPositionMs(targetMs);
    scheduleFsControlsHide();
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
    setCommentSheetVisible(true);
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

  // ── Link preview card ──
  const renderLinkPreview = () => {
    if (!previewData) return null;

    const { title, description, image: previewImage, url } = previewData;
    if (!title && !description && !previewImage) return null;

    let hostname = '';
    try {
      hostname = new URL(url).hostname.replace(/^www\./, '');
    } catch {}

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => handleUrlPress(url)}
        style={[
          styles.linkPreviewCard,
          {
            backgroundColor: isDark ? '#1f2937' : '#f8f9fa',
            borderColor: colors.border,
          },
        ]}
      >
        {!!previewImage && (
          <Image
            source={{ uri: previewImage }}
            style={[
              styles.linkPreviewImage,
              { backgroundColor: isDark ? '#111827' : '#e5e7eb' },
            ]}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        )}

        <View style={styles.linkPreviewBody}>
          {!!hostname && (
            <Text
              style={[styles.linkPreviewHost, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {hostname}
            </Text>
          )}
          {!!title && (
            <Text
              style={[styles.linkPreviewTitle, { color: colors.text }]}
              numberOfLines={2}
            >
              {title}
            </Text>
          )}
          {!!description && (
            <Text
              style={[styles.linkPreviewDesc, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {description}
            </Text>
          )}
        </View>
      </TouchableOpacity>
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
          ) : (
            <>
              <TouchableOpacity
                activeOpacity={1}
                onPress={handleVideoAreaPress}
                style={styles.videoTouchable}
              >
                <VideoView
                  player={videoPlayer}
                  style={styles.mediaPlayer}
                  contentFit="contain"
                  nativeControls={false}
                  fullscreenOptions={{ enable: false }}
                  allowsPictureInPicture={false}
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

  const renderActionSheet = () => {
    const sheetBg = isDark ? '#16181c' : '#ffffff';
    const handleColor = isDark ? '#3a3f45' : '#cfd9de';

    return (
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
        statusBarTranslucent
      >
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={closeMenu} />

          <View
            style={[
              styles.sheet,
              {
                backgroundColor: sheetBg,
                paddingBottom: Math.max(insets.bottom, 12) + 4,
              },
            ]}
          >
            <View style={styles.sheetHandleWrap}>
              <View style={[styles.sheetHandle, { backgroundColor: handleColor }]} />
            </View>

            <TouchableOpacity
              style={styles.sheetItem}
              activeOpacity={0.6}
              onPress={handleSheetDownload}
            >
              <Feather name="download" size={20} color={colors.text} />
              <Text style={[styles.sheetItemText, { color: colors.text }]}>
                Download as Image
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetItem}
              activeOpacity={0.6}
              onPress={handleSheetShare}
            >
              <Feather name="share" size={20} color={colors.text} />
              <Text style={[styles.sheetItemText, { color: colors.text }]}>
                Share as Image
              </Text>
            </TouchableOpacity>

            {hasImage && (
              <TouchableOpacity
                style={styles.sheetItem}
                activeOpacity={0.6}
                onPress={handleSheetDownload}
              >
                <Feather name="image" size={20} color={colors.text} />
                <Text style={[styles.sheetItemText, { color: colors.text }]}>
                  Download Original
                </Text>
              </TouchableOpacity>
            )}

            {userId === currentUser?.id && (
              <TouchableOpacity
                style={styles.sheetItem}
                activeOpacity={0.6}
                onPress={handleSheetEdit}
              >
                <Feather name="edit-2" size={20} color={colors.text} />
                <Text style={[styles.sheetItemText, { color: colors.text }]}>
                  Edit Post
                </Text>
              </TouchableOpacity>
            )}

            {userId === currentUser?.id && (
              <TouchableOpacity
                style={styles.sheetItem}
                activeOpacity={0.6}
                onPress={handleSheetDelete}
              >
                <Feather name="trash-2" size={20} color={DESTRUCTIVE} />
                <Text style={[styles.sheetItemText, { color: DESTRUCTIVE }]}>
                  Delete Post
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  if (!post) return null;

  if (isRepostBool && (!text || text.trim() === '') && originalPost) {
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
  const hasLinkPreview = !hasMedia && !!previewData;

  return (
    <View style={[styles.card, { borderBottomColor: colors.border }]}>
      {isRepostBool && originalPost && (
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
              <TouchableOpacity
                onPress={openMenu}
                style={styles.moreButton}
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="more-horizontal" size={18} color={colors.textMuted} />
              </TouchableOpacity>
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

      {hasLinkPreview && (
        <View style={styles.linkPreviewWrapper}>
          {renderLinkPreview()}
        </View>
      )}

      <View style={styles.cardInner}>
        <View style={styles.avatarTouch} />
        <View style={styles.content}>
          <View style={[styles.engagementBar, { marginTop: hasMedia || hasLinkPreview ? 12 : 0 }]}>
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

      {renderActionSheet()}

      {/* ── Comment sheet ── */}
      <CommentSheet
        visible={commentSheetVisible}
        onClose={() => setCommentSheetVisible(false)}
        postId={String(id)}
        commentCount={propCommentCount}
      />

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
            {hasImage && (
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
            {hasVideo && (
              <VideoView
                player={fsVideoPlayer}
                style={styles.fsVideo}
                contentFit="contain"
                nativeControls={false}
                fullscreenOptions={{ enable: false }}
              />
            )}
          </TouchableOpacity>

          {fsShowControls && (
            <>
              <TouchableOpacity
                onPress={closeVideoFullscreen}
                style={[
                  styles.fsClose,
                  { top: Math.max(insets.top, 12) + 12 },
                ]}
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

              <View
                style={[
                  styles.fsBottomBar,
                  {
                    paddingBottom: Math.max(insets.bottom, 16) + 12,
                    paddingLeft: 16 + insets.left,
                    paddingRight: 16 + insets.right,
                  },
                ]}
              >
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
    minWidth: 0,
  },
  nameContainer: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700' },
  verifiedBadge: { marginLeft: 4 },
  username: { fontSize: 13, marginLeft: 4 },
  time: { fontSize: 13, marginLeft: 4, flexShrink: 1 },
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

  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
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

  moreButton: {
    padding: 4,
    marginLeft: 2,
  },

  mentionBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginLeft: 6,
  },
  mentionBadgeText: { fontSize: 11, marginLeft: 4 },
  postText: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  showMore: { fontSize: 14, marginTop: 4 },

  inlineLink: {
    fontWeight: '600',
  },
  inlineUrl: {
    textDecorationLine: 'underline',
  },

  fullBleedWrapper: { width: '100%', marginTop: 12 },

  // ── Link preview ──
  linkPreviewWrapper: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  linkPreviewCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  linkPreviewImage: {
    width: '100%',
    height: SCREEN_WIDTH * 0.5,
  },
  linkPreviewBody: {
    padding: 12,
  },
  linkPreviewHost: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'lowercase',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  linkPreviewTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  linkPreviewDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },

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

  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  sheetItemText: {
    fontSize: 15,
    fontWeight: '500',
  },
});