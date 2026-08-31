import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import api from '../api/client';
import { useTabBarHeight } from '../hooks/useTabBarHeight';

interface BlockedUser {
  id: string;
  name: string;
  username: string;
  avatar?: string | null;
  blockedAt: string;
}

export default function BlockedUsersScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { colors, isDark } = useTheme();
  const { contentBottomPadding } = useTabBarHeight();
  const [refreshing, setRefreshing] = useState(false);

  // ── Fetch blocked users ──
  const {
    data: blockedUsers = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['blocked-users'],
    queryFn: async () => {
      const response = await api.get('/users/blocked');
      const data = response.data.data || response.data || [];
      return data as BlockedUser[];
    },
  });

  // ── Unblock user mutation ──
  const unblockMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/users/blocked/${userId}`);
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
      const user = blockedUsers.find((u) => u.id === userId);
      Alert.alert('Unblocked', `${user?.name || 'User'} has been unblocked.`);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.message || 'Failed to unblock user.');
    },
  });

  // ── Pull to refresh ──
  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // ── Confirm unblock ──
  const confirmUnblock = (user: BlockedUser) => {
    Alert.alert(
      'Unblock User',
      `Are you sure you want to unblock @${user.username}? They will be able to follow you and see your posts again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: () => unblockMutation.mutate(user.id),
        },
      ]
    );
  };

  // ── Render blocked user item ──
  const renderBlockedUser = ({ item }: { item: BlockedUser }) => (
    <View style={[
      styles.userItem, 
      { 
        backgroundColor: colors.surface, 
        borderBottomColor: colors.border 
      }
    ]}>
      <TouchableOpacity
        style={styles.userInfo}
        onPress={() => (navigation.navigate as any)('Profile', { userId: item.id })}
      >
        <Avatar source={item.avatar} size={48} fallback={item.name} />
        <View style={styles.userDetails}>
          <Text style={[styles.userName, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.userUsername, { color: colors.textSecondary }]}>@{item.username}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.unblockButton, { borderColor: '#ef4444' }]}
        onPress={() => confirmUnblock(item)}
        disabled={unblockMutation.isPending}
      >
        {unblockMutation.isPending && unblockMutation.variables === item.id ? (
          <ActivityIndicator size="small" color="#ef4444" />
        ) : (
          <Text style={styles.unblockButtonText}>Unblock</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // ── Empty state ──
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Feather name="user-x" size={64} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No blocked users</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        When you block someone, they'll appear here.
      </Text>
    </View>
  );

  // ── Loading state ──
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // ── Error state ──
  if (isError) {
    return (
      <SafeAreaView style={[styles.errorContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <Feather name="alert-circle" size={48} color="#ef4444" />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Failed to load blocked users</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={handleRefresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* ─── Header ─── */}
      <View style={[styles.header, { 
        backgroundColor: colors.surface, 
        borderBottomColor: colors.border 
      }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Blocked Users</Text>
        <View style={styles.headerRight} />
      </View>

      {/* ─── Count ─── */}
      {blockedUsers.length > 0 && (
        <View style={[styles.countContainer, { 
          backgroundColor: colors.surface, 
          borderBottomColor: colors.border 
        }]}>
          <Text style={[styles.countText, { color: colors.textSecondary }]}>
            {blockedUsers.length} {blockedUsers.length === 1 ? 'user' : 'users'} blocked
          </Text>
        </View>
      )}

      {/* ─── List ─── */}
      <FlatList
        data={blockedUsers}
        keyExtractor={(item) => item.id}
        renderItem={renderBlockedUser}
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
          blockedUsers.length === 0 && { flex: 1 },
          { paddingBottom: contentBottomPadding },
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerRight: {
    width: 40,
  },
  countContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  countText: {
    fontSize: 14,
  },
  listContent: {
    paddingTop: 8,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userDetails: {
    marginLeft: 12,
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
  },
  userUsername: {
    fontSize: 13,
  },
  unblockButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 70,
    alignItems: 'center',
  },
  unblockButtonText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 14,
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
    marginTop: 4,
  },
});