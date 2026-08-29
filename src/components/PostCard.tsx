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
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { usePostActions } from '../hooks/useFeed';
import { Avatar } from './Avatar';
import { timeAgo, formatNumber, safeString } from '../utils/helpers';
import { extractMentions } from '../lib/formatText';
import api from '../api/client';
import * as SecureStore from 'expo-secure-store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function SafeText({ children, style, numberOfLines }: any) {
  return <Text style={style} numberOfLines={numberOfLines}>{safeString(children)}</Text>;
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
}

function PostCard({
  post,
  onComment,
  onQuote,
  groupMap = new Map(),
  isMentioned = false,
  showFollowButton = false,
  isFollowing = false,
  onFollowToggle,
}: PostCardProps) {
  const navigation = useNavigation();
  const { user: currentUser } = useAuth();
  const { likePost, unlikePost, repost: repostPost } = usePostActions();
  if (!post) return null;

  const {
    id, text, image, video, createdAt, likes = [], comments = [], reposts = [],
    shares = 0, viewCount = 0, videoViews = 0, isLive = false, liveSessionId = null,
    commentCount = 0, repostCount = 0, isRepost = false, originalPost = null,
    groupId = null, reasons = [], user
  } = post;

  const safeLikes = Array.isArray(likes) ? likes : [];
  const safeReposts = Array.isArray(reposts) ? reposts : [];
  const safeComments = Array.isArray(comments) ? comments : [];

  const likeCount = safeLikes.length;
  const liked = currentUser ? safeLikes.some((id: string) => id === currentUser.id) : false;
  const reposted = currentUser ? safeReposts.some((id: string) => id === currentUser.id) : false;

  const displayName = user?.name || 'Anonymous';
  const username = user?.username || '';
  const avatarUrl = user?.avatar || null;
  const isVerified = !!user?.verified;
  const userId = user?.id;

  const groupTopic = groupId ? (groupMap.get(groupId)?.displayName || groupMap.get(groupId)?.topic) : null;
  const relativeTime = timeAgo(createdAt);

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

  const goToProfile = () => {
    if (username) (navigation.navigate as any)('Profile', { username });
    else if (userId) (navigation.navigate as any)('Profile', { userId });
  };
  const goToPostDetail = () => (navigation.navigate as any)('PostDetail', { postId: id });
  const handleEditPost = () => {
    setIsDropdownOpen(false);
    (navigation.navigate as any)('EditPost', { postId: id });
  };

  useEffect(() => {
    if (image || video || !text) return;
    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    if (!urlMatch) return;
    const url = urlMatch[0];
    setPreviewLoading(true);
    setPreviewError(false);
    api.get(`/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => {
        const data = res.data;
        if (data && (data.title || data.description || data.image)) {
          setPreviewData({ ...data, url });
        } else setPreviewError(true);
      })
      .catch(() => setPreviewError(true))
      .finally(() => setPreviewLoading(false));
  }, [id, text, image, video]);

  const handleVideoPlaybackStatus = (status: any) => {
    if (!status.isLoaded || videoViewRecorded.current) return;
    if (status.durationMillis && status.positionMillis / status.durationMillis > 0.3) {
      videoViewRecorded.current = true;
      api.post(`/posts/${id}/video-view`).catch(() => {});
    }
  };

  // ── Like handler with auth error handling ──
  const handleLike = async () => {
    if (!currentUser) {
      Alert.alert(
        'Sign In Required',
        'Please log in to like posts.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log In', onPress: () => (navigation.navigate as any)('Login') }
        ]
      );
      return;
    }

    try {
      if (liked) {
        await unlikePost(id);
      } else {
        await likePost(id);
      }
    } catch (error: any) {
      console.warn('Like failed:', error);
      if (error.response?.status === 401) {
        Alert.alert(
          'Session Expired',
          'Please log in again to continue.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log In', onPress: () => (navigation.navigate as any)('Login') }
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to like post. Please try again.');
      }
    }
  };

  const handleRepost = async () => {
    try { await repostPost(id); } catch (error) { console.warn('Repost failed:', error); }
  };
  const handleComment = () => onComment && onComment(id);
  const handleShare = async () => {
    try { await Share.share({ message: text || 'Check this post!' }); } catch (e) {}
  };
  const handleQuote = () => onQuote && onQuote(id);

  const toggleExpand = () => setIsExpanded(!isExpanded);
  const shouldTruncate = text?.length > 200 && !isExpanded;

  const openLightbox = () => setLightboxVisible(true);
  const closeLightbox = () => setLightboxVisible(false);

  const renderMentionBadge = () => {
    const isMentionedInText = useMemo(() => {
      if (!currentUser || !text) return false;
      const mentions = extractMentions(text);
      return mentions.some((m: string) => m.toLowerCase() === currentUser.username?.toLowerCase());
    }, [text, currentUser]);
    if (!isMentionedInText && !isMentioned) return null;
    return (
      <View style={styles.mentionBadge}>
        <Feather name="info" size={12} color="#3b82f6" />
        <Text style={styles.mentionBadgeText}>Mentioned</Text>
      </View>
    );
  };

  const renderMedia = () => {
    if (video) {
      return (
        <View style={styles.mediaContainer}>
          {videoError ? (
            <View style={styles.videoErrorContainer}>
              <Feather name="video-off" size={32} color="#6b7280" />
              <Text style={styles.videoErrorText}>Video failed to load</Text>
            </View>
          ) : (
            <Video
              ref={videoRef}
              source={{ uri: video }}
              style={styles.mediaPlayer}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              isLooping={false}
              useNativeControls
              onError={() => setVideoError(true)}
              onPlaybackStatusUpdate={handleVideoPlaybackStatus}
            />
          )}
        </View>
      );
    }
    if (image) {
      return (
        <TouchableOpacity activeOpacity={0.9} onPress={openLightbox} style={styles.mediaContainer}>
          <Image
            source={{ uri: image }}
            style={styles.mediaImage}
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
    const count = (viewCount || 0) + (videoViews || 0);
    if (count === 0) return null;
    return (
      <View style={styles.viewCountRow}>
        <Feather name="eye" size={14} color="#9ca3af" />
        <Text style={styles.viewCountText}>{formatNumber(count)}</Text>
      </View>
    );
  };

  const renderReasonButton = () => {
    if (!reasons || reasons.length === 0) return null;
    return (
      <View ref={reasonRef}>
        <TouchableOpacity onPress={() => setShowReasons(!showReasons)} style={styles.reasonButton}>
          <Feather name="info" size={16} color="#9ca3af" />
        </TouchableOpacity>
        {showReasons && (
          <View style={styles.reasonPopover}>
            <Text style={styles.reasonTitle}>Why you're seeing this</Text>
            {reasons.map((reason: string, i: number) => (
              <Text key={i} style={styles.reasonItem}>• {reason}</Text>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderDropdown = () => (
    <View ref={dropdownRef}>
      <TouchableOpacity onPress={() => setIsDropdownOpen(!isDropdownOpen)} style={styles.dropdownButton}>
        <Feather name="more-horizontal" size={20} color="#6b7280" />
      </TouchableOpacity>
      {isDropdownOpen && (
        <View style={styles.dropdownMenu}>
          <TouchableOpacity onPress={() => { Alert.alert('Download', 'Image download not implemented yet.'); setIsDropdownOpen(false); }} style={styles.dropdownItem}>
            <Feather name="download" size={16} color="#374151" />
            <Text style={styles.dropdownItemText}>Download as Image</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { Alert.alert('Share', 'Image sharing not implemented yet.'); setIsDropdownOpen(false); }} style={styles.dropdownItem}>
            <Feather name="share" size={16} color="#374151" />
            <Text style={styles.dropdownItemText}>Share as Image</Text>
          </TouchableOpacity>
          {image && (
            <>
              <View style={styles.dropdownDivider} />
              <TouchableOpacity onPress={() => { Alert.alert('Download', 'Original image download not implemented yet.'); setIsDropdownOpen(false); }} style={styles.dropdownItem}>
                <Feather name="image" size={16} color="#374151" />
                <Text style={styles.dropdownItemText}>Download Original</Text>
              </TouchableOpacity>
            </>
          )}
          {userId === currentUser?.id && (
            <>
              <View style={styles.dropdownDivider} />
              <TouchableOpacity onPress={handleEditPost} style={styles.dropdownItem}>
                <Feather name="edit-2" size={16} color="#374151" />
                <Text style={styles.dropdownItemText}>Edit Post</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );

  if (isRepost && (!text || text.trim() === '') && originalPost) {
    return (
      <View style={styles.repostWrapper}>
        <View style={styles.repostBanner}>
          <Feather name="repeat" size={14} color="#6b7280" />
          <Text style={styles.repostBannerText}>{displayName} reposted</Text>
          <Text style={styles.repostBannerTime}>{relativeTime}</Text>
        </View>
        <PostCard post={originalPost} groupMap={groupMap} onComment={onComment} onQuote={onQuote} isMentioned={isMentioned} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {isRepost && originalPost && (
        <View style={styles.repostBanner}>
          <Feather name="repeat" size={14} color="#6b7280" />
          <Text style={styles.repostBannerText}>{displayName} quoted</Text>
          <Text style={styles.repostBannerTime}>{relativeTime}</Text>
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
                <Text style={styles.name}>
                  {displayName}
                  {isVerified && <Feather name="check-circle" size={14} color="#3b82f6" />}
                </Text>
              </TouchableOpacity>
              {renderMentionBadge()}
              {username && (
                <TouchableOpacity onPress={goToProfile}>
                  <Text style={styles.username}>@{username}</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.time}>· {relativeTime}</Text>
              {groupTopic && (
                <View style={styles.groupBadge}>
                  <Text style={styles.groupBadgeText}>{groupTopic}</Text>
                </View>
              )}
            </View>
            <View style={styles.actionsRow}>
              {renderViewCounts()}
              {renderReasonButton()}
              {renderDropdown()}
            </View>
          </View>

          <TouchableOpacity activeOpacity={0.8} onPress={goToPostDetail}>
            <Text style={styles.postText} numberOfLines={shouldTruncate ? 3 : undefined}>
              {text || ''}
            </Text>
            {shouldTruncate && (
              <TouchableOpacity onPress={toggleExpand}>
                <Text style={styles.showMore}>Show more</Text>
              </TouchableOpacity>
            )}
            {isExpanded && text?.length > 200 && (
              <TouchableOpacity onPress={toggleExpand}>
                <Text style={styles.showMore}>Show less</Text>
              </TouchableOpacity>
            )}
            {renderMedia()}
          </TouchableOpacity>

          <View style={styles.engagementBar}>
            <TouchableOpacity style={styles.engagementButton} onPress={handleLike}>
              <Feather name={liked ? 'heart' : 'heart'} size={22} color={liked ? '#ef4444' : '#6b7280'} />
              <Text style={styles.engagementText}>{likeCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.engagementButton} onPress={handleComment}>
              <Feather name="message-circle" size={22} color="#6b7280" />
              <Text style={styles.engagementText}>{commentCount ?? safeComments.length}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.engagementButton} onPress={handleRepost}>
              <Feather name="repeat" size={22} color={reposted ? '#3b82f6' : '#6b7280'} />
              <Text style={styles.engagementText}>{repostCount ?? safeReposts.length}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.engagementButton} onPress={handleShare}>
              <Feather name="share-2" size={22} color="#6b7280" />
              <Text style={styles.engagementText}>{shares || 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.engagementButton} onPress={handleQuote}>
              <Feather name="message-square" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={lightboxVisible} transparent>
        <SafeAreaView style={styles.lightbox}>
          <TouchableOpacity style={styles.lightboxClose} onPress={closeLightbox}>
            <Feather name="x" size={30} color="white" />
          </TouchableOpacity>
          <ScrollView contentContainerStyle={styles.lightboxScroll}>
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
    </View>
  );
}

export default React.memo(PostCard);

const styles = StyleSheet.create({
  // ... (styles remain the same as before)
  card: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  repostWrapper: {
    backgroundColor: '#f9fafb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  repostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 44,
    marginBottom: 4,
  },
  repostBannerText: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 4,
  },
  repostBannerTime: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 8,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarTouch: {
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
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
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
  },
  username: {
    fontSize: 13,
    color: '#6b7280',
    marginLeft: 4,
  },
  time: {
    fontSize: 13,
    color: '#9ca3af',
    marginLeft: 4,
  },
  groupBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 6,
  },
  groupBadgeText: {
    fontSize: 11,
    color: '#2563eb',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  viewCountText: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 4,
  },
  reasonButton: {
    padding: 4,
  },
  reasonPopover: {
    position: 'absolute',
    top: 28,
    right: 0,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    width: 200,
    zIndex: 10,
  },
  reasonTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  reasonItem: {
    fontSize: 12,
    color: '#4b5563',
    marginTop: 4,
  },
  dropdownButton: {
    padding: 4,
  },
  dropdownMenu: {
    position: 'absolute',
    right: 0,
    top: 28,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minWidth: 160,
    paddingVertical: 4,
    zIndex: 10,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 12,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 4,
  },
  mentionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 6,
  },
  mentionBadgeText: {
    fontSize: 11,
    color: '#2563eb',
    marginLeft: 4,
  },
  postText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1f2937',
    marginTop: 6,
  },
  showMore: {
    color: '#2563eb',
    fontSize: 14,
    marginTop: 4,
  },
  mediaContainer: {
    marginTop: 12,
    marginHorizontal: -16,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  mediaPlayer: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  mediaImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#e5e7eb',
  },
  videoErrorContainer: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  videoErrorText: {
    color: '#6b7280',
    fontSize: 14,
    marginTop: 8,
  },
  engagementBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  engagementButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  engagementText: {
    fontSize: 14,
    color: '#6b7280',
    marginLeft: 6,
  },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
  },
  lightboxScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  lightboxImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.2,
  },
});