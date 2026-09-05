import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, View, StyleSheet, Dimensions } from 'react-native';

// ----- Screens -----
import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import FeedScreen from '../screens/FeedScreen';
import ExploreScreen from '../screens/ExploreScreen';
import TopicsScreen from '../screens/TopicsScreen';
import TopicDetailScreen from '../screens/TopicDetailScreen';
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
import NewMessageScreen from '../screens/NewMessageScreen';

// ----- Components -----
import SidebarContent from '../components/SidebarContent';

// ----- Shared layout -----
import { TAB_BAR_CONTENT_HEIGHT } from '../constants/layout';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();
const Drawer = createDrawerNavigator();

// ── Check if web ──
const isWeb = Platform.OS === 'web';
const { width: screenWidth } = Dimensions.get('window');
const maxContentWidth = 600;

// ============================================================
//  Bottom Tab Navigator with Dark Mode
// ============================================================
function MainTabs() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const bottomInset = Math.max(insets.bottom, 0);
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + bottomInset;

  if (isWeb) {
    return null;
  }

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
//  Web Navigator (No Bottom Tabs)
// ============================================================
function WebNavigator() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Feed" component={FeedScreen} />
      <Stack.Screen name="Explore" component={ExploreScreen} />
      <Stack.Screen name="Messages" component={MessagesScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Topics" component={TopicsScreen} />
      <Stack.Screen name="TopicDetail" component={TopicDetailScreen} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
    </Stack.Navigator>
  );
}

// ============================================================
//  Drawer Navigator
// ============================================================
function DrawerNavigator() {
  const { colors } = useTheme();

  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          width: 280,
          backgroundColor: colors.background,
        },
        drawerType: isWeb ? 'permanent' : 'slide',
        overlayColor: 'rgba(0,0,0,0.5)',
        swipeEnabled: !isWeb,
        drawerActiveTintColor: colors.primary,
        drawerInactiveTintColor: colors.textSecondary,
        drawerActiveBackgroundColor: 'transparent',
        drawerItemStyle: {
          borderRadius: 12,
          marginHorizontal: 8,
        },
      }}
      drawerContent={(props) => <SidebarContent {...props} />}
    >
      <Drawer.Screen 
        name="MainTabs" 
        component={isWeb ? WebNavigator : MainTabs}
        options={{
          drawerLabel: 'Home',
          drawerIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen 
        name="Notifications" 
        component={NotificationsScreen}
        options={{
          drawerIcon: ({ color, size }) => (
            <Feather name="bell" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen 
        name="Topics" 
        component={TopicsScreen}
        options={{
          drawerIcon: ({ color, size }) => (
            <Feather name="hash" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen 
        name="TopicDetail" 
        component={TopicDetailScreen}
        options={{
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen 
        name="PostDetail" 
        component={PostDetailScreen}
        options={{
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen 
        name="EditProfile" 
        component={EditProfileScreen}
        options={{
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen 
        name="ChangePassword" 
        component={ChangePasswordScreen}
        options={{
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen 
        name="BlockedUsers" 
        component={BlockedUsersScreen}
        options={{
          drawerItemStyle: { display: 'none' },
        }}
      />
    </Drawer.Navigator>
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
//  Main Stack (Drawer + Modals + Stack Screens)
// ============================================================
function MainStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Drawer" component={DrawerNavigator} />

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
        component={NewMessageScreen}
        options={{ 
          headerShown: false,
          cardStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="ChatDetail"
        component={ChatDetailScreen}
        options={{ 
          title: 'Chat',
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
  const [isNewUser, setIsNewUser] = useState(false);

  // ── Check if user has seen welcome screen ──
  useEffect(() => {
    const checkWelcome = async () => {
      try {
        if (user) {
          // User is logged in, check if they've seen welcome
          const hasSeen = await AsyncStorage.getItem('hasSeenWelcome');
          // If user hasn't seen welcome and is logged in, show it
          setShowWelcome(!hasSeen);
          setIsNewUser(!hasSeen);
        } else {
          setShowWelcome(false);
          setIsNewUser(false);
        }
      } catch (error) {
        console.error('Error checking welcome status:', error);
        setShowWelcome(false);
        setIsNewUser(false);
      }
    };
    checkWelcome();
  }, [user]);

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
    <View style={[styles.rootContainer, { backgroundColor: colors.background }]}>
      <NavigationContainer theme={customTheme}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            cardStyle: { backgroundColor: colors.background },
          }}
        >
          {!user ? (
            // ─── Auth Screens (Not Logged In) ───
            <Stack.Screen name="Auth" component={AuthStack} />
          ) : showWelcome ? (
            // ─── Welcome Screen (Logged in + New User) ───
            <Stack.Screen name="Welcome" options={{ headerShown: false }}>
              {() => (
                <WelcomeScreen
                  onFinish={() => {
                    setShowWelcome(false);
                    setIsNewUser(false);
                  }}
                />
              )}
            </Stack.Screen>
          ) : (
            // ─── Main Screens (Logged in + Seen Welcome) ───
            <Stack.Screen name="Main" component={MainStack} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    ...(isWeb && {
      maxWidth: maxContentWidth,
      alignSelf: 'center',
      width: '100%',
      minHeight: '100%',
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderLeftColor: 'rgba(0,0,0,0.08)',
      borderRightColor: 'rgba(0,0,0,0.08)',
    }),
  },
});