type SingleFlightOptions = {
  reuseResultForMs?: number;
};

const inFlightRequests = new Map<string, Promise<unknown>>();

export const runSingleFlight = async <T>(
  key: string,
  request: () => PromiseLike<T>,
  _options: SingleFlightOptions = {}
): Promise<T> => {
  const existing = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  // Coalesces only concurrent requests with the same key. No response cache.
  const currentPromise = Promise.resolve().then(request) as Promise<T>;

  inFlightRequests.set(key, currentPromise);

  try {
    return await currentPromise;
  } finally {
    if (inFlightRequests.get(key) === currentPromise)
      inFlightRequests.delete(key);
  }
};

export const clearSingleFlight = (key?: string) => {
  if (!key) {
    inFlightRequests.clear();
    return;
  }

  inFlightRequests.delete(key);
};
