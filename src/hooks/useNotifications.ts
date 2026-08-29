import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

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
  // Try to extract user from various possible fields
  const user = raw.user || raw.actor || raw.fromUser || raw.sender || {};
  return {
    id: raw.id || '',
    type: raw.type || 'like',
    userId: raw.userId || raw.user?.id || raw.actor?.id || '',
    user: {
      id: user.id || '',
      name: user.name || user.displayName || 'Unknown',
      username: user.username || user.handle || '',
      avatar: user.avatar || user.picture || user.avatarUrl || undefined,
    },
    postId: raw.postId || raw.post?.id || null,
    postText: raw.postText || raw.post?.text || null,
    commentId: raw.commentId || raw.comment?.id || null,
    commentText: raw.commentText || raw.comment?.text || null,
    text: raw.text || '',
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    read: raw.read || raw.isRead || false,
  };
}

export const useNotifications = (userId: string) => {
  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async (): Promise<Notification[]> => {
      if (!userId) return [];
      const response = await api.get(`/notifications/${userId}`);
      const data = response.data;
      // Navigate to the notifications array
      let notifications: any[] = [];
      if (data?.data?.notifications && Array.isArray(data.data.notifications)) {
        notifications = data.data.notifications;
      } else if (Array.isArray(data)) {
        notifications = data;
      } else if (data && typeof data === 'object') {
        if (Array.isArray(data.notifications)) notifications = data.notifications;
        else if (Array.isArray(data.data)) notifications = data.data;
        else if (Array.isArray(data.items)) notifications = data.items;
        else if (Array.isArray(data.results)) notifications = data.results;
      }
      // Map each to our structure
      return notifications.map(mapNotification);
    },
    enabled: !!userId,
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