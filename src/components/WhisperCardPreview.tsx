import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  message: string;
  username: string;
}

const WhisperCardPreview = forwardRef<View, Props>(({ message, username }, ref) => (
  <View ref={ref} collapsable={false} style={styles.card}>
    <Text style={styles.label}>WHISPER ON CIRCLE</Text>
    <Text style={styles.message} numberOfLines={12}>"{message}"</Text>
    <Text style={styles.watermark}>@{username}</Text>
  </View>
));

export default WhisperCardPreview;

const styles = StyleSheet.create({
  card: {
    width: 1080,
    height: 1080,
    padding: 80,
    backgroundColor: '#1a1030',
    justifyContent: 'space-between',
  },
  label: {
    color: '#a78bfa',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 4,
  },
  message: {
    color: '#e2d9f3',
    fontSize: 56,
    fontStyle: 'italic',
    lineHeight: 72,
  },
  watermark: {
    color: '#a78bfa',
    fontSize: 28,
    fontWeight: '700',
    alignSelf: 'flex-end',
  },
});