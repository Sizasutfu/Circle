// src/hooks/useFeed.ts
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { resolveMediaUrl } from '../lib/media';

const PAGE_SIZE = 20;

// ── Normalize a single post ──
// Exported so other hooks (e.g. useExplore) that fetch posts from different
// endpoints can produce the exact same shape PostCard expects, instead of
// re-implementing this field-mapping logic a second time.
export function normalizePost(raw: any): any {
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
      const response = await api.get('/posts', {
        params: {
          feed: tab,
          page: pageParam,
          limit: PAGE_SIZE,
        },
      });

      let posts = [];
      let hasMore = false;

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

      const normalized = posts.map(normalizePost);

      return {
        posts: normalized,
        nextPage: hasMore ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
  });
};

export const usePostActions = () => {
  const queryClient = useQueryClient();

  const likePost = async (postId: string) => {
    await api.post(`/posts/${postId}/like`);
    queryClient.invalidateQueries({ queryKey: ['feed'] });
  };

  const unlikePost = async (postId: string) => {
    await api.post(`/posts/${postId}/like`);
    queryClient.invalidateQueries({ queryKey: ['feed'] });
  };

  const repost = async (postId: string) => {
    await api.post(`/posts/${postId}/repost`);
    queryClient.invalidateQueries({ queryKey: ['feed'] });
  };

  const addComment = async (postId: string, text: string) => {
    await api.post(`/posts/${postId}/comment`, { text });
    queryClient.invalidateQueries({ queryKey: ['feed'] });
  };

  return { likePost, unlikePost, repost, addComment };
};