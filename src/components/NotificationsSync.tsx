import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useWs } from '../contexts/WsContext';

/**
 * Global listener that keeps the notifications badge in sync with the WS.
 *
 * The WS handlers used to live inside NotificationsScreen, which only mounts
 * when the user is actually on the notifications tab. That meant a new
 * notification arriving while the user was on Feed/Messages/Explore never
 * invalidated the unread-count query, so the badge stayed stale until the
 * user opened the tab. Moving the listener here makes it always-on.
 *
 * Renders nothing.
 */
export default function NotificationsSync() {
  const { user } = useAuth();
  const { registerHandler } = useWs();
  const queryClient = useQueryClient();
  const userId = user?.id || '';

  useEffect(() => {
    if (!userId) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
      queryClient.invalidateQueries({ queryKey: ['notifications', userId, 'unread'] });
    };

    const unregNew = registerHandler('new-notification', (data: any) => {
      console.log('🔔 [global] new-notification:', data);
      invalidate();
    });

    const unregRead = registerHandler('notification-read', () => invalidate());
    const unregAllRead = registerHandler('all-notifications-read', () => invalidate());
    const unregUnread = registerHandler('unread-count-updated', () => invalidate());

    return () => {
      unregNew();
      unregRead();
      unregAllRead();
      unregUnread();
    };
  }, [userId, registerHandler, queryClient]);

  return null;
}