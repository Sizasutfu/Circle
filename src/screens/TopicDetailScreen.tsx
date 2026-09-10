// screens/TopicDetailScreen.tsx
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTabBarHeight } from '../hooks/useTabBarHeight';
import { useTopicFeed, useFollowTopic } from '../hooks/useExplore';
import { useQueryClient } from '@tanstack/react-query';
import PostCard from '../components/PostCard';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

export default function TopicDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { contentBottomPadding } = useTabBarHeight();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);

  const topic = (route.params as any)?.topic || '';
  const decodedTopic = useMemo(() => {
    try {
      return decodeURIComponent(topic);
    } catch {
      return topic;
    }
  }, [topic]);

  const [isFollowing, setIsFollowing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: topicFeedData,
    isLoading: feedLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchFeed,
  } = useTopicFeed(decodedTopic);

  const topicPosts = useMemo(() => {
    if (!topicFeedData) return [];
    return topicFeedData.pages.flatMap((page) => page.posts) || [];
  }, [topicFeedData]);

  const followTopic = useFollowTopic();

  const handleFollowToggle = useCallback(async () => {
    try {
      const newFollowing = !isFollowing;
      setIsFollowing(newFollowing);
      await followTopic.mutateAsync(decodedTopic);

      queryClient.setQueryData(['explore', 'topics', 50], (oldData: any) => {
        if (!oldData) return oldData;
        return oldData.map((t: any) => {
          if (t.topic === decodedTopic) {
            return { ...t, isFollowing: newFollowing };
          }
          return t;
        });
      });
    } catch (error) {
      setIsFollowing(!isFollowing);
      console.error('Error following topic:', error);
    }
  }, [isFollowing, decodedTopic, followTopic, queryClient]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchFeed();
    setRefreshing(false);
  }, [refetchFeed]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const renderPostItem = ({ item }: { item: any }) => (
    <PostCard
      key={`${item.id}-${item.likes?.length || 0}-${item.reposts?.length || 0}`}
      post={item}
    />
  );

  const renderHeader = () => (
    <View
      style={[
        styles.header,
        {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.headerContent}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          #{decodedTopic}
        </Text>
        {user && (
          <TouchableOpacity
            style={[
              styles.followButton,
              {
                backgroundColor: isFollowing ? (isDark ? '#374151' : '#e5e7eb') : colors.primary,
              },
            ]}
            onPress={handleFollowToggle}
          >
            <Text
              style={[
                styles.followButtonText,
                { color: isFollowing ? colors.text : 'white' },
              ]}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.headerSubtitle}>
        <Text style={[styles.postCount, { color: colors.textSecondary }]}>
          {topicPosts.length} {topicPosts.length === 1 ? 'post' : 'posts'}
        </Text>
      </View>
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

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Feather name="hash" size={64} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No posts yet</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        Be the first to post about #{decodedTopic}!
      </Text>
    </View>
  );

  if (feedLoading && topicPosts.length === 0) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {renderHeader()}

      <AnimatedFlatList
        ref={flatListRef}
        data={topicPosts}
        keyExtractor={(item: any) => item.id}
        renderItem={renderPostItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[
          styles.feedContent,
          { paddingBottom: contentBottomPadding + 80 },
          topicPosts.length === 0 && { flex: 1 },
        ]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={50}
        windowSize={7}
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
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginHorizontal: 12,
  },
  followButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  followButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  headerSubtitle: {
    marginTop: 4,
    paddingLeft: 36,
  },
  postCount: {
    fontSize: 13,
  },
  feedContent: {
    paddingTop: 8,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  footerText: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
});