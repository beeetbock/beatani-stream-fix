/**
 * BeatAni Multi-API Load Balancer
 * Distributes API requests across multiple API instances evenly.
 * Each API handles a specific category of work to prevent overloading.
 */

export type ApiEndpoint = {
  id: string;
  url: string;
  label: string;
  enabled: boolean;
  addedAt: string;
  health?: 'healthy' | 'degraded' | 'down';
  lastChecked?: string;
  latencyMs?: number;
};

export type ApiCategory = 'anime' | 'manga' | 'search' | 'video' | 'meta' | 'general';

const STORAGE_KEY = 'beatani_api_endpoints';
const DEFAULT_API = 'https://beat-anime-api-backup.onrender.com';
const STALE_API_HOSTS = [
  'beat-anime-api-3.onrender.com',
  'api.tatakai.me',
  'core.tatakai.me',
];

// Round-robin cursors per category
const categoryCursors: Record<ApiCategory, number> = {
  anime: 0,
  manga: 0,
  search: 0,
  video: 0,
  meta: 0,
  general: 0,
};

function loadEndpoints(): ApiEndpoint[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ApiEndpoint[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = parsed.filter((e) => !STALE_API_HOSTS.some((h) => e.url.includes(h)));
        if (cleaned.length > 0) return cleaned;
      }
    }
  } catch {
    // ignore parse errors
  }
  return [
    {
      id: 'default',
      url: DEFAULT_API,
      label: 'BeatAni API (Primary)',
      enabled: true,
      addedAt: new Date().toISOString(),
      health: 'healthy',
    },
  ];
}

function saveEndpoints(endpoints: ApiEndpoint[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(endpoints));
  } catch {
    // ignore storage errors
  }
}

export function getApiEndpoints(): ApiEndpoint[] {
  return loadEndpoints();
}

export function addApiEndpoint(url: string, label?: string): ApiEndpoint {
  const endpoints = loadEndpoints();
  const clean = url.trim().replace(/\/$/, '');
  if (endpoints.find((e) => e.url === clean)) {
    throw new Error('This API URL is already registered.');
  }
  const newEndpoint: ApiEndpoint = {
    id: `api_${Date.now()}`,
    url: clean,
    label: label || `API Instance ${endpoints.length + 1}`,
    enabled: true,
    addedAt: new Date().toISOString(),
    health: 'healthy',
  };
  endpoints.push(newEndpoint);
  saveEndpoints(endpoints);
  return newEndpoint;
}

export function removeApiEndpoint(id: string) {
  const endpoints = loadEndpoints().filter((e) => e.id !== id);
  if (endpoints.length === 0) {
    // Always keep at least the default
    saveEndpoints([
      {
        id: 'default',
        url: DEFAULT_API,
        label: 'BeatAni API (Primary)',
        enabled: true,
        addedAt: new Date().toISOString(),
        health: 'healthy',
      },
    ]);
  } else {
    saveEndpoints(endpoints);
  }
}

export function toggleApiEndpoint(id: string, enabled: boolean) {
  const endpoints = loadEndpoints().map((e) =>
    e.id === id ? { ...e, enabled } : e
  );
  saveEndpoints(endpoints);
}

export function updateApiEndpointHealth(
  id: string,
  health: ApiEndpoint['health'],
  latencyMs?: number
) {
  const endpoints = loadEndpoints().map((e) =>
    e.id === id
      ? { ...e, health, latencyMs, lastChecked: new Date().toISOString() }
      : e
  );
  saveEndpoints(endpoints);
}

/**
 * Get the next API URL for a given category using round-robin.
 * If only one API is configured, it handles everything.
 * With multiple APIs, each category rotates independently.
 */
export function getApiUrlForCategory(category: ApiCategory): string {
  const endpoints = loadEndpoints().filter((e) => e.enabled);
  if (endpoints.length === 0) return DEFAULT_API;
  if (endpoints.length === 1) return endpoints[0].url;

  const cursor = categoryCursors[category];
  const selected = endpoints[cursor % endpoints.length];
  categoryCursors[category] = (cursor + 1) % endpoints.length;
  return selected.url;
}

/**
 * Smart assignment: with N APIs, assign categories so load is divided.
 * anime/meta → api[0], manga → api[1 % n], search → api[2 % n], video → api[3 % n]
 * This means each API handles a primary type first, overflow goes round-robin.
 */
export function getAssignedApiUrlForCategory(category: ApiCategory): string {
  const endpoints = loadEndpoints().filter((e) => e.enabled);
  if (endpoints.length === 0) return DEFAULT_API;
  if (endpoints.length === 1) return endpoints[0].url;

  const categoryOrder: ApiCategory[] = ['anime', 'meta', 'manga', 'search', 'video', 'general'];
  const idx = categoryOrder.indexOf(category);
  const assignedIndex = idx >= 0 ? idx % endpoints.length : 0;
  return endpoints[assignedIndex].url;
}

/** Health check a single endpoint */
export async function checkEndpointHealth(
  endpoint: ApiEndpoint
): Promise<{ health: ApiEndpoint['health']; latencyMs: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${endpoint.url}/api/v2/hianime/home`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    if (res.ok) return { health: 'healthy', latencyMs };
    if (res.status >= 500) return { health: 'down', latencyMs };
    return { health: 'degraded', latencyMs };
  } catch {
    return { health: 'down', latencyMs: Date.now() - start };
  }
}

/** Check all endpoints and update health in storage */
export async function checkAllEndpointsHealth(): Promise<void> {
  const endpoints = loadEndpoints();
  await Promise.all(
    endpoints.map(async (ep) => {
      const { health, latencyMs } = await checkEndpointHealth(ep);
      updateApiEndpointHealth(ep.id, health, latencyMs);
    })
  );
}
