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
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import { useTabBarHeight } from '../hooks/useTabBarHeight';
import api from '../api/client';
import { timeAgo } from '../utils/helpers';

interface Conversation {
  id: string;
  other_id: string;
  other_name: string;
  other_picture?: string;
  other_verified?: boolean;
  last_message: string;
  last_sender_id: string;
  last_message_at: string;
  last_media_type?: string;
  unread_count: number;
  is_encrypted?: boolean;
}

export default function MessagesScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { contentBottomPadding } = useTabBarHeight();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: conversations = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dm-inbox'],
    queryFn: async () => {
      try {
        const response = await api.get('/dm/inbox');
        const data = Array.isArray(response.data) ? response.data : response.data.data || [];
        return data as Conversation[];
      } catch (error) {
        console.error('Error fetching inbox:', error);
        return [];
      }
    },
    enabled: !!user,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const openConversation = (conversation: Conversation) => {
    (navigation.navigate as any)('ChatDetail', {
      conversationId: conversation.id,
      otherUserId: conversation.other_id,
      otherName: conversation.other_name,
      otherPicture: conversation.other_picture,
    });
  };

  const handleNewMessage = () => {
    (navigation.navigate as any)('NewMessage');
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const isUnread = item.unread_count > 0;
    const isMine = item.last_sender_id === user?.id;
    const preview = isMine ? `You: ${item.last_message || 'Media'}` : item.last_message || 'Media';
    const time = timeAgo(item.last_message_at);

    return (
      <TouchableOpacity
        style={[
          styles.conversationItem,
          { 
            backgroundColor: colors.surface, 
            borderBottomColor: colors.border 
          },
          isUnread && { backgroundColor: isDark ? '#1f2937' : '#f0f4ff' }
        ]}
        onPress={() => openConversation(item)}
        activeOpacity={0.7}
      >
        <Avatar
          source={item.other_picture}
          size={50}
          fallback={item.other_name || 'User'}
        />
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={[
              styles.userName, 
              { color: colors.text },
              isUnread && { color: colors.text }
            ]}>
              {item.other_name}
            </Text>
            <Text style={[
              styles.timestamp, 
              { color: colors.textMuted },
              isUnread && { color: colors.text }
            ]}>
              {time}
            </Text>
          </View>
          <Text
            style={[
              styles.lastMessage, 
              { color: colors.textSecondary },
              isUnread && { color: colors.text, fontWeight: '700' }
            ]}
            numberOfLines={1}
          >
            {item.last_media_type === 'image' ? '📷 Image' :
             item.last_media_type === 'video' ? '🎬 Video' :
             item.last_media_type === 'audio' ? '🎵 Audio' :
             preview}
          </Text>
        </View>
        {isUnread && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Feather name="message-circle" size={48} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No messages yet</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Start a conversation with someone!</Text>
      <TouchableOpacity style={[styles.emptyButton, { backgroundColor: colors.primary }]} onPress={handleNewMessage}>
        <Text style={styles.emptyButtonText}>New Message</Text>
      </TouchableOpacity>
    </View>
  );

  if (!user) {
    return (
      <SafeAreaView style={[styles.placeholderContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <Feather name="lock" size={48} color={colors.textMuted} />
        <Text style={[styles.placeholderTitle, { color: colors.text }]}>Not signed in</Text>
        <Text style={[styles.placeholderSubtitle, { color: colors.textSecondary }]}>
          Sign in to view your messages.
        </Text>
        <TouchableOpacity
          style={[styles.signInButton, { backgroundColor: colors.primary }]}
          onPress={() => (navigation.navigate as any)('Login')}
        >
          <Text style={styles.signInButtonText}>Sign In</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

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
        <Text style={[styles.errorTitle, { color: colors.text }]}>Failed to load messages</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={handleRefresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { 
        backgroundColor: colors.surface, 
        borderBottomColor: colors.border 
      }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
        <TouchableOpacity onPress={handleNewMessage} style={styles.newButton}>
          <Feather name="edit-2" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderConversation}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: contentBottomPadding }
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  placeholderSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  signInButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  signInButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  newButton: {
    padding: 6,
  },
  listContent: {
    paddingTop: 8,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  conversationContent: {
    flex: 1,
    marginLeft: 12,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 12,
  },
  lastMessage: {
    fontSize: 14,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  emptyButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
});