import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
  StyleSheet,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from '../components/Avatar';

// ===== COMPONENT =====
export default function SettingsScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();

  // ── State for toggles ──
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [privateAccount, setPrivateAccount] = useState(false);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);

  // ── Logout handler ──
  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' as never }],
            });
          },
        },
      ]
    );
  };

  // ── Open link ──
  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open link.');
    });
  };

  // ── Section header ──
  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  // ── Menu item with icon ──
  const MenuItem = ({
    icon,
    title,
    subtitle,
    onPress,
    showArrow = true,
    rightElement,
  }: {
    icon: keyof typeof Feather.glyphMap;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    showArrow?: boolean;
    rightElement?: React.ReactNode;
  }) => (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <View style={styles.menuItemLeft}>
        <View style={styles.menuIconContainer}>
          <Feather name={icon} size={20} color="#6C63FF" />
        </View>
        <View style={styles.menuItemText}>
          <Text style={styles.menuItemTitle}>{title}</Text>
          {subtitle && <Text style={styles.menuItemSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      <View style={styles.menuItemRight}>
        {rightElement}
        {showArrow && onPress && (
          <Feather name="chevron-right" size={20} color="#9ca3af" />
        )}
      </View>
    </TouchableOpacity>
  );

  // ── Toggle menu item ──
  const ToggleItem = ({
    icon,
    title,
    value,
    onValueChange,
  }: {
    icon: keyof typeof Feather.glyphMap;
    title: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
  }) => (
    <View style={styles.menuItem}>
      <View style={styles.menuItemLeft}>
        <View style={styles.menuIconContainer}>
          <Feather name={icon} size={20} color="#6C63FF" />
        </View>
        <Text style={styles.menuItemTitle}>{title}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#d1d5db', true: '#6C63FF' }}
        thumbColor="white"
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ─── Header ─── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ─── Profile Section ─── */}
        <TouchableOpacity
          style={styles.profileSection}
          onPress={() => (navigation.navigate as any)('Profile')}
          activeOpacity={0.7}
        >
          <Avatar source={user?.avatar} size={56} fallback={user?.name || 'U'} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name || 'User'}</Text>
            <Text style={styles.profileUsername}>@{user?.username || 'username'}</Text>
          </View>
          <Feather name="chevron-right" size={20} color="#9ca3af" />
        </TouchableOpacity>

        {/* ─── Account Settings ─── */}
        <SectionHeader title="Account" />
        <View style={styles.section}>
          <MenuItem
            icon="user"
            title="Edit Profile"
            onPress={() => (navigation.navigate as any)('EditProfile')}
          />
          <MenuItem
            icon="lock"
            title="Change Password"
            onPress={() => (navigation.navigate as any)('ChangePassword')}
          />
          <MenuItem
            icon="mail"
            title="Email"
            subtitle={user?.email || 'Not set'}
            showArrow={false}
          />
        </View>

        {/* ─── Privacy ─── */}
        <SectionHeader title="Privacy" />
        <View style={styles.section}>
          <ToggleItem
            icon="eye"
            title="Private Account"
            value={privateAccount}
            onValueChange={setPrivateAccount}
          />
          <ToggleItem
            icon="user-check"
            title="Show Online Status"
            value={showOnlineStatus}
            onValueChange={setShowOnlineStatus}
          />
          <MenuItem
            icon="shield"
            title="Blocked Users"
            onPress={() => console.log('Blocked users')}
          />
          <MenuItem
            icon="download"
            title="Download Your Data"
            onPress={() => Alert.alert('Download', 'Your data export will be prepared.')}
          />
        </View>

        {/* ─── Notifications ─── */}
        <SectionHeader title="Notifications" />
        <View style={styles.section}>
          <ToggleItem
            icon="bell"
            title="Push Notifications"
            value={pushNotifications}
            onValueChange={setPushNotifications}
          />
          <ToggleItem
            icon="mail"
            title="Email Notifications"
            value={emailNotifications}
            onValueChange={setEmailNotifications}
          />
        </View>

        {/* ─── Appearance ─── */}
        <SectionHeader title="Appearance" />
        <View style={styles.section}>
          <ToggleItem
            icon="moon"
            title="Dark Mode"
            value={darkMode}
            onValueChange={setDarkMode}
          />
        </View>

        {/* ─── Support ─── */}
        <SectionHeader title="Support" />
        <View style={styles.section}>
          <MenuItem
            icon="help-circle"
            title="Help Center"
            onPress={() => openLink('https://circle.com/help')}
          />
          <MenuItem
            icon="message-circle"
            title="Contact Support"
            onPress={() => openLink('mailto:support@circle.com')}
          />
          <MenuItem
            icon="file-text"
            title="Terms of Service"
            onPress={() => openLink('https://circle.com/terms')}
          />
          <MenuItem
            icon="shield"
            title="Privacy Policy"
            onPress={() => openLink('https://circle.com/privacy')}
          />
          <MenuItem
            icon="info"
            title="About Circle"
            onPress={() => Alert.alert('About Circle', 'Circle v1.0.0\nConnect with your community.')}
          />
        </View>

        {/* ─── Logout ─── */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Feather name="log-out" size={20} color="#ef4444" />
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>

        {/* ─── Version ─── */}
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  headerRight: {
    width: 40,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  // ── Profile Section ──
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  profileUsername: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  // ── Section ──
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  section: {
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
  },
  // ── Menu Item ──
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f0f4ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuItemText: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 15,
    color: '#1f2937',
  },
  menuItemSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 1,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // ── Logout Button ──
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    paddingVertical: 14,
    marginTop: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    gap: 8,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
  // ── Version ──
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 16,
  },
});