import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { resolveMediaUrl } from '../lib/media';

const PAGE_SIZE = 20;

// ── Normalize a single post ──
function normalizePost(raw: any): any {
  // Build user from possible fields
  const rawUser = raw.user || raw.author || raw.creator || {};
  const user = {
    id: rawUser.id || raw.userId || '',
    name: rawUser.name || raw.displayName || raw.author || 'Anonymous',
    username: rawUser.username || raw.handle || raw.authorUsername || '',
    avatar: resolveMediaUrl(rawUser.picture || rawUser.avatar || raw.authorPicture || rawUser.avatarUrl || null),
    verified: !!rawUser.verified || !!raw.authorVerified,
  };

  // Extract media
  let image = raw.image || raw.imageUrl || raw.image_url || null;
  let video = raw.video || raw.videoUrl || raw.video_url || null;

  // Check media array
  if (!image && !video && raw.media && Array.isArray(raw.media)) {
    for (const m of raw.media) {
      if (m.type === 'image') { image = m.url || m.uri; break; }
    }
    for (const m of raw.media) {
      if (m.type === 'video') { video = m.url || m.uri; break; }
    }
  }

  // Resolve URLs
  image = resolveMediaUrl(image);
  video = resolveMediaUrl(video);

  return {
    id: raw.id || '',
    text: raw.text || raw.content || '',
    image,
    video,
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    likes: Array.isArray(raw.likes) ? raw.likes : [],
    comments: Array.isArray(raw.comments) ? raw.comments : [],
    reposts: Array.isArray(raw.reposts) ? raw.reposts : [],
    shares: raw.shares || raw.shareCount || 0,
    viewCount: raw.viewCount || raw.views || 0,
    videoViews: raw.videoViews || raw.video_views || 0,
    isLive: !!raw.isLive,
    liveSessionId: raw.liveSessionId || null,
    commentCount: raw.commentCount ?? (raw.comments ? raw.comments.length : 0),
    repostCount: raw.repostCount ?? (raw.reposts ? raw.reposts.length : 0),
    isRepost: !!raw.isRepost,
    originalPost: raw.originalPost ? normalizePost(raw.originalPost) : null,
    groupId: raw.groupId || raw.group_id || null,
    reasons: Array.isArray(raw.reasons) ? raw.reasons : [],
    user: user,
  };
}

export const useFeed = (tab: 'global' | 'following' = 'global') => {
  return useInfiniteQuery({
    queryKey: ['feed', tab],
    queryFn: async ({ pageParam = 1 }) => {
      try {
        console.log('📦 Fetching feed:', tab, 'page:', pageParam);
        const response = await api.get('/posts', {
          params: {
            feed: tab,
            page: pageParam,
            limit: PAGE_SIZE,
          },
        });

        console.log('📦 Feed response status:', response.status);

        let posts = [];
        let hasMore = false;

        // Parse different response structures
        if (response?.data?.data?.posts) {
          posts = response.data.data.posts;
          hasMore = response.data.data.hasMore ?? posts.length === PAGE_SIZE;
        } else if (response?.data?.posts) {
          posts = response.data.posts;
          hasMore = response.data.pagination?.hasMore || posts.length === PAGE_SIZE;
        } else if (Array.isArray(response?.data)) {
          posts = response.data;
          hasMore = posts.length === PAGE_SIZE;
        } else if (Array.isArray(response)) {
          posts = response;
          hasMore = posts.length === PAGE_SIZE;
        }

        if (!Array.isArray(posts)) posts = [];

        console.log(`📦 Found ${posts.length} posts`);

        const normalized = posts.map(normalizePost);

        return {
          posts: normalized,
          nextPage: hasMore ? pageParam + 1 : null,
        };
      } catch (error) {
        console.error('❌ Error fetching feed:', error);
        throw error;
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
};

export const usePostActions = () => {
  const queryClient = useQueryClient();

  const likePost = async (postId: string) => {
    try {
      console.log('👍 Liking post:', postId);
      const response = await api.post(`/posts/${postId}/like`);
      console.log('✅ Like response:', response.status);
      // Invalidate both global and following feeds
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch (error: any) {
      console.error('❌ Like failed:', error.response?.status, error.response?.data);
      throw error;
    }
  };

  const unlikePost = async (postId: string) => {
    try {
      console.log('👎 Unliking post:', postId);
      const response = await api.post(`/posts/${postId}/like`); // toggle
      console.log('✅ Unlike response:', response.status);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch (error: any) {
      console.error('❌ Unlike failed:', error.response?.status, error.response?.data);
      throw error;
    }
  };

  const repost = async (postId: string) => {
    try {
      console.log('🔁 Reposting:', postId);
      const response = await api.post(`/posts/${postId}/repost`);
      console.log('✅ Repost response:', response.status);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch (error: any) {
      console.error('❌ Repost failed:', error.response?.status, error.response?.data);
      throw error;
    }
  };

  const addComment = async (postId: string, text: string) => {
    try {
      console.log('💬 Adding comment to:', postId);
      const response = await api.post(`/posts/${postId}/comment`, { text });
      console.log('✅ Comment response:', response.status);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch (error: any) {
      console.error('❌ Comment failed:', error.response?.status, error.response?.data);
      throw error;
    }
  };

  return { likePost, unlikePost, repost, addComment };
};