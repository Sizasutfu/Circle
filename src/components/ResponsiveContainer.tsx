import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { isWeb } from '../utils/responsive';

interface ResponsiveContainerProps extends ViewProps {
  maxWidth?: number;
  paddingHorizontal?: number;
  paddingVertical?: number;
  center?: boolean;
}

export default function ResponsiveContainer({
  children,
  style,
  maxWidth,
  paddingHorizontal = 16,
  paddingVertical = 0,
  center = true,
  ...props
}: ResponsiveContainerProps) {
  const containerStyle = StyleSheet.create({
    container: {
      width: '100%',
      paddingHorizontal: isWeb ? paddingHorizontal : 16,
      paddingVertical: isWeb ? paddingVertical : 0,
      ...(center && { alignSelf: 'center' }),
      ...(maxWidth && { maxWidth }),
    },
  });

  return (
    <View style={[containerStyle.container, style]} {...props}>
      {children}
    </View>
  );
}