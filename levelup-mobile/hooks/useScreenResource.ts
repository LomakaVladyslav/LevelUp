import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { userData } from '../services/user-data';
import { apiContext } from '../services/api-context';
import { useSettingsStore } from '../stores/settings.store';
import { useAuthStore } from '../stores/auth.store';

import { useDataRevision } from '../stores/data.store';

// One lifecycle for all read screens: keep good data on refresh failure, ignore obsolete
// requests, reload on foreground/day change, and avoid refetching on quick tab switches.
export function useScreenResource<T>(fetcher: () => Promise<T>, cacheKey?: string) {
  const language = useSettingsStore((state) => state.language);
  const userId = useAuthStore((state) => state.user?.id);
  const revision = useDataRevision((state) => state.revision);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const sequence = useRef(0);
  const loaded = useRef(false);
  const lastLoad = useRef(0);
  const confirmedRequest = useRef(0);
  const inFlight = useRef(false);
  const [data, updateData] = useState<T | null>(null);
  const dataRef = useRef<T | null>(null);
  const [cached, setCached] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const cacheScope = cacheKey ? `${cacheKey}:${language}` : undefined;
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async (force = true) => {
    if (!force && loaded.current && Date.now() - lastLoad.current < 30000) return;
    const request = ++sequence.current;
    inFlight.current = true;
    const session = apiContext.get().sessionVersion;
    setError(null);
    setLoading(!loaded.current);
    setRefreshing(loaded.current);
    try {
      const result = await fetchRef.current();
      if (request !== sequence.current || session !== apiContext.get().sessionVersion) return;
      confirmedRequest.current = request;
      dataRef.current = result;
      updateData(result);
      setCached(false);
      setSavedAt(Date.now());
      if (userId && cacheScope) void userData.saveCache(userId, cacheScope, result).catch(() => undefined);
      loaded.current = true;
      lastLoad.current = Date.now();
      return result;
    } catch (failure) {
      if (request === sequence.current && session === apiContext.get().sessionVersion) {
        setError(failure); setCached(loaded.current); lastLoad.current = 0;
      }
    } finally {
      if (request === sequence.current) { inFlight.current = false; setLoading(false); setRefreshing(false); }
    }
  }, [userId, cacheScope]);

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
      dataRef.current = null;
      updateData(null);
      setError(null);
      setCached(false);
      setSavedAt(null);
    }
    const session = apiContext.get().sessionVersion;
    let active = true;
    // Start both reads together: a slow network must not delay the disk snapshot.
    const version = sequence.current + 1;
    if ((changed || !loaded.current) && userId && cacheScope) void userData.readCache(userId, cacheScope).then(snapshot => {
      if (!active || !snapshot || confirmedRequest.current === version || snapshot.savedAt < lastLoad.current || sequence.current !== version || session !== apiContext.get().sessionVersion) return;
      dataRef.current = snapshot.data;
      updateData(snapshot.data);
      loaded.current = true;
      setCached(true);
      setSavedAt(snapshot.savedAt);
      setLoading(false);
    });
    void reload(changed);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });
    // Task zones can cross midnight before or after the device zone. Refresh the
    // focused screen while active; background execution is deliberately not assumed.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && !inFlight.current && Date.now() - lastLoad.current >= 60000) void reload();
    }, 15000);
    return () => { active = false; inFlight.current = false; ++sequence.current; subscription.remove(); clearInterval(timer); };
  }, [language, userId, revision, reload, cacheScope]));

  const setData = useCallback((update: T | ((current: T | null) => T)) => {
    if (userId !== useAuthStore.getState().user?.id) return;
    ++sequence.current;
    inFlight.current = false;
    loaded.current = true;
    setLoading(false);
    setRefreshing(false);
    const next = typeof update === 'function' ? (update as (value: T | null) => T)(dataRef.current) : update;
    dataRef.current = next;
    updateData(next);
    if (userId && cacheScope) void userData.saveCache(userId, cacheScope, next).catch(() => undefined);
  }, [userId, cacheScope]);
  const getVersion = useCallback(() => sequence.current, []);
  const ownsData = dataOwner.current === userId;
  return { cached: ownsData && (cached || Boolean(error && data)), savedAt: ownsData ? savedAt : null, getVersion, data: ownsData ? data : null, setData, error: ownsData ? error : null, loading: ownsData ? loading : true, refreshing, reload };
}
