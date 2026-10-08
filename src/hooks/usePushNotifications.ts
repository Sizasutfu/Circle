import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

// ── Foreground behaviour ─────────────────────────────────
// Show the banner + play sound + update the badge, even when the
// app is in the foreground. Without this, foreground pushes are
// silently dropped by the OS.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications(onNotificationTap?: (data: any) => void) {
  const { user } = useAuth();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const tokenRef = useRef<string | null>(null);

  // ── Register token whenever the user is logged in ──
  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    (async () => {
      try {
        if (!Device.isDevice) {
          console.log('[Push] Skipping — not a physical device');
          return;
        }

        // Android channel must exist before requesting a token
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#6C63FF',
            sound: 'default',
          });
        }

        const { status: existing } = await Notifications.getPermissionsAsync();
        let status = existing;
        if (existing !== 'granted') {
          const req = await Notifications.requestPermissionsAsync();
          status = req.status;
        }
        if (status !== 'granted') {
          console.log('[Push] Permission denied');
          return;
        }

        const projectId =
          Constants?.expoConfig?.extra?.eas?.projectId ??
          (Constants as any)?.easConfig?.projectId;
        if (!projectId) {
          console.warn('[Push] Missing projectId in app.json');
          return;
        }

        const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
        const token = tokenResp.data;
        if (cancelled) return;
        tokenRef.current = token;

        await api.post('/push/token', {
          token,
          platform: Platform.OS,
          deviceName: Device.modelName || null,
        });
        console.log('[Push] Token registered');
      } catch (err: any) {
        console.warn('[Push] Registration error:', err?.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // ── Foreground: fires when a push is RECEIVED while app is open ──
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[Push] Received in foreground:', notification.request.content);
        // The OS banner is already shown by setNotificationHandler.
        // If you want extra in-app handling, do it here.
      }
    );

    return () => {
      notificationListener.current?.remove();
    };
  }, []);

  // ── Tap: fires when the user taps a push (foreground or background) ──
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data || {};
        console.log('[Push] Tapped:', data);
        onNotificationTap?.(data);
      }
    );

    return () => {
      responseListener.current?.remove();
    };
  }, [onNotificationTap]);

  // ── Logout: unregister token ──
  useEffect(() => {
    if (user?.id) return;
    const token = tokenRef.current;
    if (!token) return;
    api.delete('/push/token', { data: { token } }).catch(() => {});
    tokenRef.current = null;
  }, [user?.id]);
}