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
  SafeAreaView,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
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
    
    // Map comments to the expected format - FIXED: use author fields
    const mappedComments = commentsData.map((c: any) => {
      // The comment might have user object, or author fields directly
      const commentUser = c.user || {};
      
      return {
        id: String(c.id || c._id || Math.random()),
        text: c.text || c.content || '',
        createdAt: c.createdAt || c.created_at || new Date().toISOString(),
        user: {
          id: String(commentUser.id || c.userId || c.authorId || ''),
          // ✅ Try multiple fields for name
          name: commentUser.name || c.author || c.user?.name || c.user?.username || 'Anonymous',
          // ✅ Try multiple fields for username
          username: commentUser.username || c.authorUsername || c.user?.username || '',
          // ✅ Try multiple fields for avatar
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

  // ---- Add comment mutation ----
  const addCommentMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await api.post(`/posts/${postId}/comment`, { text });
      return response.data;
    },
    onSuccess: () => {
      // Refetch the post to get updated comments
      refetchPost();
      setCommentText('');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.message || 'Failed to add comment. Please try again.');
    },
  });

  // ---- Interaction handlers ----
  const handleComment = () => {
    inputRef.current?.focus();
  };

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
      <View style={styles.commentItem}>
        <Avatar source={user.avatar} size={36} fallback={user.name} />
        <View style={styles.commentContent}>
          <View style={styles.commentHeader}>
            <Text style={styles.commentName}>{user.name}</Text>
            <Text style={styles.commentUsername}>@{user.username}</Text>
            <Text style={styles.commentTime}>· {timeAgo(item.createdAt)}</Text>
          </View>
          <Text style={styles.commentText}>{item.text}</Text>
        </View>
      </View>
    );
  };

  // ---- Render empty comments ----
  const renderEmptyComments = () => (
    <View style={styles.emptyComments}>
      <Feather name="message-circle" size={48} color="#d1d5db" />
      <Text style={styles.emptyTitle}>No comments yet</Text>
      <Text style={styles.emptySubtitle}>Be the first to start the conversation</Text>
    </View>
  );

  // ---- Loading state ----
  if (postLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </SafeAreaView>
    );
  }

  // ---- Error state ----
  if (postError || !post) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Feather name="alert-circle" size={48} color="#ef4444" />
        <Text style={styles.errorTitle}>Post not found</Text>
        <Text style={styles.errorSubtitle}>The post you're looking for doesn't exist.</Text>
        <TouchableOpacity
          style={styles.goBackButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.goBackText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Get comments from the post object
  const postComments = post.comments || [];

  // ---- Main render ----
  return (
    <SafeAreaView style={styles.container}>
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
              <PostCard post={post} />
              <View style={styles.commentsHeader}>
                <Text style={styles.commentsCount}>
                  {postComments.length} {postComments.length === 1 ? 'Comment' : 'Comments'}
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={renderEmptyComments}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />

        {/* ---- Comment Input Bar ---- */}
        <View style={styles.inputBar}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Add a comment..."
            placeholderTextColor="#9ca3af"
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={500}
            editable={!isSendingComment}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
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
    backgroundColor: '#f9fafb',
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: 'white',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 16,
  },
  errorSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  goBackButton: {
    marginTop: 24,
    backgroundColor: '#6C63FF',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  goBackText: {
    color: 'white',
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 80,
  },
  postContainer: {
    backgroundColor: 'white',
    marginBottom: 8,
  },
  commentsHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  commentsCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  commentItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
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
    color: '#1f2937',
  },
  commentUsername: {
    fontSize: 13,
    color: '#6b7280',
    marginLeft: 4,
  },
  commentTime: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 6,
  },
  commentText: {
    fontSize: 14,
    color: '#374151',
    marginTop: 2,
    lineHeight: 20,
  },
  emptyComments: {
    paddingVertical: 60,
    alignItems: 'center',
    backgroundColor: 'white',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9ca3af',
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
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    minHeight: 56,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});