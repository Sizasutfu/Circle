// src/hooks/useUnreadMessages.ts
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

/**
 * Total unread DMs across every conversation. Fetches the inbox and sums
 * the per-conversation unread_count. Cheaper than adding a dedicated
 * endpoint, and the inbox query is already cached by MessagesScreen.
 */
export const useUnreadMessages = (userId: string) => {
  return useQuery({
    queryKey: ['dm', userId, 'unread-count'],
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      try {
        const response = await api.get('/dm/inbox');
        const conversations = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];
        return conversations.reduce(
          (sum: number, c: any) => sum + (Number(c.unread_count) || 0),
          0
        );
      } catch {
        return 0;
      }
    },
    enabled: !!userId,
    refetchInterval: 30000,
    staleTime: 15000,
  });
};