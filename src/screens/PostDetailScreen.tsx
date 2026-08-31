import React, { useState, useRef } from 'react';
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
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import PostCard, { Post } from '../components/PostCard';
import { Avatar } from '../components/Avatar';
import api from '../api/client';
import { timeAgo } from '../utils/helpers';
import { resolveMediaUrl } from '../lib/media';

// ===== TYPES =====
interface RouteParams {
  postId: string;
}

interface Comment {
  id: string;
  text: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    username: string;
    avatar?: string;
  };
}

// ===== COMPONENT =====
export default function PostDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { postId } = route.params as RouteParams;
  const { user: currentUser } = useAuth();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const [commentText, setCommentText] = useState('');
  const [isSendingComment, setIsSendingComment] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // ---- Fetch post ----
  const {
    data: post,
    isLoading: postLoading,
    isError: postError,
    error,
    refetch: refetchPost,
  } = useQuery({
    queryKey: ['post', postId],
    queryFn: async () => {
      console.log('📦 Fetching post:', postId);
      const response = await api.get(`/posts/${postId}`);
      console.log('📦 Post response:', JSON.stringify(response.data, null, 2));
      
      let postData = response.data;
      if (postData?.data) postData = postData.data;
      if (postData?.data) postData = postData.data;
      
      return normalizePost(postData);
    },
    enabled: !!postId,
  });

  // ---- Normalize post function ----
  const normalizePost = (raw: any): Post => {
    const rawUser = raw.user || raw.author || {};
    
    // Extract comments from the post if they exist
    let commentsData = raw.comments || raw.recentComments || [];
    if (!Array.isArray(commentsData)) {
      commentsData = [];
    }
    
    // Map comments to the expected format
    const mappedComments = commentsData.map((c: any) => {
      const commentUser = c.user || {};
      
      return {
        id: String(c.id || c._id || Math.random()),
        text: c.text || c.content || '',
        createdAt: c.createdAt || c.created_at || new Date().toISOString(),
        user: {
          id: String(commentUser.id || c.userId || c.authorId || ''),
          name: commentUser.name || c.author || c.user?.name || c.user?.username || 'Anonymous',
          username: commentUser.username || c.authorUsername || c.user?.username || '',
          avatar: resolveMediaUrl(commentUser.avatar || commentUser.picture || c.authorPicture || c.user?.avatar || null),
        },
      };
    });
    
    return {
      id: String(raw.id || ''),
      text: raw.text || raw.content || '',
      image: resolveMediaUrl(raw.image || raw.imageUrl || null),
      video: resolveMediaUrl(raw.video || raw.videoUrl || null),
      createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
      likes: Array.isArray(raw.likes) ? raw.likes : [],
      comments: mappedComments,
      reposts: Array.isArray(raw.reposts) ? raw.reposts : [],
      shares: Number(raw.shares || raw.shareCount || 0),
      viewCount: Number(raw.viewCount || raw.views || 0),
      videoViews: Number(raw.videoViews || raw.video_views || 0),
      isLive: !!raw.isLive,
      liveSessionId: raw.liveSessionId || null,
      commentCount: Number(raw.commentCount || raw.comments?.length || 0),
      repostCount: Number(raw.repostCount || 0),
      isRepost: !!raw.isRepost,
      originalPost: raw.originalPost ? normalizePost(raw.originalPost) : null,
      groupId: raw.groupId || null,
      reasons: Array.isArray(raw.reasons) ? raw.reasons : [],
      user: {
        id: String(rawUser.id || raw.userId || ''),
        name: rawUser.name || raw.author || 'Anonymous',
        username: rawUser.username || raw.authorUsername || '',
        avatar: resolveMediaUrl(rawUser.avatar || rawUser.picture || raw.authorPicture || null),
        verified: !!rawUser.verified || !!raw.authorVerified,
      },
    };
  };

  // ---- Share post ----
  const handleShare = async () => {
    try {
      const shareMessage = post?.text || 'Check out this post on Circle!';
      const shareUrl = `https://circle.com/post/${postId}`;
      await Share.share({
        message: `${shareMessage}\n\n${shareUrl}`,
        title: 'Share Post',
      });
    } catch (error) {
      console.warn('Share failed:', error);
    }
  };

  // ---- Add comment mutation ----
  const addCommentMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await api.post(`/posts/${postId}/comment`, { text });
      return response.data;
    },
    onSuccess: () => {
      refetchPost();
      setCommentText('');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.message || 'Failed to add comment. Please try again.');
    },
  });

  // ---- Submit comment ----
  const handleSendComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;

    setIsSendingComment(true);
    try {
      await addCommentMutation.mutateAsync(trimmed);
      inputRef.current?.blur();
    } catch (error) {
      console.warn('Comment failed:', error);
    } finally {
      setIsSendingComment(false);
    }
  };

  // ---- Render comment item ----
  const renderComment = ({ item }: { item: Comment }) => {
    const user = item.user || { id: '', name: 'Unknown', username: '', avatar: null };
    return (
      <View style={[styles.commentItem, { 
        backgroundColor: colors.surface, 
        borderBottomColor: colors.border 
      }]}>
        <Avatar source={user.avatar} size={36} fallback={user.name} />
        <View style={styles.commentContent}>
          <View style={styles.commentHeader}>
            <Text style={[styles.commentName, { color: colors.text }]}>{user.name}</Text>
            <Text style={[styles.commentUsername, { color: colors.textSecondary }]}>@{user.username}</Text>
            <Text style={[styles.commentTime, { color: colors.textMuted }]}>· {timeAgo(item.createdAt)}</Text>
          </View>
          <Text style={[styles.commentText, { color: colors.text }]}>{item.text}</Text>
        </View>
      </View>
    );
  };

  // ---- Render empty comments ----
  const renderEmptyComments = () => (
    <View style={[styles.emptyComments, { backgroundColor: colors.surface }]}>
      <Feather name="message-circle" size={48} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No comments yet</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Be the first to start the conversation</Text>
    </View>
  );

  // ---- Loading state ----
  if (postLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // ---- Error state ----
  if (postError || !post) {
    return (
      <SafeAreaView style={[styles.errorContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <Feather name="alert-circle" size={48} color="#ef4444" />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Post not found</Text>
        <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>The post you're looking for doesn't exist.</Text>
        <TouchableOpacity
          style={[styles.goBackButton, { backgroundColor: colors.primary }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.goBackText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Get comments from the post object
  const postComments = post?.comments || [];

  // ---- Main render ----
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* ─── Custom Header ─── */}
      <View style={[styles.header, { 
        backgroundColor: colors.surface, 
        borderBottomColor: colors.border 
      }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Post</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
          <Feather name="share-2" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          data={postComments}
          keyExtractor={(item) => item.id || String(Math.random())}
          renderItem={renderComment}
          ListHeaderComponent={
            <View style={styles.postContainer}>
              {post && <PostCard post={post} />}
              <View style={[styles.commentsHeader, { 
                backgroundColor: colors.surface, 
                borderBottomColor: colors.border 
              }]}>
                <Text style={[styles.commentsCount, { color: colors.text }]}>
                  {postComments.length} {postComments.length === 1 ? 'Comment' : 'Comments'}
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={renderEmptyComments}
          contentContainerStyle={[styles.listContent, { backgroundColor: colors.background }]}
          showsVerticalScrollIndicator={false}
        />

        {/* ---- Comment Input Bar ---- */}
        <View style={[styles.inputBar, { 
          backgroundColor: colors.surface, 
          borderTopColor: colors.border 
        }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { 
              backgroundColor: colors.input, 
              color: colors.text 
            }]}
            placeholder="Add a comment..."
            placeholderTextColor={colors.placeholder}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={500}
            editable={!isSendingComment}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: colors.primary },
              (!commentText.trim() || isSendingComment) && styles.sendButtonDisabled,
            ]}
            onPress={handleSendComment}
            disabled={!commentText.trim() || isSendingComment}
          >
            {isSendingComment ? (
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
  keyboardView: {
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
    marginTop: 16,
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  goBackButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  goBackText: {
    color: 'white',
    fontWeight: '600',
  },
  // ─── Custom Header ───
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  shareButton: {
    padding: 6,
  },
  listContent: {
    paddingBottom: 80,
  },
  postContainer: {
    marginBottom: 8,
  },
  commentsHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  commentsCount: {
    fontSize: 16,
    fontWeight: '600',
  },
  commentItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  commentContent: {
    flex: 1,
    marginLeft: 12,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  commentName: {
    fontSize: 14,
    fontWeight: '600',
  },
  commentUsername: {
    fontSize: 13,
    marginLeft: 4,
  },
  commentTime: {
    fontSize: 12,
    marginLeft: 6,
  },
  commentText: {
    fontSize: 14,
    marginTop: 2,
    lineHeight: 20,
  },
  emptyComments: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  inputBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
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
  sendButtonDisabled: {
    opacity: 0.5,
  },
});