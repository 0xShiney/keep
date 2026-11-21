/**
 * Single-flight, short-lived cache for read-only Forgejo lists.
 *
 * Every page load asks Forgejo for the repository sidebar (and the dashboard
 * also asks for the activity feed). Under a handful of concurrent users that
 * repeated work saturates both the app process and Forgejo. Entries are keyed
 * by identity, so one user's private repositories can never be served to
 * another; the TTL bounds staleness after a push or repository change.
 */
interface Entry {
  expires: number;
  value: Promise<unknown>;
}

/** Keep the map bounded even if callers use many distinct query keys. */
const MAX_ENTRIES = 500;

const store = new Map<string, Entry>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;

  if (store.size >= MAX_ENTRIES) {
    for (const [staleKey, entry] of store) {
      if (entry.expires <= now) store.delete(staleKey);
    }
    if (store.size >= MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
  }

  const value = load();
  const entry: Entry = { expires: now + ttlMs, value };
  store.set(key, entry);
  // A rejected request must not be cached as a failure for the whole TTL.
  value.catch(() => {
    if (store.get(key) === entry) store.delete(key);
  });
  return value;
}

/** Tests and process teardown; not used by request paths. */
export function clearCache(): void {
  store.clear();
}
