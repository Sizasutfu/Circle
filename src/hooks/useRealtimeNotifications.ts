import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWs } from '../contexts/WsContext';
import { Notification } from './useNotifications';

export const useRealtimeNotifications = (userId: string) => {
  const queryClient = useQueryClient();
  const { registerHandler, isAlive } = useWs();

  const [newNotification, setNewNotification] = useState<Notification | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);

  // ── Track connection status (poll isAlive, no dedicated event) ──
  useEffect(() => {
    setIsConnected(isAlive());
    const interval = setInterval(() => setIsConnected(isAlive()), 5000);
    return () => clearInterval(interval);
  }, [isAlive]);

  // ── New notification ──
  const handleNewNotification = useCallback(
    (data: any) => {
      console.log('🔔 New notification in hook:', data);

      queryClient.setQueryData(['notifications', userId], (oldData: any) => {
        if (!oldData) return oldData;

        const incoming = { ...data, read: false };

        return {
          ...oldData,
          pages: oldData.pages.map((page: any, index: number) => {
            if (index === 0) {
              return {
                ...page,
                notifications: [incoming, ...page.notifications],
              };
            }
            return page;
          }),
        };
      });

      setUnreadCount((prev) => prev + 1);
      setNewNotification(data);
    },
    [userId, queryClient]
  );

  // ── Unread count update (authoritative from server) ──
  const handleUnreadCountUpdate = useCallback((data: any) => {
    console.log('📊 Unread count update:', data);
    setUnreadCount(data.count ?? data.unreadCount ?? 0);
  }, []);

  // ── Single notification read ──
  const handleNotificationRead = useCallback(
    (data: any) => {
      console.log('✅ Notification marked as read:', data);

      queryClient.setQueryData(['notifications', userId], (oldData: any) => {
        if (!oldData) return oldData;

        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            notifications: page.notifications.map((notification: Notification) =>
              String(notification.id) === String(data.notificationId)
                ? { ...notification, read: true }
                : notification
            ),
          })),
        };
      });

      setUnreadCount((prev) => Math.max(0, prev - 1));
    },
    [userId, queryClient]
  );

  // ── All notifications read ──
  const handleAllNotificationsRead = useCallback(() => {
    console.log('✅ All notifications marked as read');
    setUnreadCount(0);

    queryClient.setQueryData(['notifications', userId], (oldData: any) => {
      if (!oldData) return oldData;

      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
          ...page,
          notifications: page.notifications.map((notification: Notification) => ({
            ...notification,
            read: true,
          })),
        })),
      };
    });
  }, [userId, queryClient]);

  // ── Register all handlers via WsContext ──
  useEffect(() => {
    if (!userId) return;

    const unregisterNewNotification = registerHandler('new-notification', handleNewNotification);
    const unregisterUnreadCount = registerHandler('unread-count-updated', handleUnreadCountUpdate);
    const unregisterRead = registerHandler('notification-read', handleNotificationRead);
    const unregisterAllRead = registerHandler('all-notifications-read', handleAllNotificationsRead);

    return () => {
      unregisterNewNotification();
      unregisterUnreadCount();
      unregisterRead();
      unregisterAllRead();
    };
  }, [
    userId,
    registerHandler,
    handleNewNotification,
    handleUnreadCountUpdate,
    handleNotificationRead,
    handleAllNotificationsRead,
  ]);

  return {
    newNotification,
    unreadCount,
    isConnected,
    clearNewNotification: () => setNewNotification(null),
  };
};