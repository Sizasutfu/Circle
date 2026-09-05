import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import PostCard from '../components/PostCard';
import PersonRow from '../components/PersonRow';
import TopicListRow from '../components/TopicListRow';
import SearchResultItem from '../components/SearchResultItem';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  useTopics,
  useTrendingPosts,
  useRecommendedPeople,
  useNewMembers,
  useExploreSearch,
  useSearchHistory,
  useSaveSearchHistory,
  useDeleteSearchHistoryEntry,
  useClearSearchHistory,
  useFollowToggle,
  type SearchResultType,
  type Topic,
} from '../hooks/useExplore';
import { useTabBarHeight } from '../hooks/useTabBarHeight';
import { useWs } from '../contexts/WsContext';
import { useQueryClient } from '@tanstack/react-query';

// ✅ Create Animated components
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const SEARCH_TABS: { id: 'all' | SearchResultType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'post', label: 'Posts' },
  { id: 'user', label: 'People' },
  { id: 'group', label: 'Groups' },
];

// ── Safe string helper ──
function safeString(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  try {
    return String(value);
  } catch {
    return '';
  }
}

// ── Safe joined text helper ──
function joinedText(createdAt: string | null | undefined): string {
  if (!createdAt) return 'New member';
  try {
    const date = new Date(createdAt);
    if (isNaN(date.getTime())) return 'New member';
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days <= 0) return 'Joined today';
    if (days === 1) return 'Joined yesterday';
    return `Joined ${days} days ago`;
  } catch (error) {
    return 'New member';
  }
}

