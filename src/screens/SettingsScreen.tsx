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
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import { useTabBarHeight } from '../hooks/useTabBarHeight';

const { width: screenWidth } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';
const maxContentWidth = 600;

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const { contentBottomPadding } = useTabBarHeight();

  // ── State for toggles ──
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
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
    <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
      {title}
    </Text>
  );

  // ── Menu item with icon ──
  const MenuItem = ({
    icon,
    title,
    subtitle,
    onPress,
    showArrow = true,
    rightElement,
    destructive = false,
  }: {
    icon: keyof typeof Feather.glyphMap;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    showArrow?: boolean;
    rightElement?: React.ReactNode;
    destructive?: boolean;
  }) => (
    <TouchableOpacity
      style={[styles.menuItem, { borderBottomColor: colors.border }]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <View style={styles.menuItemLeft}>
        <View style={[styles.menuIconContainer, { backgroundColor: isDark ? '#374151' : '#f0f4ff' }]}>
          <Feather
            name={icon}
            size={20}
            color={destructive ? '#ef4444' : colors.primary}
          />
        </View>
        <View style={styles.menuItemText}>
          <Text style={[styles.menuItemTitle, { color: destructive ? '#ef4444' : colors.text }]}>
            {title}
          </Text>
          {subtitle && <Text style={[styles.menuItemSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
        </View>
      </View>
      <View style={styles.menuItemRight}>
        {rightElement}
        {showArrow && onPress && !destructive && (
          <Feather name="chevron-right" size={20} color={colors.textMuted} />
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
    <View style={[styles.menuItem, { borderBottomColor: colors.border }]}>
      <View style={styles.menuItemLeft}>
        <View style={[styles.menuIconContainer, { backgroundColor: isDark ? '#374151' : '#f0f4ff' }]}>
          <Feather name={icon} size={20} color={colors.primary} />
        </View>
        <Text style={[styles.menuItemTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#d1d5db', true: colors.primary }}
        thumbColor="white"
      />
    </View>
  );

  return (
    <SafeAreaView 
      style={[
        styles.container,
        { backgroundColor: colors.background },
        isWeb && {
          maxWidth: maxContentWidth,
          alignSelf: 'center' as 'center',
          width: '100%',
        },
      ]} 
      edges={['top']}
    >
      {/* ─── Header ─── */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: contentBottomPadding },
        ]}
      >
        {/* ─── Profile Section ─── */}
        <TouchableOpacity
          style={[styles.profileSection, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
          onPress={() => (navigation.navigate as any)('Profile')}
          activeOpacity={0.7}
        >
          <Avatar source={user?.avatar} size={56} fallback={user?.name || 'U'} />
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.text }]}>{user?.name || 'User'}</Text>
            <Text style={[styles.profileUsername, { color: colors.textSecondary }]}>
              @{user?.username || 'username'}
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        {/* ─── Account Settings ─── */}
        <SectionHeader title="Account" />
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
            onPress={() => (navigation.navigate as any)('BlockedUsers')}
          />
          <MenuItem
            icon="download"
            title="Download Your Data"
            onPress={() => Alert.alert('Download', 'Your data export will be prepared.')}
          />
        </View>

        {/* ─── Notifications ─── */}
        <SectionHeader title="Notifications" />
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.menuItem, { borderBottomColor: colors.border }]}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIconContainer, { backgroundColor: isDark ? '#374151' : '#f0f4ff' }]}>
                <Feather name="moon" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.menuItemTitle, { color: colors.text }]}>Dark Mode</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#d1d5db', true: colors.primary }}
              thumbColor="white"
            />
          </View>
        </View>

        {/* ─── Support ─── */}
        <SectionHeader title="Support" />
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
        <MenuItem
          icon="log-out"
          title="Log Out"
          onPress={handleLogout}
          destructive={true}
          showArrow={false}
        />

        {/* ─── Version ─── */}
        <Text style={[styles.versionText, { color: colors.textMuted }]}>Version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerRight: {
    width: 40,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 12,
    borderBottomWidth: 1,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
  },
  profileUsername: {
    fontSize: 14,
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  section: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuItemText: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 15,
  },
  menuItemSubtitle: {
    fontSize: 13,
    marginTop: 1,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 16,
  },
});