import { api } from '@/lib/api';

/** Max number of chapter audio blobs to keep in memory. LRU eviction after this. */
const MAX_CACHE_SIZE = 5;

/**
 * Module-level LRU cache: chapterId (cacheKey) → blob: URL.
 * Blob URLs are valid for the whole browser session unless explicitly revoked.
 * Survives React component mount/unmount cycles.
 */
const audioCache = new Map<string, string>();

function evictOldestIfNeeded() {
  if (audioCache.size >= MAX_CACHE_SIZE) {
    // Map preserves insertion order; first entry is the oldest
    const [oldestKey, oldestUrl] = audioCache.entries().next().value as [string, string];
    URL.revokeObjectURL(oldestUrl);
    audioCache.delete(oldestKey);
    console.log('[TTS Cache] Evicted oldest entry:', oldestKey);
  }
}

export const ttsService = {
  /**
   * Synthesizes the given text and returns a blob: URL for the MP3 audio.
   *
   * If `cacheKey` is provided (e.g. the chapterId), the result is cached in
   * memory. Subsequent calls with the same key return the cached URL instantly —
   * no backend round-trip, no re-chunking.
   */
  async synthesize(
    text: string,
    language: 'en' | 'am' = 'en',
    cacheKey?: string,
  ): Promise<string> {
    // ── Cache hit ────────────────────────────────────────────────────────────
    if (cacheKey && audioCache.has(cacheKey)) {
      console.log('[TTS Cache] Hit for:', cacheKey);
      // Move to end (mark as recently used)
      const url = audioCache.get(cacheKey)!;
      audioCache.delete(cacheKey);
      audioCache.set(cacheKey, url);
      return url;
    }

    // ── Cache miss → synthesize ──────────────────────────────────────────────
    console.log('[TTS Cache] Miss for:', cacheKey ?? '(no key)');
    const response = await api.post(
      '/tts/synthesize',
      { text, language },
      {
        responseType: 'blob',
        headers: { 'Content-Type': 'application/json' },
        timeout: 120_000,
      },
    );

    const blob = new Blob([response.data], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);

    // Store in cache
    if (cacheKey) {
      evictOldestIfNeeded();
      audioCache.set(cacheKey, url);
      console.log(`[TTS Cache] Stored "${cacheKey}". Cache size: ${audioCache.size}`);
    }

    return url;
  },

  /**
   * Revokes a blob URL and removes it from the cache.
   * Pass `skipIfCached: true` when you just want to clean up the component
   * reference without actually invalidating the cached entry.
   */
  revokeUrl(url: string, options: { skipIfCached?: boolean } = {}) {
    if (!url?.startsWith('blob:')) return;

    if (options.skipIfCached) {
      // Don't revoke if the URL is still in the cache
      for (const cachedUrl of audioCache.values()) {
        if (cachedUrl === url) return;
      }
    }

    URL.revokeObjectURL(url);
  },

  /**
   * Removes a specific entry from the cache (and revokes its blob URL).
   * Call this if you explicitly want to force re-synthesis for a chapter.
   */
  clearCacheEntry(cacheKey: string) {
    const url = audioCache.get(cacheKey);
    if (url) {
      URL.revokeObjectURL(url);
      audioCache.delete(cacheKey);
      console.log('[TTS Cache] Cleared entry:', cacheKey);
    }
  },

  /** Revokes all cached blob URLs and empties the cache. */
  clearAllCache() {
    audioCache.forEach((url) => URL.revokeObjectURL(url));
    audioCache.clear();
    console.log('[TTS Cache] All entries cleared.');
  },

  /** True if audio for this chapter is already cached (instant playback). */
  isCached(cacheKey: string): boolean {
    return audioCache.has(cacheKey);
  },
};
