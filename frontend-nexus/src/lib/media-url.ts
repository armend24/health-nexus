import { API_BASE_URL } from '@/lib/api-client';

function getMediaBaseUrl(): string {
  return API_BASE_URL.replace(/\/api\/?$/i, '/');
}

export function resolveMediaUrl(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  if (
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    /^https?:\/\//i.test(value) ||
    value.startsWith('//')
  ) {
    return value;
  }

  try {
    return new URL(value, getMediaBaseUrl()).toString();
  } catch {
    return value;
  }
}
