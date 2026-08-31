import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, View } from 'react-native';

// ----- Screens -----
import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import FeedScreen from '../screens/FeedScreen';
import ExploreScreen from '../screens/ExploreScreen';
import MessagesScreen from '../screens/MessagesScreen';
import ChatDetailScreen from '../screens/ChatDetailScreen';
import CreatePostScreen from '../screens/CreatePostScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import BlockedUsersScreen from '../screens/BlockedUsersScreen';
import PostDetailScreen from '../screens/PostDetailScreen';
import EditPostScreen from '../screens/EditPostScreen';

// ----- Components -----
import AppHeader from '../components/AppHeader';

// ----- Shared layout -----
import { TAB_BAR_CONTENT_HEIGHT } from '../constants/layout';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// ============================================================
//  Bottom Tab Navigator with Dark Mode
// ============================================================
function MainTabs() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const bottomInset = Math.max(insets.bottom, 0);
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + bottomInset;

  return (
    <Tab.Navigator
      initialRouteName="Feed"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Feather.glyphMap = 'home';
          if (route.name === 'Feed') iconName = focused ? 'home' : 'home';
          else if (route.name === 'Explore') iconName = focused ? 'search' : 'search';
          else if (route.name === 'Messages') iconName = focused ? 'message-circle' : 'message-circle';
          else if (route.name === 'Profile') iconName = focused ? 'user' : 'user';
          else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings';
          return <Feather name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? bottomInset : 8,
          backgroundColor: colors.tabBar,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          shadowColor: isDark ? 'transparent' : '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: isDark ? 0 : 0.05,
          shadowRadius: 4,
          elevation: isDark ? 0 : 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          paddingBottom: Platform.OS === 'ios' ? 0 : 4,
        },
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// ============================================================
//  Auth Stack (Login, SignUp, ForgotPassword)
// ============================================================
function AuthStack() {
  const { colors } = useTheme();
  
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

// ============================================================
//  Main Stack (Tabs + Modals + Stack Screens)
// ============================================================
function MainStack() {
  const { colors, isDark } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={({ navigation, route }) => {
        // ── Screens that should hide the AppHeader ──
        const hideHeader =
          route.name === 'Tabs' ||
          route.name === 'CreatePostModal' ||
          route.name === 'EditPost' ||
          route.name === 'Settings' ||
          route.name === 'Profile' ||
          route.name === 'EditProfile' ||
          route.name === 'ChangePassword' ||
          route.name === 'BlockedUsers' ||
          route.name === 'Notifications' ||
          route.name === 'Explore' ||
          route.name === 'Messages' ||
          route.name === 'ChatDetail' ||
          route.name === 'PostDetail';

        return {
          headerShown: !hideHeader,
          header: ({ navigation: nav, route: r, options }) => {
            const title = options.title || r.name;
            const showBack = nav.canGoBack();

            let rightActions: {
              icon: keyof typeof Feather.glyphMap;
              onPress: () => void;
              badge?: number;
            }[] = [];

            if (r.name === 'Profile') {
              rightActions = [
                { icon: 'settings' as const, onPress: () => (nav.navigate as any)('Settings') },
              ];
            } else if (r.name === 'Feed') {
              rightActions = [
                { 
                  icon: 'bell' as const, 
                  onPress: () => (nav.navigate as any)('Notifications'),
                  badge: 0 
                },
              ];
            } else if (r.name === 'EditProfile') {
              rightActions = [];
            } else if (r.name === 'ChangePassword') {
              rightActions = [];
            } else if (r.name === 'BlockedUsers') {
              rightActions = [];
            } else if (r.name === 'Notifications') {
              rightActions = [
                { icon: 'check-circle' as const, onPress: () => console.log('Mark all as read') },
              ];
            } else if (r.name === 'Explore') {
              rightActions = [
                { icon: 'sliders' as const, onPress: () => console.log('Filter') },
              ];
            } else if (r.name === 'Messages') {
              rightActions = [
                { icon: 'edit-2' as const, onPress: () => (nav.navigate as any)('NewMessage') },
              ];
            } else if (r.name === 'ChatDetail') {
              rightActions = [
                { icon: 'phone' as const, onPress: () => console.log('Call') },
                { icon: 'video' as const, onPress: () => console.log('Video call') },
              ];
            }

            const displayTitle = r.name === 'Feed' ? 'Circle' : title;

            return (
              <AppHeader
                title={displayTitle}
                showBack={showBack}
                rightActions={rightActions}
                onBackPress={() => nav.goBack()}
              />
            );
          },
          cardStyle: { backgroundColor: colors.background },
        };
      }}
    >
      {/* ─── Tabs ─── */}
      <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />

      {/* ─── Stack Screens ─── */}
      <Stack.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ChatDetail"
        component={ChatDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Explore"
        component={ExploreScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BlockedUsers"
        component={BlockedUsersScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PostDetail"
        component={PostDetailScreen}
        options={{ 
          headerShown: false,
          presentation: 'modal',
          cardStyle: { backgroundColor: colors.background },
        }}
      />

      {/* ─── Modal Screens ─── */}
      <Stack.Screen
        name="CreatePostModal"
        component={CreatePostScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
          cardOverlayEnabled: true,
          cardStyle: { backgroundColor: colors.background },
          ...TransitionPresets.ModalSlideFromBottomIOS,
        }}
      />
      <Stack.Screen
        name="EditPost"
        component={EditPostScreen}
        options={{ 
          title: 'Edit Post', 
          presentation: 'modal',
          cardStyle: { backgroundColor: colors.background },
        }}
      />

      <Stack.Screen
        name="NewMessage"
        component={MessagesScreen}
        options={{ 
          title: 'New Message',
          cardStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack.Navigator>
  );
}

// ============================================================
//  Root Navigator with Dark Mode & Welcome Screen
// ============================================================
export default function AppNavigator() {
  const { user, isLoading } = useAuth();
  const { colors, isDark } = useTheme();
  const [showWelcome, setShowWelcome] = useState<boolean | null>(null);

  // ── Check if user has seen welcome screen ──
  useEffect(() => {
    const checkWelcome = async () => {
      try {
        const hasSeen = await AsyncStorage.getItem('hasSeenWelcome');
        setShowWelcome(!hasSeen);
      } catch (error) {
        setShowWelcome(true);
      }
    };
    checkWelcome();
  }, []);

  // ── Mark welcome as seen ──
  const handleWelcomeComplete = async () => {
    await AsyncStorage.setItem('hasSeenWelcome', 'true');
    setShowWelcome(false);
  };

  if (isLoading || showWelcome === null) {
    return null;
  }

  // ── Create custom theme for NavigationContainer ──
  const customTheme = {
    dark: isDark,
    colors: {
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      notification: colors.primary,
    },
    fonts: {
      regular: {
        fontFamily: 'System',
        fontWeight: '400' as const,
      },
      medium: {
        fontFamily: 'System',
        fontWeight: '500' as const,
      },
      bold: {
        fontFamily: 'System',
        fontWeight: '700' as const,
      },
      heavy: {
        fontFamily: 'System',
        fontWeight: '800' as const,
      },
    },
  };

  return (
    <NavigationContainer theme={customTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: colors.background },
        }}
      >
        {/* ─── Welcome Screen ─── */}
        {showWelcome && (
          <Stack.Screen
            name="Welcome"
            component={WelcomeScreen}
            options={{ headerShown: false }}
            listeners={{
              state: (e) => {
                // When navigation state changes, check if we left Welcome
                // The Welcome screen handles its own navigation
              },
            }}
          />
        )}

        {/* ─── Auth Screens ─── */}
        {!user ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : (
          <Stack.Screen name="Main" component={MainStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}