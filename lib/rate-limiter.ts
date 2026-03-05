const MAX_STORE_SIZE = 10_000;
const CLEANUP_INTERVAL_MS = 60_000;

const store = new Map<string, { count: number; resetAt: number }>();

const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.resetAt <= now) store.delete(key);
    }
}, CLEANUP_INTERVAL_MS);

if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
}

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = store.get(key);

    if (entry && entry.resetAt <= now) {
        store.delete(key);
    }

    const current = store.get(key);
    if (!current) {
        if (store.size >= MAX_STORE_SIZE) {
            const oldest = store.keys().next().value;
            if (oldest !== undefined) store.delete(oldest);
        }
        store.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }

    if (current.count >= maxRequests) return false;
    current.count++;
    return true;
}
