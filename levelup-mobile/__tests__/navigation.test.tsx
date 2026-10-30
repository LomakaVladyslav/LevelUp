import { fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import TabLayout from '../app/(tabs)/_layout';
import { useSettingsStore } from '../stores/settings.store';

const mockScreens: Record<string, { title?: string; href?: null }> = {};
jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) };
  const Tabs = ({ children, screenOptions, backBehavior }: any) => <View testID={backBehavior}>
    {screenOptions({ route: { name: 'index' } }).headerRight()}
    {screenOptions({ route: { name: 'profile' } }).headerLeft()}
    {children}
  </View>;
  Tabs.Screen = ({ name, options }: any) => { mockScreens[name] = options; return null; };
  return { Tabs, useRouter: () => router };
});
beforeEach(() => { useSettingsStore.setState({ language: 'en', themeMode: 'light' }); });
test('only Today, Tasks and Progress are primary tabs, while legacy routes remain registered', async () => {
  await render(<TabLayout />);
  expect(Object.entries(mockScreens).filter(([, options]) => options.href !== null).map(([name, options]) => [name, options.title])).toEqual([
    ['index', 'Today'], ['activities', 'Tasks'], ['stats', 'Progress'],
  ]);
  for (const name of ['profile', 'settings', 'activity-history', 'achievements', 'ai']) expect(mockScreens[name].href).toBeNull();
  expect(screen.getByTestId('history')).toBeTruthy();
});
test('profile button opens the secondary route; cold entry Back falls back to Today', async () => {
  await render(<TabLayout />);
  await fireEvent.press(screen.getByRole('button', { name: 'Profile' }));
  expect(useRouter().push).toHaveBeenCalledWith('/(tabs)/profile');
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(useRouter().replace).toHaveBeenCalledWith('/(tabs)');
  jest.mocked(useRouter().canGoBack).mockReturnValue(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(useRouter().back).toHaveBeenCalled();
});
