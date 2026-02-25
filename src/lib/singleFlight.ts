type SingleFlightOptions = {
  reuseResultForMs?: number;
};

type InFlightEntry = {
  promise: Promise<unknown>;
  reuseResultForMs: number;
};

type CachedEntry = {
  value: unknown;
  expiresAt: number;
};

const inFlightRequests = new Map<string, InFlightEntry>();
const cachedResults = new Map<string, CachedEntry>();

const now = () => Date.now();

const getCachedResult = <T>(key: string) => {
  const cached = cachedResults.get(key);
  if (!cached) return null;

  if (cached.expiresAt <= now()) {
    cachedResults.delete(key);
    return null;
  }

  return cached.value as T;
};

export const runSingleFlight = async <T>(
  key: string,
  request: () => PromiseLike<T>,
  options: SingleFlightOptions = {}
): Promise<T> => {
  const reuseResultForMs = Math.max(0, options.reuseResultForMs ?? 0);

  if (reuseResultForMs > 0) {
    const cached = getCachedResult<T>(key);
    if (cached !== null) return cached;
  }

  const existing = inFlightRequests.get(key);
  if (existing) {
    existing.reuseResultForMs = Math.max(
      existing.reuseResultForMs,
      reuseResultForMs
    );
    return existing.promise as Promise<T>;
  }

  const currentPromise = Promise.resolve().then(request) as Promise<T>;
  const currentEntry: InFlightEntry = {
    promise: currentPromise,
    reuseResultForMs
  };

  inFlightRequests.set(key, currentEntry);

  try {
    const result = await currentPromise;
    const latestEntry = inFlightRequests.get(key);
    if (
      latestEntry === currentEntry &&
      latestEntry.reuseResultForMs > 0 &&
      Number.isFinite(latestEntry.reuseResultForMs)
    ) {
      cachedResults.set(key, {
        value: result,
        expiresAt: now() + latestEntry.reuseResultForMs
      });
    }
    return result;
  } finally {
    if (inFlightRequests.get(key) === currentEntry)
      inFlightRequests.delete(key);
  }
};

export const clearSingleFlight = (key?: string) => {
  if (!key) {
    inFlightRequests.clear();
    cachedResults.clear();
    return;
  }

  inFlightRequests.delete(key);
  cachedResults.delete(key);
};
