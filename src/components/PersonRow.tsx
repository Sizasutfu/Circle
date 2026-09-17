// src/components/PersonRow.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from './Avatar';
import VerificationBadge from './VerificationBadge';
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
  const { colors, isDark } = useTheme();

  const followButtonBg = isFollowing
    ? (isDark ? '#374151' : '#f3f4f6')
    : colors.primary;

  const followButtonTextColor = isFollowing
    ? colors.text
    : 'white';

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <Avatar source={person.avatar} size={44} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {person.name}
          </Text>
          {person.verified && (
            <VerificationBadge
              size={14}
              color={colors.primary}
              style={styles.verifiedBadge}
            />
          )}
        </View>
        <Text style={[styles.username, { color: colors.textSecondary }]} numberOfLines={1}>
          @{person.username || 'user'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
          {subtitle ?? `${person.postCount} posts · ${person.followerCount} followers`}
        </Text>
      </View>
      {showFollowButton && onFollowToggle && (
        <TouchableOpacity
          style={[styles.followButton, { backgroundColor: followButtonBg }]}
          onPress={(e) => {
            e.stopPropagation();
            onFollowToggle();
          }}
        >
          <Text style={[styles.followButtonText, { color: followButtonTextColor }]}>
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
    flexShrink: 1,
  },
  verifiedBadge: {
    marginLeft: 4,
  },
  username: {
    fontSize: 13,
    marginTop: 1,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
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
});