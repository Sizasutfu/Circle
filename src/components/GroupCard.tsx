import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useGroups, Group } from '../contexts/GroupsContext';

const GRADIENT_COLORS = [
  '#16151f', '#131a1e', '#1e1518',
  '#1a1710', '#121620', '#141a18',
];

function topicColor(topic: any): string {
  const t = typeof topic === 'string' ? topic : String(topic ?? '');
  let h = 0;
  for (let i = 0; i < t.length; i++) {
    h = (h * 31 + t.charCodeAt(i)) & 0xffff;
  }
  return GRADIENT_COLORS[h % GRADIENT_COLORS.length];
}

function fmtNum(n: any): string {
  const num = Number(n) || 0;
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(num);
}

interface Props {
  group: Group;
}

export default function GroupCard({ group }: Props) {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { joinGroup, leaveGroup, myGroups, refreshKey } = useGroups();

  const [isJoining, setIsJoining] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [memberCount, setMemberCount] = useState(0);

  useEffect(() => {
    if (!group) return;
    const fromMyGroups = myGroups.some((g) => g.id === group.id);
    setIsMember(fromMyGroups || !!group.isMember);
    setMemberCount(Number(group.memberCount) || 0);
  }, [group, myGroups, refreshKey]);

  const handleJoin = async (e: any) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    if (!user || isJoining) return;

    setIsJoining(true);
    const wasMember = isMember;

    try {
      if (wasMember) {
        await leaveGroup(group.id);
        setIsMember(false);
        setMemberCount((prev) => Math.max(0, prev - 1));
      } else {
        await joinGroup(group.id);
        setIsMember(true);
        setMemberCount((prev) => prev + 1);
      }
    } catch (err) {
      console.warn('[GroupCard] toggle failed:', err);
      setIsMember(wasMember);
      setMemberCount(Number(group.memberCount) || 0);
    } finally {
      setIsJoining(false);
    }
  };

  const openDetail = () => {
    (navigation.navigate as any)('GroupDetail', { groupId: group.id });
  };

  if (!group) return null;

  const displayName = String(
    group.displayName || `#${group.topic ?? ''}`
  );
  const description = group.description ? String(group.description) : '';
  const cover = group.coverImage ? String(group.coverImage) : null;
  const postCount = Number(group.postCount) || 0;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      onPress={openDetail}
      activeOpacity={0.85}
    >
      <View style={styles.coverWrap}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={styles.coverImg}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View
            style={[
              styles.coverImg,
              { backgroundColor: topicColor(group.topic) },
            ]}
          >
            <Feather name="users" size={28} color="rgba(255,255,255,0.8)" />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text
          style={[styles.name, { color: colors.text }]}
          numberOfLines={1}
        >
          {displayName}
        </Text>

        <Text
          style={[styles.description, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {description}
        </Text>

        <View style={styles.countsRow}>
          <View style={styles.countItem}>
            <Feather name="users" size={12} color={colors.textMuted} />
            <Text style={[styles.countText, { color: colors.textMuted }]}>
              {fmtNum(memberCount)}
            </Text>
          </View>
          <View style={styles.countItem}>
            <Feather name="radio" size={12} color={colors.textMuted} />
            <Text style={[styles.countText, { color: colors.textMuted }]}>
              {fmtNum(postCount)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleJoin}
          disabled={isJoining || !user}
          style={[
            styles.joinBtn,
            isMember
              ? {
                  backgroundColor: isDark ? '#2a2a35' : '#e5e7eb',
                  borderColor: colors.border,
                  borderWidth: 1,
                }
              : { backgroundColor: colors.primary },
          ]}
          activeOpacity={0.8}
        >
          {isJoining ? (
            <ActivityIndicator
              size="small"
              color={isMember ? colors.text : '#fff'}
            />
          ) : (
            <Text
              style={[
                styles.joinText,
                { color: isMember ? colors.textSecondary : '#fff' },
              ]}
            >
              {isMember ? '✓ Joined' : 'Join'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  coverWrap: {
    height: 80,
    backgroundColor: '#000',
  },
  coverImg: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 12,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    marginTop: 2,
    minHeight: 36,
  },
  countsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  countItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countText: {
    fontSize: 11,
  },
  joinBtn: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    minWidth: 80,
  },
  joinText: {
    fontSize: 12,
    fontWeight: '600',
  },
});