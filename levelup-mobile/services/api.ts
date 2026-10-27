import axios from "axios";
import { apiContext, getDeviceTimezone } from "./api-context";

export const DEFAULT_API_BASE_URL = "http://localhost:3000/api";
const isProduction = process.env.NODE_ENV === "production";

export const normalizeApiBaseUrl = (url?: string | null) => {
  const trimmed = url?.trim();
  if (!trimmed) {
    if (isProduction) {
      throw new Error(
        "EXPO_PUBLIC_API_BASE_URL must be set for production builds.",
      );
    }

    return DEFAULT_API_BASE_URL;
  }

  let parsed: URL;
  try { parsed = new URL(trimmed); }
  catch { throw new Error("API URL must be a valid HTTP(S) origin."); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/', '/api', '/api/'].includes(parsed.pathname)) {
    throw new Error("API URL must be an HTTP(S) origin, optionally ending in /api.");
  }
  if (isProduction && parsed.protocol !== 'https:') throw new Error("Production API URL must use HTTPS.");
  return `${parsed.origin}/api`;
};

export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL,
);
export const ASSET_BASE_URL = API_BASE_URL.replace(/\/api$/, "");

const isDevelopment = process.env.NODE_ENV !== "production";

const getRequestDisplayUrl = (baseURL?: string, url?: string) => {
  if (!url) return baseURL || API_BASE_URL;
  if (/^https?:\/\//i.test(url)) return url;

  const resolvedBaseUrl = (baseURL || API_BASE_URL).replace(/\/+$/, "");
  const resolvedPath = url.startsWith("/") ? url : `/${url}`;
  return `${resolvedBaseUrl}${resolvedPath}`;
};

const logApiError = (error: unknown) => {
  if (!isDevelopment || !axios.isAxiosError(error)) return;

  const config = error.config;
  console.warn("[api] request failed", {
    method: config?.method?.toUpperCase() ?? "GET",
    url: getRequestDisplayUrl(config?.baseURL, config?.url),
    baseURL: config?.baseURL ?? API_BASE_URL,
    status: error.response?.status ?? null,
    message: error.message,

  });
};

export const getAssetUrl = (url?: string | null) => {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${ASSET_BASE_URL}${url}`;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

// Session and language are hydrated once, before protected screens mount.
api.interceptors.request.use((config) => {
  const { token, language } = apiContext.get();
  const publicAuth = /^\/auth\/(login|register|availability|forgot-password|reset-password)$/.test(config.url ?? '');
  if (token && !publicAuth && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  config.headers['Accept-Language'] = language;
  config.headers['X-Timezone'] = getDeviceTimezone();
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    logApiError(error);
    if (error.response?.status === 401) {
      apiContext.expire(error.config?.headers?.Authorization);
    }
    return Promise.reject(error);
  },
);

export default api;
