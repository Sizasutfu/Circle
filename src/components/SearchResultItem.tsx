// src/components/SearchResultItem.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import PostCard from './PostCard';
import PersonRow from './PersonRow';
import type { SearchResult } from '../hooks/useExplore';

interface SearchResultItemProps {
  result: SearchResult;
  isFollowing?: boolean;
  onPersonPress?: (userId: number) => void;
  onFollowToggle?: (userId: number) => void;
  onGroupPress?: (groupId: number) => void;
}

// The backend's /search endpoint returns posts, users, and groups in one
// mixed array. Each _type gets routed to the component that already knows
// how to render it — PostCard for posts, PersonRow for users — rather than
// building a third, search-specific post/person renderer.
export default function SearchResultItem({
  result,
  isFollowing = false,
  onPersonPress,
  onFollowToggle,
  onGroupPress,
}: SearchResultItemProps) {
  if (result._type === 'post') {
    return <PostCard post={result as any} />;
  }

  if (result._type === 'user') {
    return (
      <PersonRow
        person={result}
        isFollowing={isFollowing}
        onPress={() => onPersonPress?.(result.id)}
        onFollowToggle={() => onFollowToggle?.(result.id)}
      />
    );
  }

  // Group result
  const group = result as any;
  return (
    <TouchableOpacity style={styles.groupRow} onPress={() => onGroupPress?.(group.id)} activeOpacity={0.7}>
      <View style={styles.groupIcon}>
        <Feather name="users" size={20} color="#6C63FF" />
      </View>
      <View style={styles.groupInfo}>
        <Text style={styles.groupName} numberOfLines={1}>
          {group.displayName || group.name || group.topic}
        </Text>
        {group.memberCount !== undefined && (
          <Text style={styles.groupMeta}>{group.memberCount} members</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupInfo: {
    flex: 1,
    marginLeft: 12,
  },
  groupName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  groupMeta: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
});