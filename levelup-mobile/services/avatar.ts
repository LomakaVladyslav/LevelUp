import { ASSET_BASE_URL } from './api';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// Bound upload size and normalize HEIC/other picker formats before multipart upload.
export async function prepareAvatar(uri: string): Promise<string> {
  const image = await manipulateAsync(uri, [{ resize: { width: 512 } }], {
    compress: 0.8, format: SaveFormat.JPEG,
  });
  return image.uri;
}

// Never attach a bearer token to an external or arbitrary image URL.
export function privateAvatarSource(value: string | null | undefined, token: string | null) {
  if (!value || !token) return null;
  try {
    const url = new URL(value, ASSET_BASE_URL);
    if (url.origin !== ASSET_BASE_URL || url.username || url.password || url.search || url.hash ||
      !/^\/(?:api\/avatars\/[0-9a-f-]+|uploads\/avatars\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp))$/i.test(url.pathname)) return null;
    return { uri: url.href, headers: { Authorization: `Bearer ${token}` }, cache: 'reload' as const };
  } catch { return null; }
}
