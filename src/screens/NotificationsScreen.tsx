import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useWs } from '../contexts/WsContext';
import { Avatar } from '../components/Avatar';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  Notification,
} from '../hooks/useNotifications';
import { timeAgo, safeString } from '../utils/helpers';

// Define navigation params type
type RootStackParamList = {
  PostDetail: { postId: string };
  Profile: { userId: string };
};

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { registerHandler, isAlive } = useWs();
  const userId = user?.id || '';

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useNotifications(userId);
  
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAllRead } = useMarkAllNotificationsRead(userId);
  const [refreshing, setRefreshing] = useState(false);
  const [newNotification, setNewNotification] = useState<Notification | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Flatten all pages of notifications
  const notifications = data?.pages?.flatMap(page => page.notifications) || [];

  // Check connection status periodically
  useEffect(() => {
    const checkConnection = () => {
      setIsConnected(isAlive());
    };
    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, [isAlive]);

  // Register WebSocket handlers for notifications
  useEffect(() => {
    if (!userId) return;

    // Handle new notification from WebSocket
    const unregisterNewNotification = registerHandler('new-notification', (data: any) => {
      console.log('🔔 New notification via WebSocket:', data);
      
      // Map the incoming data to match our Notification type
      const notification: Notification = {
        id: data.id || data.notificationId || '',
        type: data.type || 'like',
        userId: data.actorId || data.userId || '',
        user: {
          id: data.actorId || data.userId || '',
          name: data.actorName || data.userName || 'Someone',
          username: data.actorUsername || data.userUsername || '',
          avatar: data.actorPicture || data.userAvatar || undefined,
        },
        postId: data.postId || null,
        postText: data.postSnippet || data.postText || null,
        commentId: data.commentId || null,
        commentText: data.commentText || null,
        text: data.text || '',
        createdAt: data.createdAt || new Date().toISOString(),
        read: false,
      };

      setNewNotification(notification);
      
      // Show alert
      const displayName = notification.user?.name || 'Someone';
      let actionText = '';
      switch (notification.type) {
        case 'like':
          actionText = 'liked your post';
          break;
        case 'comment':
          actionText = 'commented on your post';
          break;
        case 'repost':
          actionText = 'reposted your post';
          break;
        case 'follow':
          actionText = 'started following you';
          break;
        case 'mention':
          actionText = 'mentioned you in a post';
          break;
        default:
          actionText = 'interacted with you';
      }

      Alert.alert(
        '🔔 New Notification',
        `${displayName} ${actionText}`,
        [
          { 
            text: 'View', 
            onPress: () => {
              if (notification.postId) {
                navigation.navigate('PostDetail' as never, { postId: notification.postId } as never);
              } else if (notification.userId) {
                navigation.navigate('Profile' as never, { userId: notification.userId } as never);
              }
              setNewNotification(null);
            }
          },
          { 
            text: 'Dismiss', 
            onPress: () => setNewNotification(null) 
          },
        ]
      );

      // Refetch notifications to update the list
      refetch();
    });

    // Handle notification read updates
    const unregisterNotificationRead = registerHandler('notification-read', (data: any) => {
      console.log('✅ Notification marked as read via WebSocket:', data);
      refetch();
    });

    // Handle all notifications read
    const unregisterAllRead = registerHandler('all-notifications-read', (data: any) => {
      console.log('✅ All notifications marked as read via WebSocket:', data);
      refetch();
    });

    // Handle unread count updates
    const unregisterUnreadCount = registerHandler('unread-count-updated', (data: any) => {
      console.log('📊 Unread count updated via WebSocket:', data);
    });

    // Cleanup handlers
    return () => {
      unregisterNewNotification();
      unregisterNotificationRead();
      unregisterAllRead();
      unregisterUnreadCount();
    };
  }, [userId, registerHandler, refetch, navigation]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  // ✅ Fixed: Navigation with proper typing
  const handleNotificationPress = (notification: Notification) => {
    if (!notification.read) {
      markRead(notification.id);
    }
    const type = notification.type;
    if (['like', 'comment', 'repost'].includes(type) && notification.postId) {
      navigation.navigate('PostDetail' as never, { postId: notification.postId } as never);
    } else if (type === 'follow' && notification.userId) {
      navigation.navigate('Profile' as never, { userId: notification.userId } as never);
    } else if (type === 'mention' && notification.postId) {
      navigation.navigate('PostDetail' as never, { postId: notification.postId } as never);
    }
  };

  const handleMarkAllRead = () => {
    markAllRead();
  };

  const getSafeDisplayName = (notification: Notification): string => {
    if (notification.user?.name && 
        notification.user.name !== 'Unknown' && 
        notification.user.name !== 'null' && 
        notification.user.name !== 'undefined') {
      return notification.user.name;
    }
    if (notification.user?.username) {
      return notification.user.username;
    }
    if (notification.userId) {
      return 'User';
    }
    return 'Someone';
  };

  const getSafeAvatar = (notification: Notification): string | undefined => {
    return notification.user?.avatar || undefined;
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const { type, postText, commentText, createdAt, read, text } = item;
    const time = timeAgo(createdAt);
    
    const displayName = getSafeDisplayName(item);
    const avatar = getSafeAvatar(item);

    let actionText = '';
    let iconName: keyof typeof Feather.glyphMap = 'heart';
    let iconColor = '#6b7280';

    switch (type) {
      case 'like':
        actionText = text || 'liked your post';
        iconName = 'heart';
        iconColor = '#ef4444';
        break;
      case 'comment':
        actionText = text || 'commented on your post';
        iconName = 'message-circle';
        iconColor = '#3b82f6';
        break;
      case 'repost':
        actionText = text || 'reposted your post';
        iconName = 'repeat';
        iconColor = '#22c55e';
        break;
      case 'follow':
        actionText = text || 'started following you';
        iconName = 'user-plus';
        iconColor = colors.primary;
        break;
      case 'mention':
        actionText = text || 'mentioned you in a post';
        iconName = 'at-sign';
        iconColor = '#f59e0b';
        break;
      default:
        actionText = text || 'interacted with you';
    }

    return (
      <TouchableOpacity
        style={[
          styles.notificationItem,
          { 
            backgroundColor: read ? colors.surface : (isDark ? '#1f2937' : '#f0f4ff'),
            borderBottomColor: colors.border 
          },
          !read && styles.unread,
        ]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <Avatar source={avatar} size={48} fallback={displayName} />
          <View style={[styles.iconBadge, { backgroundColor: iconColor }]}>
            <Feather name={iconName} size={12} color="white" />
          </View>
        </View>

        <View style={styles.content}>
          <Text style={[styles.text, { color: colors.text }]}>
            <Text style={[styles.userName, { color: colors.text }]}>
              {safeString(displayName)}
            </Text>
            {' '}
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>
              {actionText}
            </Text>
          </Text>

          {postText && type !== 'follow' && (
            <Text style={[styles.postPreview, { color: colors.textSecondary }]} numberOfLines={2}>
              "{safeString(postText)}"
            </Text>
          )}
          {commentText && type === 'comment' && (
            <Text style={[styles.commentText, { 
              color: colors.text,
              backgroundColor: isDark ? '#374151' : '#f3f4f6' 
            }]}>
              💬 {safeString(commentText)}
            </Text>
          )}

          <View style={styles.metaRow}>
            <Text style={[styles.timestamp, { color: colors.textMuted }]}>{time}</Text>
            {!isConnected && (
              <View style={styles.connectionStatus}>
                <View style={styles.statusDot} />
                <Text style={[styles.statusText, { color: colors.textMuted }]}>Reconnecting...</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Feather name="bell-off" size={64} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications yet</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        When someone interacts with you, it'll show up here.
      </Text>
    </View>
  );

  const renderFooter = () => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          Loading more...
        </Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={[styles.errorContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <Feather name="alert-circle" size={48} color="#ef4444" />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Failed to load notifications</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const hasUnread = notifications.some(n => !n.read);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { 
        backgroundColor: colors.surface, 
        borderBottomColor: colors.border 
      }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
        <View style={styles.headerRight}>
          {isConnected && (
            <View style={styles.connectionBadge}>
              <View style={styles.greenDot} />
            </View>
          )}
          {hasUnread && (
            <TouchableOpacity onPress={handleMarkAllRead}>
              <Text style={[styles.markAllRead, { color: colors.primary }]}>Mark all as read</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotification}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={[
          notifications.length === 0 ? { flex: 1 } : { paddingBottom: 16 },
          { backgroundColor: colors.background }
        ]}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1 
  },
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  errorContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 32 
  },
  errorTitle: { 
    fontSize: 18, 
    fontWeight: '600', 
    marginTop: 12 
  },
  retryButton: { 
    marginTop: 20, 
    paddingHorizontal: 32, 
    paddingVertical: 10, 
    borderRadius: 8 
  },
  retryButtonText: { 
    color: 'white', 
    fontWeight: '600', 
    fontSize: 16 
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    borderBottomWidth: 1 
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: '700' 
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markAllRead: { 
    fontSize: 14, 
    fontWeight: '500' 
  },
  connectionBadge: {
    padding: 4,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  notificationItem: { 
    flexDirection: 'row', 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    borderBottomWidth: 1 
  },
  unread: { 
    backgroundColor: '#f0f4ff' 
  },
  avatarContainer: { 
    position: 'relative', 
    marginRight: 12 
  },
  iconBadge: { 
    position: 'absolute', 
    bottom: -4, 
    right: -4, 
    width: 22, 
    height: 22, 
    borderRadius: 11, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderWidth: 2, 
    borderColor: 'white' 
  },
  content: { 
    flex: 1 
  },
  text: { 
    fontSize: 14, 
    lineHeight: 20 
  },
  userName: { 
    fontWeight: '700' 
  },
  actionText: { 
    color: '#4b5563' 
  },
  postPreview: { 
    fontSize: 13, 
    marginTop: 2, 
    fontStyle: 'italic' 
  },
  commentText: { 
    fontSize: 13, 
    marginTop: 2, 
    padding: 6, 
    borderRadius: 6 
  },
  metaRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginTop: 4, 
    gap: 12 
  },
  timestamp: { 
    fontSize: 12 
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f59e0b',
  },
  statusText: {
    fontSize: 10,
  },
  emptyContainer: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingHorizontal: 32 
  },
  emptyTitle: { 
    fontSize: 18, 
    fontWeight: '600', 
    marginTop: 16 
  },
  emptySubtitle: { 
    fontSize: 14, 
    textAlign: 'center', 
    marginTop: 8 
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  footerText: {
    fontSize: 14,
  },
});