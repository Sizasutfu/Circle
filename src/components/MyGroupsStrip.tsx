import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useGroups } from '../contexts/GroupsContext';

export default function MyGroupsStrip() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { myGroups } = useGroups();

  if (!myGroups || myGroups.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.textSecondary }]}>YOUR GROUPS</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {myGroups.map((g) => (
          <TouchableOpacity
            key={g.id}
            onPress={() => (navigation.navigate as any)('GroupDetail', { groupId: g.id })}
            style={[
              styles.pill,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            activeOpacity={0.8}
          >
            <View style={styles.avatar}>
              {g.coverImage ? (
                <Image
                  source={{ uri: g.coverImage }}
                  style={styles.avatarImg}
                  contentFit="cover"
                />
              ) : null}
            </View>
            <Text
              style={[styles.pillText, { color: colors.text }]}
              numberOfLines={1}
            >
              {g.displayName || `#${g.topic}`}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 20,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  row: {
    paddingHorizontal: 16,
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1a1a24',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    maxWidth: 140,
  },
});