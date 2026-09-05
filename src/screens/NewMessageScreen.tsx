import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import api from '../api/client';
import { resolveMediaUrl } from '../lib/media';

interface SearchUser {
  id: string | number;
  name?: string;
  username?: string;
  avatar?: string | null;
  picture?: string | null;
}

const SEARCH_DEBOUNCE_MS = 350;

export default function NewMessageScreen() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [openingId, setOpeningId] = useState<string | number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // ── Debounced search-as-you-type ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const thisRequestId = ++requestIdRef.current;
      setSearching(true);
      try {
        // GET /users?search=&limit= — see userController.searchUsers
        const response = await api.get('/users', {
          params: { search: trimmed, limit: 20 },
        });

        // Ignore stale responses if a newer search has since started
        if (thisRequestId !== requestIdRef.current) return;

        const body = response.data?.data ?? response.data ?? [];
        const users = Array.isArray(body) ? body : [];
        setResults(users);
      } catch (error) {
        console.warn('User search error:', error);
        if (thisRequestId === requestIdRef.current) setResults([]);
      } finally {
        if (thisRequestId === requestIdRef.current) {
          setSearching(false);
          setHasSearched(true);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ── Open or create a conversation with the tapped user ──
  const handleSelectUser = useCallback(async (selectedUser: SearchUser) => {
    if (openingId != null) return; // already opening one
    setOpeningId(selectedUser.id);

    try {
      const response = await api.post('/dm/conversations', {
        recipientId: selectedUser.id,
      });

      // dmController.openConversation returns the conversation via
      // sendOk — shape of dmModel.getOrCreateConversation isn't known
      // here, so pull the id defensively and use the user we already
      // have (from search results) for name/avatar rather than trust
      // unverified fields on the conversation object.
      const body = response.data?.data ?? response.data ?? {};
      const conversationId = body.id ?? body.conversationId ?? body.conversation?.id ?? null;

      if (!conversationId) {
        Alert.alert('Error', 'Could not start the conversation. Please try again.');
        return;
      }

      (navigation.navigate as any)('ChatDetail', {
        conversationId: String(conversationId),
        otherUserId: String(selectedUser.id),
        otherName: selectedUser.name || selectedUser.username || 'User',
        otherPicture: resolveMediaUrl(selectedUser.avatar || selectedUser.picture || null),
      });
    } catch (error) {
      console.warn('openConversation error:', error);
      Alert.alert('Error', 'Could not start the conversation. Please try again.');
    } finally {
      setOpeningId(null);
    }
  }, [navigation, openingId]);

  const renderUser = ({ item }: { item: SearchUser }) => {
    const isOpening = openingId === item.id;
    return (
      <TouchableOpacity
        style={styles.userRow}
        onPress={() => handleSelectUser(item)}
        disabled={openingId != null}
        activeOpacity={0.7}
      >
        <Avatar
          source={resolveMediaUrl(item.avatar || item.picture || null)}
          size={44}
          fallback={item.name || item.username || 'User'}
        />
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
            {item.name || item.username || 'User'}
          </Text>
          {!!item.username && (
            <Text style={[styles.userHandle, { color: colors.textSecondary }]} numberOfLines={1}>
              @{item.username}
            </Text>
          )}
        </View>
        {isOpening && <ActivityIndicator size="small" color={colors.primary} />}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => {
    if (searching) return null;

    if (!hasSearched) {
      return (
        <View style={styles.emptyState}>
          <Feather name="search" size={40} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Find people to message</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Search by name or username.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Feather name="user-x" size={40} color={colors.textMuted} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No users found</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          Try a different name or username.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* ─── Header ─── */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>New Message</Text>
        <View style={styles.headerRight} />
      </View>

      {/* ─── Search Input ─── */}
      <View style={[styles.searchBar, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
        <Feather name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by name or username"
          placeholderTextColor={colors.placeholder || '#9ca3af'}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        {searching && <ActivityIndicator size="small" color={colors.textMuted} />}
        {!!query && !searching && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ─── Results ─── */}
      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderUser}
        contentContainerStyle={results.length === 0 ? styles.emptyContainer : styles.resultsContainer}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={renderEmptyState}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginRight: 32, // balance the back button so title stays centered
  },
  headerRight: {
    width: 32,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  resultsContainer: {
    paddingVertical: 4,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
  },
  userHandle: {
    fontSize: 13,
    marginTop: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 64,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
});