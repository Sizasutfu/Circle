import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  SafeAreaView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from './Avatar';

interface SidebarItem {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  route: string;
  badge?: number;
  iconSize?: number;
}

export default function SidebarContent(props: DrawerContentComponentProps) {
  const { user, logout } = useAuth();
  const { colors, isDark } = useTheme();

  const menuItems: SidebarItem[] = [
    { icon: 'home', label: 'Home', route: 'Feed' },
    { icon: 'search', label: 'Explore', route: 'Explore' },
    { icon: 'bell', label: 'Notifications', route: 'Notifications' },
    { icon: 'message-circle', label: 'Messages', route: 'Messages' },
    { icon: 'hash', label: 'Topics', route: 'Topics' },
    { icon: 'user', label: 'Profile', route: 'Profile' },
    { icon: 'settings', label: 'Settings', route: 'Settings' },
  ];

  const handleNavigate = (route: string) => {
    // Close the drawer
    props.navigation.closeDrawer();

    // Navigate to the screen
    // For tab screens, navigate to MainTabs with screen param
    const tabScreens = ['Feed', 'Explore', 'Messages', 'Profile', 'Settings'];
    if (tabScreens.includes(route)) {
      // @ts-ignore - Navigate to MainTabs with nested navigation
      props.navigation.navigate('MainTabs', {
        screen: route,
      });
    } else {
      // @ts-ignore - Navigate to stack screens directly
      props.navigation.navigate(route);
    }
  };

  const handleLogout = async () => {
    props.navigation.closeDrawer();
    await logout();
  };

  // Get current route name
  const currentRoute = props.state?.routes?.[props.state.index]?.name || '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ─── Logo ─── */}
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../assets/icon.png')} 
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        {/* ─── Menu Items ─── */}
        <View style={styles.menuSection}>
          {menuItems.map((item) => {
            // Check if the current route matches this item
            const isActive = currentRoute === item.route || 
              (item.route === 'Feed' && currentRoute === 'MainTabs') ||
              (item.route === 'Feed' && currentRoute === 'Main') ||
              (item.route === 'Explore' && currentRoute === 'Explore') ||
              (item.route === 'Messages' && currentRoute === 'Messages') ||
              (item.route === 'Profile' && currentRoute === 'Profile') ||
              (item.route === 'Settings' && currentRoute === 'Settings');

            return (
              <TouchableOpacity
                key={item.route}
                style={[
                  styles.menuItem,
                  isActive && { backgroundColor: isDark ? '#374151' : '#f3f4f6' },
                ]}
                onPress={() => handleNavigate(item.route)}
                activeOpacity={0.7}
              >
                <Feather 
                  name={item.icon} 
                  size={24} 
                  color={isActive ? colors.primary : colors.text} 
                  style={styles.menuIcon}
                />
                <Text style={[
                  styles.menuLabel, 
                  { 
                    color: isActive ? colors.primary : colors.text,
                    fontWeight: isActive ? '700' : '500',
                  }
                ]}>
                  {item.label}
                </Text>
                {item.badge && item.badge > 0 && (
                  <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ─── Post Button ─── */}
        <TouchableOpacity 
          style={[styles.postButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            props.navigation.closeDrawer();
            // @ts-ignore
            props.navigation.navigate('CreatePostModal');
          }}
        >
          <Text style={styles.postButtonText}>Post</Text>
        </TouchableOpacity>

        {/* ─── User Profile Section ─── */}
        {user && (
          <View style={[styles.userSection, { borderTopColor: colors.border }]}>
            <TouchableOpacity 
              style={styles.userProfile}
              onPress={() => handleNavigate('Profile')}
            >
              <Avatar
                source={user?.avatar}
                size={40}
                fallback={user?.name || 'User'}
              />
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                  {user?.name || 'Guest'}
                </Text>
                <Text style={[styles.userHandle, { color: colors.textSecondary }]} numberOfLines={1}>
                  @{user?.username || 'user'}
                </Text>
              </View>
              <Feather name="more-horizontal" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Logout Button ─── */}
        {user && (
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Feather name="log-out" size={20} color="#ef4444" />
            <Text style={[styles.logoutText, { color: '#ef4444' }]}>Logout</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
    paddingBottom: 20,
  },
  logoContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingVertical: 8,
    marginBottom: 4,
  },
  logoImage: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  menuSection: {
    marginTop: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginVertical: 2,
  },
  menuIcon: {
    marginRight: 16,
    width: 24,
    textAlign: 'center',
  },
  menuLabel: {
    fontSize: 18,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  postButton: {
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  postButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  userSection: {
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 8,
  },
  userProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
  },
  userHandle: {
    fontSize: 14,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginTop: 8,
    borderRadius: 12,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
  },
});