import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { isWeb, isMobile, isTablet } from '../utils/responsive';

interface ResponsiveGridProps {
  data: any[];
  renderItem: ({ item, index }: { item: any; index: number }) => React.ReactNode;
  keyExtractor?: (item: any, index: number) => string;
  columns?: number;
  gap?: number;
}

export default function ResponsiveGrid({
  data,
  renderItem,
  keyExtractor,
  columns: propColumns,
  gap = 12,
}: ResponsiveGridProps) {
  // ── Calculate columns based on screen size ──
  const columns = propColumns || (isMobile() ? 2 : isTablet() ? 3 : 4);

  return (
    <FlatList
      data={data}
      keyExtractor={keyExtractor || ((item, index) => String(index))}
      renderItem={({ item, index }) => (
        <View style={{ flex: 1 / columns, padding: gap / 2 }}>
          {renderItem({ item, index })}
        </View>
      )}
      numColumns={columns}
      contentContainerStyle={{ padding: gap / 2 }}
      showsVerticalScrollIndicator={false}
      columnWrapperStyle={isWeb ? { flexWrap: 'wrap' } : undefined}
    />
  );
}