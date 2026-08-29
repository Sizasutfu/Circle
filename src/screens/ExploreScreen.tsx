import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_SIZE = SCREEN_WIDTH / COLUMN_COUNT;

// ===== MOCK DATA =====
const generateMockPosts = (count: number) => {
  const posts = [];
  for (let i = 0; i < count; i++) {
    const isVideo = i % 4 === 0;
    posts.push({
      id: `post-${i}`,
      image: `https://picsum.photos/seed/${i + 100}/400/400`,
      video: isVideo ? 'https://example.com/video.mp4' : undefined,
      text: `Sample post ${i}`,
      user: {
        id: `u${i}`,
        name: `User ${i}`,
        username: `user${i}`,
      },
    });
  }
  return posts;
};

const mockPosts = generateMockPosts(30);

// ===== COMPONENT =====
export default function ExploreScreen() {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Filter posts based on search query (case‑insensitive)
  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return mockPosts;
    const query = searchQuery.toLowerCase().trim();
    return mockPosts.filter(
      (post) =>
        post.text.toLowerCase().includes(query) ||
        post.user.name.toLowerCase().includes(query) ||
        post.user.username.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const handleRefresh = () => {
    setRefreshing(true);
    // Simulate API call
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  const handleSearchClear = () => setSearchQuery('');

  const renderGridItem = ({ item }: { item: any }) => {
    const hasVideo = !!item.video;

    return (
      <TouchableOpacity
        style={styles.gridItem}
        onPress={() => {
          // 👇 Fixed navigation with `as any`
          (navigation.navigate as any)('PostDetail', { postId: item.id });
        }}
        activeOpacity={0.8}
      >
        <Image source={{ uri: item.image }} style={styles.gridImage} resizeMode="cover" />
        {hasVideo && (
          <View style={styles.videoOverlay}>
            <Feather name="play-circle" size={28} color="white" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Feather name="search" size={48} color="#d1d5db" />
      <Text style={styles.emptyTitle}>No results found</Text>
      <Text style={styles.emptySubtitle}>
        Try searching for different keywords or usernames.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Explore</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Feather name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search for posts, people, or tags..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={handleSearchClear} style={styles.clearButton}>
            <Feather name="x" size={18} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* Grid */}
      <FlatList
        data={filteredPosts}
        keyExtractor={(item) => item.id}
        renderItem={renderGridItem}
        numColumns={COLUMN_COUNT}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6C63FF" />
        }
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={filteredPosts.length === 0 ? { flex: 1 } : styles.gridContainer}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={styles.columnWrapper}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'white',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
    paddingVertical: 4,
  },
  clearButton: {
    padding: 4,
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
    backgroundColor: '#e5e7eb',
  },
  gridImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#d1d5db',
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
    color: '#374151',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
  },
});