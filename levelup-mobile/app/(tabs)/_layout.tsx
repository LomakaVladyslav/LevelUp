import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { ComponentProps } from 'react';
import { colors } from '../../constants/theme';
import { useT } from '../../hooks/useT';

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
      return focused ? 'add-circle' : 'add-circle-outline';
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

  return (
    <Tabs
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
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
        options={{ title: t('tabs.home'), tabBarLabel: t('tabs.home') }}
      />
      <Tabs.Screen
        name="activities"
        options={{ title: t('tabs.log'), tabBarLabel: t('tabs.log') }}
      />
      <Tabs.Screen
        name="activity-history"
        options={{ title: t('tabs.activityHistory'), href: null }}
      />
      <Tabs.Screen
        name="ai"
        options={{ title: t('tabs.ai'), tabBarLabel: t('tabs.ai') }}
      />
      <Tabs.Screen
        name="achievements"
        options={{ title: t('tabs.achievements'), href: null }}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: t('tabs.stats'), tabBarLabel: t('tabs.stats') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarLabel: t('tabs.profile') }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('tabs.settings'), href: null }}
      />
    </Tabs>
  );
}
