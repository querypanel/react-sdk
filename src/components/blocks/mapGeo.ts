import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import type { MapTopology } from "../vizSpecMapGeometry";
import type { PlaceInput, ResolvedPlace } from "../vizSpecMapPlaces";

export interface MapGeoClient {
  fetchBoundaries: (country: string) => Promise<MapTopology>;
  resolvePlaces: (country: string, places: PlaceInput[]) => Promise<Array<ResolvedPlace | null>>;
}

/** Country outlines never change within a release; one fetch per URL for the whole page. */
const boundariesCache = new Map<string, Promise<MapTopology>>();

/** Test hook. */
export function clearMapBoundariesCache() {
  boundariesCache.clear();
}

/**
 * Geo base URL: an explicit override wins, otherwise `{apiBaseUrl}/geo` (embed: the API's
 * `/geo/*` routes, called with the same headers as run-sql) or `/api/geo` for admin.
 */
export function resolveGeoBaseUrl(geoBaseUrl: string | undefined, apiBaseUrl: string | undefined): string {
  if (geoBaseUrl) return geoBaseUrl.replace(/\/+$/, "");
  const base = (apiBaseUrl ?? "").replace(/\/+$/, "");
  return base ? `${base}/geo` : "/api/geo";
}

const MapGeoContext = createContext<string | undefined>(undefined);

/** Provides the map geo base URL to every block and panel below it (a `geoBaseUrl` prop still overrides). */
export function MapGeoProvider({ geoBaseUrl, children }: { geoBaseUrl?: string; children: ReactNode }) {
  return createElement(MapGeoContext.Provider, { value: geoBaseUrl }, children);
}

/** Memoised geo client for a block or panel; re-created only when the URLs, org or headers change. */
export function useMapGeoClient({
  geoBaseUrl,
  apiBaseUrl,
  headers,
  organizationId,
}: {
  geoBaseUrl?: string;
  apiBaseUrl?: string;
  headers?: Record<string, string>;
  organizationId?: string;
}): MapGeoClient {
  const contextGeoBaseUrl = useContext(MapGeoContext);
  const effectiveGeoBaseUrl = geoBaseUrl ?? contextGeoBaseUrl;
  const headersKey = JSON.stringify(headers ?? {});
  // biome-ignore lint/correctness/useExhaustiveDependencies: headers are keyed by their JSON
  return useMemo(
    () => createMapGeoClient({ geoBaseUrl: resolveGeoBaseUrl(effectiveGeoBaseUrl, apiBaseUrl), headers, organizationId }),
    [effectiveGeoBaseUrl, apiBaseUrl, organizationId, headersKey]
  );
}

/**
 * Client for `GET {base}/boundaries/:country` and `POST {base}/resolve`. Auth is whatever the
 * caller passes in `headers` (embed JWT) or the admin session cookie; no keys live in the browser.
 */
export function createMapGeoClient({
  geoBaseUrl,
  headers,
  organizationId,
  fetchImpl = (input, init) => fetch(input, init),
}: {
  geoBaseUrl: string;
  headers?: Record<string, string>;
  organizationId?: string;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}): MapGeoClient {
  const base = geoBaseUrl.replace(/\/+$/, "");
  const requestHeaders = {
    ...(organizationId ? { "x-organization-id": organizationId } : {}),
    ...headers,
  };

  return {
    fetchBoundaries(country) {
      const url = `${base}/boundaries/${encodeURIComponent(country)}`;
      let pending = boundariesCache.get(url);
      if (!pending) {
        pending = fetchImpl(url, { headers: requestHeaders }).then(async (response) => {
          if (!response.ok) throw new Error(`Could not load map outline (${response.status})`);
          return (await response.json()) as MapTopology;
        });
        boundariesCache.set(url, pending);
        // A failed load must not stick: let the next map retry.
        pending.catch(() => boundariesCache.delete(url));
      }
      return pending;
    },
    async resolvePlaces(country, places) {
      const response = await fetchImpl(`${base}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...requestHeaders },
        body: JSON.stringify({ country, places }),
      });
      if (!response.ok) throw new Error(`Could not resolve map places (${response.status})`);
      return (await response.json()) as Array<ResolvedPlace | null>;
    },
  };
}
