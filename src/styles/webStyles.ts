import { StyleSheet, Platform, Dimensions } from 'react-native';

const isWeb = Platform.OS === 'web';
const { width } = Dimensions.get('window');
const MAX_WIDTH = 600;

export const webContainerStyle = isWeb
  ? {
      maxWidth: MAX_WIDTH,
      alignSelf: 'center',
      width: '100%',
      minHeight: '100%',
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderLeftColor: 'rgba(0,0,0,0.08)',
      borderRightColor: 'rgba(0,0,0,0.08)',
    }
  : {};