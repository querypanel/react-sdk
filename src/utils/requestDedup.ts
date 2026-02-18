const inFlightRequests = new Map<string, Promise<unknown>>();

/**
 * Deduplicate concurrent requests by key.
 * If the same request is triggered while one is still in flight, callers share the same promise.
 */
export function runDedupedRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = request().finally(() => {
    if (inFlightRequests.get(key) === promise) {
      inFlightRequests.delete(key);
    }
  });

  inFlightRequests.set(key, promise as Promise<unknown>);
  return promise;
}
