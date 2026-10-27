import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// Bound upload size and normalize HEIC/other picker formats before multipart upload.
export async function prepareAvatar(uri: string): Promise<string> {
  const image = await manipulateAsync(uri, [{ resize: { width: 512 } }], {
    compress: 0.8, format: SaveFormat.JPEG,
  });
  return image.uri;
}
