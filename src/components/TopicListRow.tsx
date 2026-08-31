// src/components/TopicListRow.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Topic } from '../hooks/useExplore';

interface TopicListRowProps {
  topic: Topic;
  index: number;
  onPress?: () => void;
}

export default function TopicListRow({ topic, index, onPress }: TopicListRowProps) {
  const count =
    topic.post_count >= 1000 ? `${(topic.post_count / 1000).toFixed(1)}k` : String(topic.post_count);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.rank}>{index + 1}</Text>
      <Text style={styles.topic} numberOfLines={1}>
        #{topic.topic}
      </Text>
      <Text style={styles.count}>{count} posts</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rank: {
    width: 24,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: '#9ca3af',
    marginRight: 12,
  },
  topic: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1f2937',
  },
  count: {
    fontSize: 12,
    color: '#6b7280',
  },
});