import { useEffect, useState, useCallback } from 'react';
import { socketService } from '../services/socket';
import { useQueryClient } from '@tanstack/react-query';
import { Notification } from './useNotifications';

export const useRealtimeNotifications = (userId: string) => {
  const queryClient = useQueryClient();
  const [newNotification, setNewNotification] = useState<Notification | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);

  // Handle new notification
  const handleNewNotification = useCallback((data: any) => {
    console.log('🔔 New notification in hook:', data);
    
    // Update the notifications cache
    queryClient.setQueryData(['notifications', userId], (oldData: any) => {
      if (!oldData) return oldData;
      
      // Add new notification to the first page
      const newNotification = {
        ...data,
        read: false,
      };
      
      return {
        ...oldData,
        pages: oldData.pages.map((page: any, index: number) => {
          if (index === 0) {
            return {
              ...page,
              notifications: [newNotification, ...page.notifications],
            };
          }
          return page;
        }),
      };
    });

    // Update unread count
    setUnreadCount(prev => prev + 1);
    setNewNotification(data);
  }, [userId, queryClient]);

  // Handle unread count update
  const handleUnreadCountUpdate = useCallback((data: any) => {
    console.log('📊 Unread count update:', data);
    setUnreadCount(data.count || data.unreadCount || 0);
  }, []);

  // Handle notification read
  const handleNotificationRead = useCallback((data: any) => {
    console.log('✅ Notification marked as read:', data);
    
    // Update the notification in cache
    queryClient.setQueryData(['notifications', userId], (oldData: any) => {
      if (!oldData) return oldData;
      
      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
          ...page,
          notifications: page.notifications.map((notification: Notification) => 
            notification.id === data.notificationId 
              ? { ...notification, read: true }
              : notification
          ),
        })),
      };
    });
  }, [userId, queryClient]);

  // Handle all notifications read
  const handleAllNotificationsRead = useCallback(() => {
    console.log('✅ All notifications marked as read');
    setUnreadCount(0);
    
    // Update all notifications to read
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

  // Handle connection status
  const handleConnected = useCallback(() => {
    setIsConnected(true);
    console.log('✅ Socket connected');
  }, []);

  const handleDisconnected = useCallback(() => {
    setIsConnected(false);
    console.log('❌ Socket disconnected');
  }, []);

  // Set up socket listeners
  useEffect(() => {
    if (!userId) return;

    // Register event listeners
    socketService.on('new-notification', handleNewNotification);
    socketService.on('unread-count-updated', handleUnreadCountUpdate);
    socketService.on('notification-read', handleNotificationRead);
    socketService.on('all-notifications-read', handleAllNotificationsRead);
    socketService.on('connected', handleConnected);
    socketService.on('disconnected', handleDisconnected);

    // Clean up listeners
    return () => {
      socketService.off('new-notification', handleNewNotification);
      socketService.off('unread-count-updated', handleUnreadCountUpdate);
      socketService.off('notification-read', handleNotificationRead);
      socketService.off('all-notifications-read', handleAllNotificationsRead);
      socketService.off('connected', handleConnected);
      socketService.off('disconnected', handleDisconnected);
    };
  }, [userId, handleNewNotification, handleUnreadCountUpdate, handleNotificationRead, handleAllNotificationsRead, handleConnected, handleDisconnected]);

  // Return real-time data
  return {
    newNotification,
    unreadCount,
    isConnected,
    clearNewNotification: () => setNewNotification(null),
  };
};