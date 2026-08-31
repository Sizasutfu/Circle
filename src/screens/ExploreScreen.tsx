import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
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
} from '../hooks/useExplore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_SIZE = SCREEN_WIDTH / COLUMN_COUNT;

const SEARCH_TABS: { id: 'all' | SearchResultType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'post', label: 'Posts' },
  { id: 'user', label: 'People' },
  { id: 'group', label: 'Groups' },
];

function joinedText(createdAt: string | null): string {
  if (!createdAt) return 'New member';
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days <= 0) return 'Joined today';
  if (days === 1) return 'Joined yesterday';
  return `Joined ${days} days ago`;
}

export default function ExploreScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

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
  const { data: trendingPosts = [], isLoading: trendingLoading } = useTrendingPosts();
  const { data: people = [], isLoading: peopleLoading } = useRecommendedPeople(user?.id);
  const { data: newMembers = [], isLoading: newMembersLoading } = useNewMembers();

  // ── Search data ──
  const {
    data: searchData,
    isLoading: searchLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useExploreSearch(trimmedQuery, searchType);
  const searchResults = useMemo(
    () => searchData?.pages.flatMap((page) => page.results) ?? [],
    [searchData]
  );

  // ── Search history ──
  const { data: history = [] } = useSearchHistory();
  const saveHistory = useSaveSearchHistory();
  const deleteHistoryEntry = useDeleteSearchHistoryEntry();
  const clearHistory = useClearSearchHistory();

  // ── Follow state ──
  const [followingIds, setFollowingIds] = useState<Set<number>>(new Set());
  const followToggle = useFollowToggle();

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

  const handlePostPress = useCallback(
    (postId: string | number) => {
      (navigation.navigate as any)('PostDetail', { postId });
    },
    [navigation]
  );

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

  const handleLoadMoreSearch = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── Default (non-search) explore content ──
  const renderExploreHeader = () => (
    <View>
      {/* Trending Topics */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Trending Topics</Text>
        {topicsLoading ? (
          <ActivityIndicator style={styles.sectionLoader} color={colors.primary} />
        ) : topics.length === 0 ? (
          <Text style={[styles.sectionEmpty, { color: colors.textSecondary }]}>
            No topics yet — start posting with #hashtags!
          </Text>
        ) : (
          topics
            .slice(0, 10)
            .map((topic, i) => (
              <TopicListRow
                key={topic.topic}
                topic={topic}
                index={i}
                onPress={() => {}}
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
            people.map((person) => (
              <PersonRow
                key={person.id}
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
            newMembers.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                showFollowButton={false}
                subtitle={joinedText(person.createdAt)}
                onPress={() => handlePersonPress(person.id)}
              />
            ))
          )}
        </View>
      )}

      <Text style={[styles.sectionTitle, styles.gridTitle, { color: colors.text }]}>Trending Posts</Text>
    </View>
  );

  const renderGridItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.gridItem, { backgroundColor: isDark ? '#374151' : '#e5e7eb' }]}
      onPress={() => handlePostPress(item.id)}
      activeOpacity={0.8}
    >
      {item.image ? (
        <Image
          source={{ uri: item.image }}
          style={styles.gridImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={item.image}
        />
      ) : (
        <View style={[styles.gridImage, styles.gridTextFallback, { backgroundColor: isDark ? '#374151' : '#ede9fe' }]}>
          <Text style={[styles.gridTextFallbackText, { color: isDark ? '#a78bfa' : '#4c1d95' }]} numberOfLines={4}>
            {item.text}
          </Text>
        </View>
      )}
      {item.video && (
        <View style={styles.videoOverlay}>
          <Feather name="play-circle" size={28} color="white" />
        </View>
      )}
    </TouchableOpacity>
  );

  const renderSearchItem = ({ item }: { item: any }) => (
    <View style={styles.searchItemWrapper}>
      <SearchResultItem
        result={item}
        isFollowing={item._type === 'user' ? followingIds.has(item.id) : false}
        onPersonPress={handlePersonPress}
        onFollowToggle={handleFollowToggle}
      />
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
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

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
          placeholderTextColor={colors.placeholder}
          value={searchInput}
          onChangeText={setSearchInput}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onSubmitEditing={() => runSearch(searchInput)}
          returnKeyType="search"
          autoCapitalize="none"
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
                  {entry.query}
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
          <ActivityIndicator style={styles.mainLoader} size="large" color={colors.primary} />
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(item, index) => `${item._type}-${item.id ?? index}`}
            renderItem={renderSearchItem}
            ListHeaderComponent={renderSearchHeader}
            onEndReached={handleLoadMoreSearch}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isFetchingNextPage ? (
                <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Feather name="search" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No results found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  Try searching for different keywords or usernames.
                </Text>
              </View>
            }
            contentContainerStyle={searchResults.length === 0 ? { flex: 1 } : undefined}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : !showHistory ? (
        <FlatList
          data={trendingPosts}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderGridItem}
          numColumns={COLUMN_COUNT}
          ListHeaderComponent={renderExploreHeader}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.gridContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            trendingLoading ? (
              <ActivityIndicator style={styles.mainLoader} color={colors.primary} />
            ) : (
              <Text style={[styles.sectionEmpty, { color: colors.textSecondary }]}>No trending posts yet.</Text>
            )
          }
        />
      ) : null}
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  gridTitle: {
    paddingHorizontal: 16,
  },
  sectionLoader: {
    marginVertical: 12,
  },
  sectionEmpty: {
    fontSize: 13,
    paddingVertical: 8,
  },
  mainLoader: {
    marginTop: 40,
  },
  footerLoader: {
    paddingVertical: 16,
  },
  gridContainer: {
    paddingHorizontal: 2,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    padding: 1,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridTextFallback: {
    padding: 8,
    justifyContent: 'center',
  },
  gridTextFallbackText: {
    fontSize: 11,
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
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