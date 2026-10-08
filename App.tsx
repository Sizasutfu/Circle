import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './src/contexts/AuthContext';
import { WsProvider } from './src/contexts/WsContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { WhisperProvider } from './src/contexts/WhisperContext';
import { LiveProvider } from './src/contexts/LiveContext';
import { GroupsProvider } from './src/contexts/GroupsContext';
import AppNavigator from './src/navigation/AppNavigator';
//import { usePushNotifications } from './src/hooks/usePushNotifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  },
});

// Must be inside AuthProvider (needs useAuth) and after AppNavigator
// has mounted so navigationRef is attached.
// function PushBootstrap() {
//   usePushNotifications();
//   return null;
// }

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <WsProvider>
              <WhisperProvider>
                <LiveProvider>
                  <GroupsProvider>
                    <AppNavigator />
                    {/* <PushBootstrap /> */}
                  </GroupsProvider>
                </LiveProvider>
              </WhisperProvider>
            </WsProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}