import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiContext } from '../services/api-context';
import { useSettingsStore } from '../stores/settings.store';
import { useAuthStore } from '../stores/auth.store';

import { useDataRevision } from '../stores/data.store';

// One lifecycle for all read screens: keep good data on refresh failure, ignore obsolete
// requests, reload on foreground/day change, and avoid refetching on quick tab switches.
export function useScreenResource<T>(fetcher: () => Promise<T>) {
  const language = useSettingsStore((state) => state.language);
  const userId = useAuthStore((state) => state.user?.id);
  const revision = useDataRevision((state) => state.revision);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const sequence = useRef(0);
  const loaded = useRef(false);
  const lastLoad = useRef(0);
  const [data, updateData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async (force = true) => {
    if (!force && loaded.current && Date.now() - lastLoad.current < 30000) return;
    const request = ++sequence.current;
    const session = apiContext.get().sessionVersion;
    setError(null);
    setLoading(!loaded.current);
    setRefreshing(loaded.current);
    try {
      const result = await fetchRef.current();
      if (request !== sequence.current || session !== apiContext.get().sessionVersion) return;
      updateData(result);
      loaded.current = true;
      lastLoad.current = Date.now();
      return result;
    } catch (failure) {
      if (request === sequence.current && session === apiContext.get().sessionVersion) setError(failure);
    } finally {
      if (request === sequence.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  const dataOwner = useRef(userId);
  const previousScope = useRef('');
  useFocusEffect(useCallback(() => {
    const scope = `${userId}:${language}:${revision}`;
    const changed = previousScope.current !== scope;
    previousScope.current = scope;
    if (dataOwner.current !== userId) {
      dataOwner.current = userId;
      loaded.current = false;
      lastLoad.current = 0;
      updateData(null);
      setError(null);
    }
    void reload(changed);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });
    // Refresh date-based completion state across local midnight while the screen stays open.
    let day = new Date().toDateString();
    const timer = setInterval(() => {
      const next = new Date().toDateString();
      if (day !== next) { day = next; void reload(); }
    }, 30000);
    return () => { ++sequence.current; subscription.remove(); clearInterval(timer); };
  }, [language, userId, revision, reload]));

  const setData = useCallback((update: T | ((current: T | null) => T)) => {
    ++sequence.current;
    loaded.current = true;
    setLoading(false);
    setRefreshing(false);
    updateData(update);
  }, []);
  const getVersion = useCallback(() => sequence.current, []);
  const ownsData = dataOwner.current === userId;
  return { getVersion, data: ownsData ? data : null, setData, error: ownsData ? error : null, loading: ownsData ? loading : true, refreshing, reload };
}
