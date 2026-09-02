import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import api from '../api/client';
import { resolveMediaUrl } from '../lib/media';

export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'repost' | 'follow' | 'mention';
  userId: string;
  user: {
    id: string;
    name: string;
    username: string;
    avatar?: string;
  };
  postId?: string | null;
  postText?: string | null;
  commentId?: string | null;
  commentText?: string | null;
  text?: string;
  createdAt: string;
  read: boolean;
}

// ── Map raw notification to our format ──
function mapNotification(raw: any): Notification {
  // Extract user data from various possible locations
  const userId = raw.actorId || raw.userId || raw.user?.id || raw.actor?.id || '';
  const userName = raw.actorName || raw.name || raw.user?.name || raw.actor?.name || '';
  const userUsername = raw.actorUsername || raw.username || raw.user?.username || raw.actor?.username || '';
  
  // Use resolveMediaUrl to get the full URL for avatar
  const avatarUrl = resolveMediaUrl(raw.actorPicture || raw.avatar || raw.user?.avatar || raw.actor?.avatar);
  
  // Determine display name with proper fallbacks
  let displayName = '';
  if (raw.actorName && raw.actorName.trim() && raw.actorName !== 'null' && raw.actorName !== 'undefined') {
    displayName = raw.actorName.trim();
  } else if (raw.actorUsername && raw.actorUsername.trim() && raw.actorUsername !== 'null' && raw.actorUsername !== 'undefined') {
    displayName = raw.actorUsername.trim();
  } else if (raw.name && raw.name.trim() && raw.name !== 'null' && raw.name !== 'undefined') {
    displayName = raw.name.trim();
  } else if (raw.username && raw.username.trim() && raw.username !== 'null' && raw.username !== 'undefined') {
    displayName = raw.username.trim();
  } else if (userId) {
    displayName = 'User';
  } else {
    displayName = 'Someone';
  }

  let username = userUsername || displayName.toLowerCase().replace(/\s+/g, '_');
  if (username === 'user' || username === 'someone') {
    username = username + (userId || '');
  }

  return {
    id: raw.id || raw._id || '',
    type: raw.type || raw.notificationType || 'like',
    userId: userId,
    user: {
      id: userId,
      name: displayName,
      username: username,
      avatar: avatarUrl || undefined,
    },
    postId: raw.postId || raw.post?.id || raw.post_id || null,
    postText: raw.postSnippet || raw.postText || raw.post?.text || raw.post_text || null,
    commentId: raw.commentId || raw.comment?.id || raw.comment_id || null,
    commentText: raw.commentText || raw.comment?.text || raw.comment_text || null,
    text: raw.customMessage || raw.text || raw.message || raw.content || '',
    createdAt: raw.createdAt || raw.created_at || raw.timestamp || new Date().toISOString(),
    read: raw.isRead === 1 || raw.isRead === true || raw.read === true || raw.read === 1 || false,
  };
}

export const useNotifications = (userId: string) => {
  return useInfiniteQuery({
    queryKey: ['notifications', userId],
    queryFn: async ({ pageParam = 1 }): Promise<{
      notifications: Notification[];
      hasMore: boolean;
      page: number;
    }> => {
      if (!userId) return { notifications: [], hasMore: false, page: 1 };
      
      try {
        const response = await api.get(`/notifications/${userId}?page=${pageParam}&limit=10`);
        const data = response.data;
        
        // Navigate to the notifications array
        let notifications: any[] = [];
        let hasMore = false;
        let currentPage = pageParam;
        
        if (data?.data?.notifications && Array.isArray(data.data.notifications)) {
          notifications = data.data.notifications;
          hasMore = data.data.hasMore || false;
          currentPage = data.data.page || pageParam;
        } else if (data?.notifications && Array.isArray(data.notifications)) {
          notifications = data.notifications;
          hasMore = data.hasMore || false;
        } else if (Array.isArray(data)) {
          notifications = data;
        } else if (data?.data && Array.isArray(data.data)) {
          notifications = data.data;
        } else if (data?.items && Array.isArray(data.items)) {
          notifications = data.items;
          hasMore = data.hasMore || false;
        } else if (data?.results && Array.isArray(data.results)) {
          notifications = data.results;
          hasMore = data.hasMore || false;
        }
        
        // Map each to our structure
        const mappedNotifications = notifications.map(mapNotification);
        
        return {
          notifications: mappedNotifications,
          hasMore: hasMore,
          page: currentPage,
        };
      } catch (error) {
        console.error('❌ Error fetching notifications:', error);
        throw error;
      }
    },
    enabled: !!userId,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    refetchInterval: 30000,
  });
};

export const useUnreadCount = (userId: string) => {
  return useQuery({
    queryKey: ['notifications', userId, 'unread'],
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const response = await api.get(`/notifications/${userId}/unread-count`);
      return response.data.count || response.data || 0;
    },
    enabled: !!userId,
  });
};

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      await api.put(`/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

export const useMarkAllNotificationsRead = (userId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.put(`/notifications/${userId}/read-all`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
      queryClient.invalidateQueries({ queryKey: ['notifications', userId, 'unread'] });
    },
  });
};