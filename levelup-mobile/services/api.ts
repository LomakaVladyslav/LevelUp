import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_BASE_URL = "http://192.168.28.65:3000/api";
export const ASSET_BASE_URL = API_BASE_URL.replace(/\/api$/, "");

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
  config.headers["Accept-Language"] = language === "uk" ? "uk" : "en";
  return config;
});

// Handle 401 errors globally (token expired)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem("token");
      // The app will detect the missing token and redirect to login
    }
    return Promise.reject(error);
  },
);

export default api;
