import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  StatusBar,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

interface AppHeaderProps {
  title?: string;
  showBack?: boolean;
  rightActions?: {
    icon: keyof typeof Feather.glyphMap;
    onPress: () => void;
    badge?: number;
  }[];
  onBackPress?: () => void;
  transparent?: boolean;
  elevated?: boolean;
}

export default function AppHeader({
  title = 'Circle',
  showBack = false,
  rightActions = [],
  onBackPress,
  transparent = false,
  elevated = true,
}: AppHeaderProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // ── Animation for premium feel ──
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.96)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      navigation.goBack();
    }
  };

  // ── Dynamic header styles ──
  const headerStyles = [
    styles.container,
    {
      paddingTop: Platform.OS === 'ios' ? insets.top : StatusBar.currentHeight || 12,
      paddingBottom: Platform.OS === 'ios' ? 12 : 12,
      backgroundColor: transparent
        ? 'transparent'
        : isDark
        ? 'rgba(18, 18, 18, 0.85)'
        : 'rgba(255, 255, 255, 0.82)',
      borderBottomWidth: transparent ? 0 : 1,
      borderBottomColor: transparent
        ? 'transparent'
        : isDark
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(0,0,0,0.04)',
    },
    elevated && !transparent && {
      shadowColor: isDark ? 'rgba(0,0,0,0.4)' : '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: 12,
      elevation: isDark ? 4 : 2,
    },
  ];

  // ── Title styles ──
  const titleStyles = [
    styles.title,
    {
      color: transparent ? colors.text : colors.text,
    },
  ];

  // ── Logo styles ──
  const logoStyles = [
    styles.logo,
    {
      color: transparent ? colors.primary : colors.primary,
    },
  ];

  // ── Back button styles ──
  const backButtonStyles = [
    styles.backButton,
    {
      backgroundColor: transparent
        ? 'rgba(255,255,255,0.1)'
        : isDark
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(0,0,0,0.03)',
    },
  ];

  return (
    <Animated.View
      style={[
        headerStyles,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <View style={styles.innerContainer}>
        {/* ─── Left Section ─── */}
        <View style={styles.leftSection}>
          {showBack ? (
            <TouchableOpacity
              onPress={handleBack}
              style={backButtonStyles}
              activeOpacity={0.6}
            >
              <Feather
                name="chevron-left"
                size={24}
                color={transparent ? colors.text : colors.text}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.logoContainer}>
              <Text style={logoStyles}>{title}</Text>
            </View>
          )}
        </View>

        {/* ─── Center Section ─── */}
        <View style={styles.centerSection}>
          {showBack && title && (
            <Text style={titleStyles} numberOfLines={1}>
              {title}
            </Text>
          )}
        </View>

        {/* ─── Right Section ─── */}
        <View style={styles.rightSection}>
          {rightActions.map((action, index) => (
            <TouchableOpacity
              key={index}
              onPress={action.onPress}
              style={styles.actionButton}
              activeOpacity={0.6}
            >
              <Feather
                name={action.icon}
                size={20}
                color={transparent ? colors.text : colors.textSecondary || '#666'}
              />
              {action.badge !== undefined && action.badge > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.primary || '#6C63FF' }]}>
                  <Text style={styles.badgeText}>
                    {action.badge > 99 ? '99+' : action.badge}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 100,
    // iOS blur effect - using shadow instead of backdropFilter
    ...Platform.select({
      ios: {
        // Remove backdropFilter and use shadow + background color with opacity
      },
    }),
  },
  innerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 44,
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
    borderRadius: 20,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSection: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  rightSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
    position: 'relative',
    borderRadius: 20,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
});