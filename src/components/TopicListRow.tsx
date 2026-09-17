// src/components/TopicListRow.tsx
import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import type { Topic } from '../hooks/useExplore';

interface TopicListRowProps {
  topic: Topic;
  index: number;
  onPress?: () => void;
}

export default function TopicListRow({ topic, index, onPress }: TopicListRowProps) {
  const { colors } = useTheme();

  const count =
    topic.post_count >= 1000 ? `${(topic.post_count / 1000).toFixed(1)}k` : String(topic.post_count);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.rank, { color: colors.textMuted }]}>{index + 1}</Text>
      <Text style={[styles.topic, { color: colors.text }]} numberOfLines={1}>
        #{topic.topic}
      </Text>
      <Text style={[styles.count, { color: colors.textSecondary }]}>{count} posts</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rank: {
    width: 24,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    marginRight: 12,
  },
  topic: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  count: {
    fontSize: 12,
  },
});