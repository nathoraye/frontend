export const AI_DAILY_LIMIT = 5;

const STORAGE_KEY = 'wvs-ai-quota';
const CLIENT_TIMEOUT_MS = 50_000;

export type AiQuota = {
  remaining: number;
  limit: number;
  resetAt: number | null;
};

export class AiArtworkError extends Error {
  quota?: AiQuota;

  constructor(message: string, quota?: AiQuota) {
    super(message);
    this.name = 'AiArtworkError';
    this.quota = quota;
  }
}

function apiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
}

export function utcDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function readLocalAiQuota(now = Date.now()): AiQuota {
  const limit = AI_DAILY_LIMIT;
  if (typeof localStorage === 'undefined') {
    return { remaining: limit, limit, resetAt: null };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { remaining: limit, limit, resetAt: null };
    const parsed = JSON.parse(raw) as { day?: string; used?: number; limit?: number; resetAt?: number | null };
    if (parsed.day !== utcDayKey(now)) return { remaining: limit, limit, resetAt: null };
    const storedLimit = Number(parsed.limit) > 0 ? Number(parsed.limit) : limit;
    const used = Math.max(0, Math.min(storedLimit, Number(parsed.used) || 0));
    return {
      remaining: storedLimit - used,
      limit: storedLimit,
      resetAt: typeof parsed.resetAt === 'number' ? parsed.resetAt : null,
    };
  } catch {
    return { remaining: limit, limit, resetAt: null };
  }
}

export function writeLocalAiQuota(quota: AiQuota, now = Date.now()): void {
  if (typeof localStorage === 'undefined') return;
  const limit = quota.limit > 0 ? quota.limit : AI_DAILY_LIMIT;
  const remaining = Math.max(0, Math.min(limit, quota.remaining));
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      day: utcDayKey(now),
      used: limit - remaining,
      limit,
      resetAt: quota.resetAt,
    }),
  );
}

function quotaFrom(data: Record<string, unknown> | null): AiQuota | undefined {
  if (!data || typeof data.remaining !== 'number' || typeof data.limit !== 'number') return undefined;
  return {
    remaining: data.remaining,
    limit: data.limit,
    resetAt: typeof data.resetAt === 'number' ? data.resetAt : null,
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const data = await response.json();
    return data && typeof data === 'object' ? data as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function fetchAiQuota(): Promise<AiQuota> {
  const response = await fetch(`${apiBase()}/api/generate`);
  const data = await readJson(response);
  const quota = quotaFrom(data);
  if (!response.ok || !quota) {
    throw new AiArtworkError(
      typeof data.error === 'string' ? data.error : 'Could not check remaining generations.',
      quota,
    );
  }
  return quota;
}

export async function requestAiArtwork(prompt: string): Promise<AiQuota & { image: string }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBase()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    const data = await readJson(response);
    const quota = quotaFrom(data);
    if (!response.ok || typeof data.image !== 'string' || !data.image) {
      throw new AiArtworkError(
        typeof data.error === 'string' ? data.error : 'Artwork could not be generated. Please try again.',
        quota,
      );
    }
    return {
      image: data.image,
      remaining: quota?.remaining ?? AI_DAILY_LIMIT,
      limit: quota?.limit ?? AI_DAILY_LIMIT,
      resetAt: quota?.resetAt ?? null,
    };
  } catch (error) {
    if (error instanceof AiArtworkError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AiArtworkError('Artwork took too long to generate. Please try again.');
    }
    throw new AiArtworkError('The artwork service did not respond. Please try again.');
  } finally {
    window.clearTimeout(timer);
  }
}
