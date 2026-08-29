import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../contexts/AuthContext';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  Notification,
} from '../hooks/useNotifications';
import { timeAgo, safeString } from '../utils/helpers';

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const userId = user?.id || '';

  const { data: notifications = [], isLoading, isError, refetch } = useNotifications(userId);
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAllRead } = useMarkAllNotificationsRead(userId);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleNotificationPress = (notification: Notification) => {
    if (!notification.read) {
      markRead(notification.id);
    }
    const type = notification.type;
    if (['like', 'comment', 'repost'].includes(type) && notification.postId) {
      (navigation.navigate as any)('PostDetail', { postId: notification.postId });
    } else if (type === 'follow' && notification.userId) {
      (navigation.navigate as any)('Profile', { userId: notification.userId });
    } else if (type === 'mention' && notification.postId) {
      (navigation.navigate as any)('PostDetail', { postId: notification.postId });
    }
  };

  const handleMarkAllRead = () => {
    markAllRead();
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    // Safely extract user with fallback
    const notificationUser = item.user || { id: '', name: 'Unknown', username: 'unknown', avatar: undefined };
    const { type, postText, commentText, createdAt, read, text } = item;
    const time = timeAgo(createdAt);

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
        iconColor = '#6C63FF';
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
        style={[styles.notificationItem, !read && styles.unread]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <Avatar source={notificationUser.avatar} size={48} fallback={notificationUser.name} />
          <View style={[styles.iconBadge, { backgroundColor: iconColor }]}>
            <Feather name={iconName} size={12} color="white" />
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.text}>
            <Text style={styles.userName}>{safeString(notificationUser.name)}</Text>
            {' '}
            <Text style={styles.actionText}>{actionText}</Text>
          </Text>

          {postText && type !== 'follow' && (
            <Text style={styles.postPreview} numberOfLines={2}>
              "{safeString(postText)}"
            </Text>
          )}
          {commentText && type === 'comment' && (
            <Text style={styles.commentText}>💬 {safeString(commentText)}</Text>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.timestamp}>{time}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Feather name="bell-off" size={64} color="#d1d5db" />
      <Text style={styles.emptyTitle}>No notifications yet</Text>
      <Text style={styles.emptySubtitle}>
        When someone interacts with you, it'll show up here.
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Feather name="alert-circle" size={48} color="#ef4444" />
        <Text style={styles.errorTitle}>Failed to load notifications</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const hasUnread = (notifications || []).some(n => !n.read);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {hasUnread && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAllRead}>Mark all as read</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotification}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6C63FF" />
        }
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={!notifications || notifications.length === 0 ? { flex: 1 } : { paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, backgroundColor: 'white' },
  errorTitle: { fontSize: 18, fontWeight: '600', color: '#1f2937', marginTop: 12 },
  retryButton: { marginTop: 20, backgroundColor: '#6C63FF', paddingHorizontal: 32, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1f2937' },
  markAllRead: { fontSize: 14, color: '#6C63FF', fontWeight: '500' },
  notificationItem: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  unread: { backgroundColor: '#f0f4ff' },
  avatarContainer: { position: 'relative', marginRight: 12 },
  iconBadge: { position: 'absolute', bottom: -4, right: -4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' },
  content: { flex: 1 },
  text: { fontSize: 14, lineHeight: 20, color: '#1f2937' },
  userName: { fontWeight: '700' },
  actionText: { color: '#4b5563' },
  postPreview: { fontSize: 13, color: '#6b7280', marginTop: 2, fontStyle: 'italic' },
  commentText: { fontSize: 13, color: '#374151', marginTop: 2, backgroundColor: '#f3f4f6', padding: 6, borderRadius: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 12 },
  timestamp: { fontSize: 12, color: '#9ca3af' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 8 },
});