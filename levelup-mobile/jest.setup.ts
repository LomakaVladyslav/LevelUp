jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 64 }));
import * as SecureStore from 'expo-secure-store';
import { apiContext } from './services/api-context';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AccessibilityInfo } from "react-native";
import type React from "react";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-router", () => {
  const router = { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), setParams: jest.fn() };
  return ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, props, children);
  },
  Redirect: () => null,
  Stack: {
    Screen: () => null,
  },
  Tabs: {
    Screen: () => null,
  },
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
  useRouter: () => router,
  useLocalSearchParams: jest.fn(() => ({})),
});
});

jest.mock("expo-notifications", () => ({
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { DEFAULT: "default", NONE: 0 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  getNotificationChannelAsync: jest.fn(async () => null),
  cancelScheduledNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  dismissAllNotificationsAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: "daily", DATE: "date", CALENDAR: "calendar" },
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "notification-id"),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn(async (uri: string) => ({ uri, width: 512, height: 512 })),
}));

jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: { Images: "Images" },
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: true,
    assets: [],
  })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  const Icon = ({ name }: { name?: string }) =>
    React.createElement(Text, null, name ?? "icon");

  return {
    Ionicons: Icon,
  };
});

jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  return {
    ...Reanimated,
    clamp,
    default: {
      ...Reanimated.default,
      clamp,
    },
  };
});

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    deleteItemAsync: jest.fn(async (key: string) => { values.delete(key); }),
  };
});
jest.mock('expo-crypto', () => {
  const crypto = require('node:crypto');
  return {
    randomUUID: () => crypto.randomUUID(),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_algorithm: string, value: string) => crypto.createHash('sha256').update(value).digest('hex'),
  };
});

beforeEach(async () => {
  jest.clearAllMocks();
  (AccessibilityInfo as any).isReduceMotionEnabled = jest.fn(async () => false);
  (AccessibilityInfo as any).addEventListener = jest.fn(() => ({
    remove: jest.fn(),
  }));
  await AsyncStorage.clear();
  await SecureStore.deleteItemAsync("levelup.session.token");
  await SecureStore.deleteItemAsync("levelup.session");
  apiContext.setToken(null);
  apiContext.setLanguage("en");
});
