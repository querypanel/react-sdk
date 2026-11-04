import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMapBoundariesCache, createMapGeoClient, resolveGeoBaseUrl } from "./mapGeo";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("resolveGeoBaseUrl", () => {
  it("prefers an override, else derives from the api base", () => {
    expect(resolveGeoBaseUrl("/api/geo/", "https://api.x")).toBe("/api/geo");
    expect(resolveGeoBaseUrl(undefined, "https://api.x/")).toBe("https://api.x/geo");
    expect(resolveGeoBaseUrl(undefined, "")).toBe("/api/geo");
    expect(resolveGeoBaseUrl(undefined, undefined)).toBe("/api/geo");
  });
});

describe("createMapGeoClient", () => {
  beforeEach(() => clearMapBoundariesCache());

  it("fetches an outline once for several maps and sends the auth headers", async () => {
    const fetchImpl = vi.fn(async (_u: string, _i?: RequestInit) => ok({ type: "Topology" }));
    const a = createMapGeoClient({ geoBaseUrl: "/g", headers: { Authorization: "Bearer t" }, organizationId: "o1", fetchImpl });
    const b = createMapGeoClient({ geoBaseUrl: "/g", fetchImpl });
    await Promise.all([a.fetchBoundaries("HU"), b.fetchBoundaries("HU")]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("/g/boundaries/HU", {
      headers: { "x-organization-id": "o1", Authorization: "Bearer t" },
    });
  });

  it("does not cache failures", async () => {
    const fetchImpl = vi
      .fn<(u: string, i?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(ok({ type: "Topology" }));
    const c = createMapGeoClient({ geoBaseUrl: "/g", fetchImpl });
    await expect(c.fetchBoundaries("HU")).rejects.toThrow();
    await expect(c.fetchBoundaries("HU")).resolves.toEqual({ type: "Topology" });
  });

  it("posts places to /resolve", async () => {
    const fetchImpl = vi.fn(async (_u: string, _i?: RequestInit) => ok([null]));
    const c = createMapGeoClient({ geoBaseUrl: "/g", fetchImpl });
    await expect(c.resolvePlaces("HU", [{ postalCode: "1011", city: null }])).resolves.toEqual([null]);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/g/resolve");
    expect(JSON.parse(init.body as string)).toEqual({ country: "HU", places: [{ postalCode: "1011", city: null }] });
  });
});
