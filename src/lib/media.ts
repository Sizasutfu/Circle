// src/lib/media.ts
const API_BASE = process.env.EXPO_PUBLIC_API_URL || '';
const MEDIA_BASE = process.env.EXPO_PUBLIC_MEDIA_BASE_URL || 
                   (API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE);

/**
 * Resolve a relative or absolute media URL to a full URL
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = MEDIA_BASE || 'http://localhost:5000';
  if (url.startsWith('/')) return `${base}${url}`;
  return `${base}/${url}`;
}