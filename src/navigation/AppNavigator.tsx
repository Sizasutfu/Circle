import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

// ----- Screens -----
import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import FeedScreen from '../screens/FeedScreen';
import ExploreScreen from '../screens/ExploreScreen';
import CreatePostScreen from '../screens/CreatePostScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PostDetailScreen from '../screens/PostDetailScreen';
import EditPostScreen from '../screens/EditPostScreen';
import SettingsScreen from '../screens/SettingsScreen';

// ----- Components -----
import AppHeader from '../components/AppHeader';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// ============================================================
//  Bottom Tab Navigator
// ============================================================
function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Feed"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Feather.glyphMap = 'home';
          if (route.name === 'Feed') iconName = focused ? 'home' : 'home';
          else if (route.name === 'Explore') iconName = focused ? 'search' : 'search';
          else if (route.name === 'Create') iconName = focused ? 'plus-square' : 'plus-square';
          else if (route.name === 'Notifications') iconName = focused ? 'bell' : 'bell';
          else if (route.name === 'Profile') iconName = focused ? 'user' : 'user';
          return <Feather name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#6C63FF',
        tabBarInactiveTintColor: '#6b7280',
        tabBarStyle: {
          paddingBottom: 5,
          height: 60,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen
        name="Create"
        component={CreatePostScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <Feather
              name="plus-square"
              size={28}
              color={focused ? '#6C63FF' : '#6b7280'}
            />
          ),
          tabBarLabel: 'Create',
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            (navigation.navigate as any)('CreatePostModal');
          },
        })}
      />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// ============================================================
//  Auth Stack (Login, SignUp, ForgotPassword)
// ============================================================
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

// ============================================================
//  Main Stack (Tabs + Modals + Settings)
// ============================================================
function MainStack() {
  return (
    <Stack.Navigator
      screenOptions={({ navigation, route }) => {
        const hideHeader =
          route.name === 'Tabs' ||
          route.name === 'CreatePostModal' ||
          route.name === 'EditPost' ||
          route.name === 'Settings' ||
          route.name === 'Profile' ||
          route.name === 'Notifications';

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
                { icon: 'search' as const, onPress: () => (nav.navigate as any)('Explore') },
                { icon: 'bell' as const, onPress: () => (nav.navigate as any)('Notifications'), badge: 0 },
              ];
            } else if (r.name === 'Explore') {
              rightActions = [
                { icon: 'sliders' as const, onPress: () => console.log('Filter') },
              ];
            } else if (r.name === 'Notifications') {
              rightActions = [
                { icon: 'check-circle' as const, onPress: () => console.log('Mark all as read') },
              ];
            } else if (r.name === 'PostDetail') {
              rightActions = [
                { icon: 'share-2' as const, onPress: () => console.log('Share post') },
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
        };
      }}
    >
      {/* ─── Tabs ─── */}
      <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />

      {/* ─── Modal Screens ─── */}
      <Stack.Screen
        name="CreatePostModal"
        component={CreatePostScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
          cardOverlayEnabled: true,
          ...TransitionPresets.ModalSlideFromBottomIOS,
        }}
      />

      {/* ─── Stack Screens ─── */}
      <Stack.Screen
        name="PostDetail"
        component={PostDetailScreen}
        options={{ title: 'Post', presentation: 'modal' }}
      />
      <Stack.Screen
        name="EditPost"
        component={EditPostScreen}
        options={{ title: 'Edit Post', presentation: 'modal' }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// ============================================================
//  Root Navigator – Conditionally switch between Auth and Main
// ============================================================
export default function AppNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainStack} />
        ) : (
          <Stack.Screen name="Auth" component={AuthStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}