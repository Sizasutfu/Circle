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
import { useNavigation } from '@react-navigation/native';
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
  const navigation = useNavigation();
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
    props.navigation.closeDrawer();
    navigation.navigate(route as never);
  };

  const handleLogout = async () => {
    props.navigation.closeDrawer();
    await logout();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ─── Logo - Small, left aligned ─── */}
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../assets/icon.png')} 
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        {/* ─── Menu Items ─── */}
        <View style={styles.menuSection}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.route}
              style={styles.menuItem}
              onPress={() => handleNavigate(item.route)}
              activeOpacity={0.7}
            >
              <Feather 
                name={item.icon} 
                size={24} 
                color={colors.text} 
                style={styles.menuIcon}
              />
              <Text style={[styles.menuLabel, { color: colors.text }]}>
                {item.label}
              </Text>
              {item.badge && item.badge > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Post Button ─── */}
        <TouchableOpacity 
          style={[styles.postButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            props.navigation.closeDrawer();
            navigation.navigate('CreatePostModal' as never);
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
    justifyContent: 'flex-start', // Left aligned
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
    fontWeight: '500',
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