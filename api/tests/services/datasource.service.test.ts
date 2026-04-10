import "../helpers/config.helper";
import { describe, expect, test, mock, beforeEach } from "bun:test";

// Ensure no module mocks leak in from other test files.
mock.restore();

const capturedOrderCalls: Array<[string, { ascending: boolean }]> = [];
const capturedLimitCalls: number[] = [];

const mockMaybeSingle = mock(() => ({ data: null, error: null }));

const createChain = () => {
	const chain: Record<string, unknown> = {
		_eqCalls: [] as [string, string | number | boolean][],
		_orderCalls: [] as Array<[string, { ascending: boolean }]>,
		_limitCalls: [] as number[],
	};
	chain.select = mock(function (this: typeof chain) {
		return this;
	});
	chain.eq = mock(function (
		this: typeof chain,
		_key: string,
		value: string | number | boolean,
	) {
		(this._eqCalls as [string, string | number | boolean][]).push([_key, value]);
		return this;
	});
	chain.order = mock(function (
		this: typeof chain,
		column: string,
		opts: { ascending: boolean },
	) {
		(this._orderCalls as Array<[string, { ascending: boolean }]>).push([
			column,
			opts,
		]);
		capturedOrderCalls.push([column, opts]);
		return this;
	});
	chain.limit = mock(function (this: typeof chain, n: number) {
		(this._limitCalls as number[]).push(n);
		capturedLimitCalls.push(n);
		return this;
	});
	chain.maybeSingle = mock(function (this: typeof chain) {
		return mockMaybeSingle();
	});
	return chain;
};

const mockFrom = mock((_table: string) => createChain());

mock.module("../../src/lib/supabase", () => ({
	supabase: {
		from: mockFrom,
	},
}));

import { getDatasourceForOrg } from "../../src/services/datasource.service";

describe("datasource.service", () => {
	beforeEach(() => {
		mockFrom.mockClear();
		mockMaybeSingle.mockReset();
		capturedOrderCalls.length = 0;
		capturedLimitCalls.length = 0;
	});

	describe("getDatasourceForOrg", () => {
		test("when datasourceId is omitted, uses deterministic ordering (order by created_at ascending, limit 1)", async () => {
			const orgId = "org_123";
			const row = {
				id: "ds_1",
				organization_id: orgId,
				name: "Default DB",
				dialect: "postgres",
				host: "localhost",
				port: 5432,
				database_name: "mydb",
				username: "u",
				password_secret_id: "secret",
				ssl_mode: "disable",
				tenant_field_name: null,
				tenant_field_type: null,
				use_iam_auth: false,
				aws_region: null,
				aws_role_arn: null,
			};
			mockMaybeSingle.mockResolvedValueOnce({ data: row, error: null });

			const result = await getDatasourceForOrg(orgId);

			expect(result).toEqual(row);
			expect(mockFrom).toHaveBeenCalledWith("datasources");
			expect(capturedOrderCalls).toHaveLength(1);
			expect(capturedOrderCalls[0]).toEqual([
				"created_at",
				{ ascending: true },
			]);
			expect(capturedLimitCalls).toContain(1);
		});

		test("when datasourceId is provided, fetches by id and does not use order/limit", async () => {
			const orgId = "org_123";
			const datasourceId = "ds_456";
			const row = {
				id: datasourceId,
				organization_id: orgId,
				name: "Analytics DB",
				dialect: "postgres",
				host: "db.example.com",
				port: 5432,
				database_name: "analytics",
				username: "u",
				password_secret_id: "secret",
				ssl_mode: "disable",
				tenant_field_name: null,
				tenant_field_type: null,
				use_iam_auth: false,
				aws_region: null,
				aws_role_arn: null,
			};
			mockMaybeSingle.mockResolvedValueOnce({ data: row, error: null });

			const result = await getDatasourceForOrg(orgId, datasourceId);

			expect(result).toEqual(row);
			expect(capturedOrderCalls).toHaveLength(0);
			expect(capturedLimitCalls).toHaveLength(0);
		});
	});
});
