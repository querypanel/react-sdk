import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBlockSqlPayload, runBlockSql } from "./runBlockSql";

function mockFetch(body: unknown, ok = true) {
  const fn = vi.fn().mockResolvedValue({ ok, json: async () => body });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const base = {
  url: "/api/run-sql",
  headers: { Authorization: "Bearer t" },
  organizationId: "org-1",
  force: true,
  keyPrefix: "test",
  errorMessage: "Failed to load chart data",
};

afterEach(() => vi.unstubAllGlobals());

describe("buildBlockSqlPayload", () => {
  it("omits blank optional fields and trims tenant fields", () => {
    expect(
      buildBlockSqlPayload({
        sql: "select 1",
        datasourceIds: ["d"],
        sqlParams: {},
        tenantFieldName: "  ",
        previewTenantId: " t1 ",
      })
    ).toEqual({ sql: "select 1", datasourceIds: ["d"], params: {}, previewTenantId: "t1" });
  });
});

describe("runBlockSql", () => {
  it("posts the payload with org and custom headers and returns rows and fields", async () => {
    const fetchMock = mockFetch({ rows: [{ a: 1 }], fields: ["a"] });
    const payload = buildBlockSqlPayload({
      sql: "select a /* ok */",
      datasourceIds: ["d"],
      sqlParams: {},
    });
    await expect(runBlockSql({ ...base, payload })).resolves.toEqual({
      rows: [{ a: 1 }],
      fields: ["a"],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/run-sql");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "x-organization-id": "org-1",
      Authorization: "Bearer t",
    });
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it("falls back to empty rows and fields", async () => {
    mockFetch({});
    const payload = buildBlockSqlPayload({ sql: "select empty", datasourceIds: [], sqlParams: {} });
    await expect(runBlockSql({ ...base, payload })).resolves.toEqual({ rows: [], fields: [] });
  });

  it("throws the server error, else the fallback message", async () => {
    const payload = buildBlockSqlPayload({ sql: "select err", datasourceIds: [], sqlParams: {} });
    mockFetch({ error: "boom" }, false);
    await expect(runBlockSql({ ...base, payload })).rejects.toThrow("boom");
    mockFetch({}, false);
    await expect(runBlockSql({ ...base, payload })).rejects.toThrow("Failed to load chart data");
  });
});
