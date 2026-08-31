// src/components/PersonRow.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Avatar } from './Avatar';
import type { ExplorePerson } from '../hooks/useExplore';

interface PersonRowProps {
  person: ExplorePerson;
  isFollowing?: boolean;
  onPress?: () => void;
  onFollowToggle?: () => void;
  showFollowButton?: boolean;
  subtitle?: string; // overrides the default "N posts · N followers" line
}

export default function PersonRow({
  person,
  isFollowing = false,
  onPress,
  onFollowToggle,
  showFollowButton = true,
  subtitle,
}: PersonRowProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <Avatar source={person.avatar} size={44} fallback={person.name} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {person.name}
          </Text>
          {person.verified && (
            <Feather name="check-circle" size={13} color="#6C63FF" style={styles.verifiedIcon} />
          )}
        </View>
        <Text style={styles.username} numberOfLines={1}>
          @{person.username || 'user'}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle ?? `${person.postCount} posts · ${person.followerCount} followers`}
        </Text>
      </View>
      {showFollowButton && onFollowToggle && (
        <TouchableOpacity
          style={[styles.followButton, isFollowing && styles.followButtonActive]}
          onPress={(e) => {
            e.stopPropagation();
            onFollowToggle();
          }}
        >
          <Text style={[styles.followButtonText, isFollowing && styles.followButtonTextActive]}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  info: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    flexShrink: 1,
  },
  verifiedIcon: {
    marginLeft: 4,
  },
  username: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 1,
  },
  subtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  followButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#6C63FF',
  },
  followButtonActive: {
    backgroundColor: '#f3f4f6',
  },
  followButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'white',
  },
  followButtonTextActive: {
    color: '#6b7280',
  },
});