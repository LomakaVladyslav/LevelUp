import { Platform, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { ComponentProps } from 'react';
import { useT } from '../../hooks/useT';
import { useTheme } from '../../hooks/useTheme';

type TabRouteName =
  | 'index'
  | 'activities'
  | 'activity-history'
  | 'ai'
  | 'achievements'
  | 'stats'
  | 'profile'
  | 'settings';

function getTabIconName(
  routeName: TabRouteName,
  focused: boolean,
): ComponentProps<typeof Ionicons>['name'] {
  switch (routeName) {
    case 'index':
      return focused ? 'home' : 'home-outline';
    case 'activities':
      return focused ? 'checkbox' : 'checkbox-outline';
    case 'activity-history':
      return focused ? 'list' : 'list-outline';
    case 'ai':
      return focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
    case 'achievements':
      return focused ? 'ribbon' : 'ribbon-outline';
    case 'stats':
      return focused ? 'stats-chart' : 'stats-chart-outline';
    case 'profile':
      return focused ? 'person' : 'person-outline';
    case 'settings':
      return focused ? 'settings' : 'settings-outline';
  }
}

export default function TabLayout() {
  const t = useT();
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Tabs
      backBehavior="history"
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        headerLeft: ['activity-history', 'achievements', 'settings', 'ai'].includes(route.name) ? () => (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : undefined,
        tabBarHideOnKeyboard: true,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        // The native navigation bar has fixed height; body text scales freely.
        headerTitle: ({ children, tintColor }) => (
          <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.5}
            style={{ color: tintColor, fontSize: Platform.OS === 'ios' ? 17 : 20, fontWeight: '700' }}>
            {children}
          </Text>
        ),
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            color={color}
            size={size}
            name={getTabIconName(route.name as TabRouteName, focused)}
          />
        ),
      })}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarLabel: t('tabs.home'), tabBarAccessibilityLabel: t('tabs.home') }}
      />
      <Tabs.Screen
        name="activities"
        options={{ title: t('tabs.log'), tabBarLabel: t('tabs.log'), tabBarAccessibilityLabel: t('tabs.log') }}
      />
      <Tabs.Screen
        name="activity-history"
        options={{ title: t('tabs.activityHistory'), href: null }}
      />
      <Tabs.Screen
        name="ai"
        options={{ title: t('tabs.ai'), href: null }}
      />
      <Tabs.Screen
        name="achievements"
        options={{ title: t('tabs.achievements'), href: null }}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: t('tabs.stats'), tabBarLabel: t('tabs.stats'), tabBarAccessibilityLabel: t('tabs.stats') }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarLabel: t('tabs.profile'),
          tabBarAccessibilityLabel: t('tabs.profile'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('tabs.settings'), href: null }}
      />
    </Tabs>
  );
}
