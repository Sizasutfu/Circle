import React, { useState, useMemo, useCallback, useRef } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useFeed } from '../hooks/useFeed';
import { useTabBarHeight } from '../hooks/useTabBarHeight';
import PostCard, { Post } from '../components/PostCard';

type FeedTab = 'global' | 'following';

interface FeedPost extends Post {
  _key?: string;
}

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<any>);

export default function FeedScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { contentBottomPadding, fabBottomOffset } = useTabBarHeight();
  const [activeTab, setActiveTab] = useState<FeedTab>('global');
  const flatListRef = useRef<FlatList>(null);
  
  const scrollY = useRef(new Animated.Value(0)).current;
  const fabTranslateY = useRef(new Animated.Value(0)).current;
  const fabOpacity = useRef(new Animated.Value(1)).current;
  const lastScrollY = useRef(0);
  const [fabVisible, setFabVisible] = useState(true);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeed(activeTab);

  const posts = useMemo(() => {
    const allPosts = data?.pages.flatMap((page) => page.posts) || [];
    const seen = new Set();
    const unique = allPosts.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    return unique.map((p, index) => ({
      ...p,
      _key: `${p.id}-${index}`,
    }));
  }, [data]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleNotifications = useCallback(() => {
    (navigation.navigate as any)('Notifications');
  }, [navigation]);

  const handleCreatePost = useCallback(() => {
    (navigation.navigate as any)('CreatePostModal');
  }, [navigation]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(
    ({ item }: { item: FeedPost }) => <PostCard post={item} />,
    []
  );

  const keyExtractor = useCallback((item: FeedPost, index: number) => {
    return item._key || item.id || String(index);
  }, []);

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: true,
      listener: ({ nativeEvent }: { nativeEvent: { contentOffset: { y: number } } }) => {
        const currentScrollY = nativeEvent.contentOffset.y;
        const scrollDelta = currentScrollY - lastScrollY.current;
        
        if (Math.abs(scrollDelta) > 5) {
          if (scrollDelta > 0 && fabVisible) {
            setFabVisible(false);
            Animated.parallel([
              Animated.timing(fabTranslateY, {
                toValue: 100,
                duration: 250,
                useNativeDriver: true,
              }),
              Animated.timing(fabOpacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
              }),
            ]).start();
          } else if (scrollDelta < 0 && !fabVisible) {
            setFabVisible(true);
            Animated.parallel([
              Animated.timing(fabTranslateY, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
              }),
              Animated.timing(fabOpacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
              }),
            ]).start();
          }
          lastScrollY.current = currentScrollY;
        }
      },
    }
  );

  const ListFooterComponent = useMemo(() => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={[styles.footerLoader, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [isFetchingNextPage]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (isError) {
    const errorMessage = error?.message || 'Something went wrong.';
    return (
      <SafeAreaView style={[styles.errorContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <Feather name="alert-circle" size={48} color="#ef4444" />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Oops!</Text>
        <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>{errorMessage}</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={handleRefresh}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (posts.length === 0) {
    return (
      <SafeAreaView style={[styles.emptyContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <Feather name="feather" size={48} color={colors.textMuted} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No posts yet</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          {activeTab === 'global'
            ? 'There are no posts in the global feed yet.'
            : "You're not following anyone yet. Discover people to follow!"}
        </Text>
        {activeTab === 'following' && (
          <TouchableOpacity
            style={[styles.emptyButton, { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab('global')}
          >
            <Text style={styles.emptyButtonText}>View Global Feed</Text>
          </TouchableOpacity>
        )}
        <Animated.View
          style={[
            styles.fabContainer,
            { bottom: fabBottomOffset },
          ]}
        >
          <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={handleCreatePost}>
            <Feather name="plus" size={28} color="white" />
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ─── Header ─── */}
      <View style={[styles.header, { 
        backgroundColor: colors.surface, 
        borderBottomColor: colors.border 
      }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: colors.primary }]}>Circle</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={handleNotifications} style={styles.headerIcon}>
            <Feather name="bell" size={22} color={colors.text} />
          </TouchableOpacity>
          {!user && (
            <TouchableOpacity
              style={[styles.signInButton, { backgroundColor: colors.primary }]}
              onPress={() => (navigation.navigate as any)('Login')}
            >
              <Text style={styles.signInButtonText}>Sign In</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── Tabs ─── */}
      <View style={[styles.tabsContainer, { 
        backgroundColor: colors.surface, 
        borderBottomColor: colors.border 
      }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'global' && styles.tabActive]}
          onPress={() => setActiveTab('global')}
        >
          <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'global' && styles.tabTextActive]}>
            Global
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'following' && styles.tabActive]}
          onPress={() => setActiveTab('following')}
        >
          <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'following' && styles.tabTextActive]}>
            Following
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── Feed ─── */}
      <AnimatedFlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={ListFooterComponent}
        contentContainerStyle={[
          styles.feedContent,
          { paddingBottom: contentBottomPadding }
        ]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />

      {/* ─── FAB ─── */}
      <Animated.View
        style={[
          styles.fabContainer,
          {
            transform: [{ translateY: fabTranslateY }],
            opacity: fabOpacity,
            bottom: fabBottomOffset,
          },
        ]}
      >
        <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={handleCreatePost} activeOpacity={0.9}>
          <Feather name="plus" size={28} color="white" />
        </TouchableOpacity>
      </Animated.View>
    </View>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 12,
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 20,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 20,
  },
  emptyButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    padding: 6,
    marginLeft: 4,
  },
  signInButton: {
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  signInButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#6C63FF',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#6C63FF',
    fontWeight: '600',
  },
  feedContent: {
    paddingTop: 8,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  fabContainer: {
    position: 'absolute',
    right: 20,
    zIndex: 999,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});