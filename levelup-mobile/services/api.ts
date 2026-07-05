import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isLanguage } from "../constants/i18n";

export const DEFAULT_API_BASE_URL = "http://192.168.28.61:3000/api";
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

  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  return withoutTrailingSlash.endsWith("/api")
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/api`;
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
    response: error.response?.data ?? null,
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

// Automatically attach the JWT token to every request
api.interceptors.request.use(async (config) => {
  const [token, language] = await Promise.all([
    AsyncStorage.getItem("token"),
    AsyncStorage.getItem("language"),
  ]);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers["Accept-Language"] = isLanguage(language) ? language : "en";
  return config;
});

// Handle 401 errors globally (token expired)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    logApiError(error);

    if (error.response?.status === 401) {
      await AsyncStorage.removeItem("token");
      // The app will detect the missing token and redirect to login
    }
    return Promise.reject(error);
  },
);

export default api;
