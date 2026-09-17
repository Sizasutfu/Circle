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
import { useLive } from '../contexts/LiveContext';
import { useUnreadCount } from '../hooks/useNotifications';
import { useUnreadMessages } from '../hooks/useUnreadMessages';
import { Avatar } from './Avatar';
import VerificationBadge from './VerificationBadge';

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
  const { openSetup } = useLive();

  const { data: rawNotifications } = useUnreadCount(user?.id || '');
  const { data: rawMessages } = useUnreadMessages(user?.id || '');

  const toNum = (v: any): number =>
    typeof v === 'number' ? v : Number((v as any)?.count ?? v) || 0;

  const unreadNotifications = toNum(rawNotifications);
  const unreadMessages = toNum(rawMessages);

  const menuItems: SidebarItem[] = [
    { icon: 'home', label: 'Home', route: 'Feed' },
    { icon: 'search', label: 'Explore', route: 'Explore' },
    { icon: 'bell', label: 'Notifications', route: 'Notifications', badge: unreadNotifications },
    { icon: 'message-circle', label: 'Messages', route: 'Messages', badge: unreadMessages },
    { icon: 'hash', label: 'Topics', route: 'Topics' },
    { icon: 'message-square', label: 'Whisper', route: 'WhisperInbox' },
    { icon: 'bar-chart-2', label: 'Dashboard', route: 'Dashboard' },
    { icon: 'user', label: 'Profile', route: 'MyProfile' },
    { icon: 'settings', label: 'Settings', route: 'Settings' },
  ];

  const handleNavigate = (route: string) => {
    props.navigation.closeDrawer();

    const tabScreens = ['Feed', 'Explore', 'Messages', 'Notifications', 'MyProfile'];
    if (tabScreens.includes(route)) {
      // @ts-ignore
      props.navigation.navigate('MainTabs', { screen: route });
    } else {
      // @ts-ignore
      props.navigation.navigate(route);
    }
  };

  const handleGoLive = () => {
    props.navigation.closeDrawer();
    setTimeout(() => {
      openSetup();
    }, 200);
  };

  const handleLogout = async () => {
    props.navigation.closeDrawer();
    await logout();
  };

  const currentRoute = props.state?.routes?.[props.state.index]?.name || '';

  const isVerified = !!((user as any)?.isVerified ?? (user as any)?.verified);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.menuSection}>
          {menuItems.map((item) => {
            const isActive =
              currentRoute === item.route ||
              (item.route === 'Feed' && currentRoute === 'MainTabs') ||
              (item.route === 'Feed' && currentRoute === 'Main') ||
              (item.route === 'Explore' && currentRoute === 'Explore') ||
              (item.route === 'Messages' && currentRoute === 'Messages') ||
              (item.route === 'Notifications' && currentRoute === 'Notifications') ||
              (item.route === 'MyProfile' && currentRoute === 'MyProfile') ||
              (item.route === 'Settings' && currentRoute === 'Settings') ||
              (item.route === 'WhisperInbox' && currentRoute === 'WhisperInbox') ||
              (item.route === 'Dashboard' && currentRoute === 'Dashboard');

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
                    <Text style={styles.badgeText}>
                      {item.badge > 99 ? '99+' : item.badge}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

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

        <TouchableOpacity
          style={[styles.goLiveButton, { borderColor: '#ef4444' }]}
          onPress={handleGoLive}
          activeOpacity={0.85}
        >
          <View style={styles.goLiveIconWrap}>
            <View style={styles.goLiveDot} />
            <Feather name="radio" size={16} color="#ef4444" />
          </View>
          <Text style={styles.goLiveText}>Go Live</Text>
        </TouchableOpacity>

        {user && (
          <View style={[styles.userSection, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={styles.userProfile}
              onPress={() => handleNavigate('MyProfile')}
            >
              <Avatar source={user?.avatar} size={40} />
              <View style={styles.userInfo}>
                <View style={styles.userNameRow}>
                  <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                    {user?.name || 'Guest'}
                  </Text>
                  {isVerified && (
                    <VerificationBadge
                      size={14}
                      color={colors.primary}
                      style={styles.verifiedBadge}
                    />
                  )}
                </View>
                <Text style={[styles.userHandle, { color: colors.textSecondary }]} numberOfLines={1}>
                  @{user?.username || 'user'}
                </Text>
              </View>
              <Feather name="more-horizontal" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

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
  container: { flex: 1 },
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
  logoImage: { width: 32, height: 32, borderRadius: 8 },
  menuSection: { marginTop: 8 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginVertical: 2,
  },
  menuIcon: { marginRight: 16, width: 24, textAlign: 'center' },
  menuLabel: { fontSize: 18, flex: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: 'white', fontSize: 11, fontWeight: '600' },
  postButton: {
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  postButtonText: { color: 'white', fontSize: 16, fontWeight: '700' },

  goLiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 30,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  goLiveIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goLiveDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  goLiveText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },

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
  userInfo: { flex: 1, marginLeft: 12 },
  userNameRow: { flexDirection: 'row', alignItems: 'center' },
  userName: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  verifiedBadge: { marginLeft: 4 },
  userHandle: { fontSize: 14 },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginTop: 8,
    borderRadius: 12,
  },
  logoutText: { fontSize: 16, fontWeight: '500', marginLeft: 12 },
});