export default function ExploreScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { contentBottomPadding } = useTabBarHeight();
  const { registerHandler } = useWs();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);

  // ── Search state ──
  const [searchInput, setSearchInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [searchType, setSearchType] = useState<'all' | SearchResultType>('all');
  const debouncedQuery = useDebouncedValue(searchInput, 300);
  const trimmedQuery = debouncedQuery.trim();
  const isSearching = trimmedQuery.length >= 2;
  const showHistory = inputFocused && searchInput.trim().length === 0;

  // ── Default explore data ──
  const { data: topics = [], isLoading: topicsLoading } = useTopics();
  const { 
    data: trendingData, 
    isLoading: trendingLoading,
    refetch: refetchTrending,
    fetchNextPage: fetchMoreTrending,
    hasNextPage: hasMoreTrending,
    isFetchingNextPage: isFetchingMoreTrending,
  } = useTrendingPosts();
  const { data: people = [], isLoading: peopleLoading } = useRecommendedPeople(user?.id);
  const { data: newMembers = [], isLoading: newMembersLoading } = useNewMembers();

  // Flatten trending posts
  const trendingPosts = useMemo(() => {
    const allPosts = trendingData?.pages?.flatMap((page: any) => page.posts) || [];
    const seen = new Set();
    const unique = allPosts.filter((p: any) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    return unique.map((p: any, index: number) => ({
      ...p,
      _key: `${p.id}-${index}`,
      rank: index + 1,
    }));
  }, [trendingData]);

  // ── Search data ──
  const {
    data: searchData,
    isLoading: searchLoading,
    fetchNextPage: fetchMoreSearch,
    hasNextPage: hasMoreSearch,
    isFetchingNextPage: isFetchingMoreSearch,
  } = useExploreSearch(trimmedQuery, searchType);
  const searchResults = useMemo(
    () => searchData?.pages?.flatMap((page: any) => page.results) ?? [],
    [searchData]
  );

  // ── Debugging: log search state ──
  useEffect(() => {
    if (isSearching) {
      console.log('🔍 Search state:', {
        hasMoreSearch,
        isFetchingMoreSearch,
        searchResultsLength: searchResults.length,
        query: trimmedQuery,
      });
    }
  }, [hasMoreSearch, isFetchingMoreSearch, searchResults, trimmedQuery, isSearching]);

  // ── Search history ──
  const { data: history = [] } = useSearchHistory();
  const saveHistory = useSaveSearchHistory();
  const deleteHistoryEntry = useDeleteSearchHistoryEntry();
  const clearHistory = useClearSearchHistory();

  // ── Follow state ──
  const [followingIds, setFollowingIds] = useState<Set<number>>(new Set());
  const followToggle = useFollowToggle();

  // ── WebSocket handlers for real-time updates ──
  useEffect(() => {
    const unregisterLikeUpdate = registerHandler('like_update', (data: any) => {
      queryClient.setQueryData(['explore', 'trending'], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            posts: page.posts.map((post: any) => {
              if (post.id === data.postId) {
                return {
                  ...post,
                  likes: data.userIds || post.likes,
                };
              }
              return post;
            }),
          })),
        };
      });
    });

    const unregisterRepostUpdate = registerHandler('repost_update', (data: any) => {
      queryClient.setQueryData(['explore', 'trending'], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            posts: page.posts.map((post: any) => {
              if (post.id === data.postId) {
                return {
                  ...post,
                  reposts: data.userIds || post.reposts,
                  repostCount: data.count || post.repostCount,
                };
              }
              return post;
            }),
          })),
        };
      });
    });

    const unregisterCommentUpdate = registerHandler('comment_update', (data: any) => {
      queryClient.setQueryData(['explore', 'trending'], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            posts: page.posts.map((post: any) => {
              if (post.id === data.postId) {
                return {
                  ...post,
                  commentCount: data.count || post.commentCount,
                };
              }
              return post;
            }),
          })),
        };
      });
    });

    return () => {
      unregisterLikeUpdate();
      unregisterRepostUpdate();
      unregisterCommentUpdate();
    };
  }, [registerHandler, queryClient]);

  const handleFollowToggle = useCallback(
    (userId: number) => {
      const isFollowing = followingIds.has(userId);
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.delete(userId);
        else next.add(userId);
        return next;
      });
      followToggle.mutate(
        { userId, isFollowing },
        {
          onError: () => {
            setFollowingIds((prev) => {
              const next = new Set(prev);
              if (isFollowing) next.add(userId);
              else next.delete(userId);
              return next;
            });
          },
        }
      );
    },
    [followingIds, followToggle]
  );

  const handlePersonPress = useCallback(
    (userId: number) => {
      (navigation.navigate as any)('Profile', { userId });
    },
    [navigation]
  );

  const handleCreatePost = useCallback(() => {
    (navigation.navigate as any)('CreatePostModal');
  }, [navigation]);

  // ── Handle topic press - navigate to TopicDetailScreen ──
  const handleTopicPress = useCallback((topic: string) => {
    (navigation.navigate as any)('TopicDetail', { topic });
  }, [navigation]);

  const runSearch = useCallback(
    (q: string) => {
      setSearchInput(q);
      setInputFocused(false);
      if (q.trim().length >= 2) {
        saveHistory.mutate({ query: q.trim(), tab: searchType });
      }
    },
    [saveHistory, searchType]
  );

  // ── Load more handler with extra safety ──
  const handleLoadMoreSearch = useCallback(() => {
    console.log('📥 Load more called, hasMoreSearch:', hasMoreSearch, 'isFetching:', isFetchingMoreSearch);
    if (hasMoreSearch && !isFetchingMoreSearch) {
      fetchMoreSearch();
    }
  }, [hasMoreSearch, isFetchingMoreSearch, fetchMoreSearch]);

  const handleLoadMoreTrending = useCallback(() => {
    if (hasMoreTrending && !isFetchingMoreTrending) {
      fetchMoreTrending();
    }
  }, [hasMoreTrending, isFetchingMoreTrending, fetchMoreTrending]);

  const handleRefresh = useCallback(() => {
    refetchTrending();
  }, [refetchTrending]);

  // ── Render functions ──

  const renderTrendingItem = ({ item, index }: { item: any; index: number }) => {
    const rank = item.rank || index + 1;
    let rankColor = colors.textMuted;
    let rankBg = 'transparent';

    if (rank === 1) {
      rankColor = '#f59e0b';
      rankBg = '#fef3c7';
    } else if (rank === 2) {
      rankColor = '#9ca3af';
      rankBg = '#f3f4f6';
    } else if (rank === 3) {
      rankColor = '#d97706';
      rankBg = '#fffbeb';
    }

    return (
      <View key={`trending-${item.id}`}>
        <PostCard
          key={`post-${item.id}-${item.likes?.length || 0}-${item.reposts?.length || 0}`}
          post={item}
        />
        <View style={[styles.rankContainer, { backgroundColor: colors.surface }]}>
          <View style={[styles.rankBadge, { backgroundColor: rankBg, borderColor: colors.border }]}>
            <Text style={[styles.rankText, { color: rankColor }]}>
              #{safeString(rank)}
            </Text>
          </View>
          {item.trendingScore !== undefined && item.trendingScore !== null && (
            <View style={styles.scoreContainer}>
              <Feather name="trending-up" size={14} color={colors.primary} />
              <Text style={[styles.scoreText, { color: colors.textSecondary }]}>
                {safeString(item.trendingScore)} pts
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderExploreHeader = () => (
    <View>
      {/* Trending Topics */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Trending Topics</Text>
          <TouchableOpacity onPress={() => (navigation.navigate as any)('Topics')}>
            <Text style={[styles.seeAllText, { color: colors.primary }]}>See All</Text>
          </TouchableOpacity>
        </View>
        {topicsLoading ? (
          <ActivityIndicator style={styles.sectionLoader} color={colors.primary} />
        ) : topics.length === 0 ? (
          <Text style={[styles.sectionEmpty, { color: colors.textSecondary }]}>
            No topics yet — start posting with #hashtags!
          </Text>
        ) : (
          topics
            .slice(0, 10)
            .map((topic: Topic, i: number) => (
              <TopicListRow
                key={topic.topic || `topic-${i}`}
                topic={topic}
                index={i}
                onPress={() => handleTopicPress(topic.topic)}
              />
            ))
        )}
      </View>

      {/* People You May Know */}
      {user && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>People You May Know</Text>
          {peopleLoading ? (
            <ActivityIndicator style={styles.sectionLoader} color={colors.primary} />
          ) : people.length === 0 ? (
            <Text style={[styles.sectionEmpty, { color: colors.textSecondary }]}>
              No suggestions right now. Interact with posts to get recommendations!
            </Text>
          ) : (
            people.map((person: any) => (
              <PersonRow
                key={person.id || `person-${Math.random()}`}
                person={person}
                isFollowing={followingIds.has(person.id)}
                onPress={() => handlePersonPress(person.id)}
                onFollowToggle={() => handleFollowToggle(person.id)}
              />
            ))
          )}
        </View>
      )}

      {/* New Members */}
      {user && newMembers.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>New Members</Text>
          {newMembersLoading ? (
            <ActivityIndicator style={styles.sectionLoader} color={colors.primary} />
          ) : (
            newMembers.map((person: any) => (
              <PersonRow
                key={person.id || `new-${Math.random()}`}
                person={person}
                showFollowButton={false}
                subtitle={joinedText(person.createdAt)}
                onPress={() => handlePersonPress(person.id)}
              />
            ))
          )}
        </View>
      )}

      <Text style={[styles.sectionTitle, styles.trendingTitle, { color: colors.text }]}>
        🔥 Trending Posts
      </Text>
    </View>
  );

  const renderSearchHeader = () => (
    <View style={styles.tabsRow}>
      {SEARCH_TABS.map((tab) => (
        <TouchableOpacity
          key={tab.id}
          style={[
            styles.tab,
            { backgroundColor: searchType === tab.id ? colors.primary : (isDark ? '#374151' : '#f3f4f6') },
            searchType === tab.id && styles.tabActive,
          ]}
          onPress={() => setSearchType(tab.id)}
        >
          <Text style={[
            styles.tabText,
            { color: searchType === tab.id ? 'white' : (isDark ? '#9ca3af' : '#6b7280') },
            searchType === tab.id && styles.tabTextActive,
          ]}>
            {safeString(tab.label)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderSearchItem = ({ item }: { item: any }) => (
    <View style={styles.searchItemWrapper} key={`search-${item.id || Math.random()}`}>
      <SearchResultItem
        result={item}
        isFollowing={item._type === 'user' ? followingIds.has(item.id) : false}
        onPersonPress={handlePersonPress}
        onFollowToggle={handleFollowToggle}
      />
    </View>
  );

  const renderSearchFooter = () => {
    if (isFetchingMoreSearch) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>Loading more...</Text>
        </View>
      );
    }
    // Show a "Load More" button as fallback if there are more results but not fetching
    if (hasMoreSearch && !isFetchingMoreSearch && searchResults.length > 0) {
      return (
        <TouchableOpacity style={[styles.loadMoreButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={handleLoadMoreSearch}>
          <Text style={[styles.loadMoreText, { color: colors.primary }]}>Load More</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  const renderTrendingFooter = () => {
    if (!isFetchingMoreTrending) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          Loading more...
        </Text>
      </View>
    );
  };

  const renderEmptyTrending = () => {
    if (trendingLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Feather name="trending-up" size={48} color={colors.textMuted} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No trending posts</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          Check back later for trending content!
        </Text>
      </View>
    );
  };

  // ── Main render ──

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { 
        backgroundColor: colors.surface, 
        borderBottomColor: colors.border 
      }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Explore</Text>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { 
        backgroundColor: colors.surface, 
        borderColor: colors.border 
      }]}>
        <Feather name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search for posts, people, or tags..."
          placeholderTextColor={colors.placeholder || '#9ca3af'}
          value={searchInput}
          onChangeText={setSearchInput}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onSubmitEditing={() => runSearch(searchInput)}
          returnKeyType="search"
          autoCapitalize="none"
          clearButtonMode="never"
        />
        {searchInput.length > 0 && (
          <TouchableOpacity onPress={() => setSearchInput('')} style={styles.clearButton}>
            <Feather name="x" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Search history dropdown */}
      {showHistory && history.length > 0 && (
        <View style={[styles.historyContainer, { 
          backgroundColor: colors.surface, 
          borderColor: colors.border 
        }]}>
          <View style={styles.historyHeader}>
            <Text style={[styles.historyTitle, { color: colors.textSecondary }]}>Recent searches</Text>
            <TouchableOpacity onPress={() => clearHistory.mutate()}>
              <Text style={[styles.historyClear, { color: colors.primary }]}>Clear all</Text>
            </TouchableOpacity>
          </View>
          {history.map((entry: any) => (
            <View key={entry.id ?? entry.query} style={styles.historyRow}>
              <TouchableOpacity style={styles.historyQueryButton} onPress={() => runSearch(entry.query)}>
                <Feather name="clock" size={14} color={colors.textMuted} />
                <Text style={[styles.historyQueryText, { color: colors.text }]} numberOfLines={1}>
                  {safeString(entry.query)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteHistoryEntry.mutate(entry.id)}>
                <Feather name="x" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Main content */}
      {!showHistory && isSearching ? (
        searchLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(item: any, index: number) => `${item._type}-${item.id ?? index}`}
            renderItem={renderSearchItem}
            ListHeaderComponent={renderSearchHeader}
            ListFooterComponent={renderSearchFooter}
            onEndReached={handleLoadMoreSearch}
            onEndReachedThreshold={0.5}
            contentContainerStyle={[
              searchResults.length === 0 ? { flex: 1 } : { paddingBottom: 20 },
            ]}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
          />
        )
      ) : !showHistory ? (
        <AnimatedFlatList
          ref={flatListRef}
          data={trendingPosts}
          keyExtractor={(item: any) => item._key || item.id || Math.random().toString()}
          renderItem={renderTrendingItem}
          ListHeaderComponent={renderExploreHeader}
          ListFooterComponent={renderTrendingFooter}
          ListEmptyComponent={renderEmptyTrending}
          refreshControl={
            <RefreshControl
              refreshing={trendingLoading}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          onEndReached={handleLoadMoreTrending}
          onEndReachedThreshold={0.5}
          contentContainerStyle={[
            styles.feedContent,
            { paddingBottom: contentBottomPadding + 80 },
            trendingPosts.length === 0 && { flex: 1 }
          ]}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          updateCellsBatchingPeriod={50}
          windowSize={7}
        />
      ) : null}

      {/* FAB */}
      {!isSearching && user && (
        <TouchableOpacity 
          style={[styles.fab, { backgroundColor: colors.primary }]} 
          onPress={handleCreatePost}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={24} color="white" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  clearButton: {
    padding: 4,
  },
  historyContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 4,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  historyClear: {
    fontSize: 13,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  historyQueryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  historyQueryText: {
    fontSize: 14,
    marginLeft: 8,
    flexShrink: 1,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tabActive: {
    backgroundColor: '#6C63FF',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    color: 'white',
  },
  searchItemWrapper: {
    paddingHorizontal: 16,
  },
  section: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  trendingTitle: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionLoader: {
    marginVertical: 12,
  },
  sectionEmpty: {
    fontSize: 13,
    paddingVertical: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  loadMoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 16,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
  feedContent: {
    paddingTop: 8,
  },
  rankContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 4,
  },
  rankBadge: {
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  rankText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreText: {
    fontSize: 12,
    fontWeight: '500',
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
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
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