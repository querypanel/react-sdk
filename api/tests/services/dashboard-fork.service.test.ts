import { describe, expect, test, mock, beforeEach } from "bun:test";

/** Collects eq(key, value) calls per query chain when maybeSingle/single is invoked */
const capturedEqCallsPerQuery: Array<Array<[string, string | number | boolean]>> =
	[];

function createChain() {
	const eqCalls: Array<[string, string | number | boolean]> = [];
	const chain: Record<string, unknown> = {};
	chain.select = mock(() => chain);
	chain.eq = mock((_key: string, value: string | number | boolean) => {
		eqCalls.push([_key, value]);
		return chain;
	});
	chain.single = mock(() => {
		capturedEqCallsPerQuery.push([...eqCalls]);
		return Promise.resolve({ data: null, error: null });
	});
	chain.maybeSingle = mock(() => {
		capturedEqCallsPerQuery.push([...eqCalls]);
		return Promise.resolve({ data: null, error: null });
	});
	chain.insert = mock(() => chain);
	chain.update = mock(() => chain);
	return chain;
}

const mockFrom = mock((_table: string) => createChain());

mock.module("../../src/lib/supabase", () => ({
	supabase: {
		from: mockFrom,
	},
}));

import { DashboardForkService } from "../../src/services/dashboard-fork.service";
import type { AuthContext } from "../../src/types/auth";

describe("dashboard-fork.service", () => {
	let service: DashboardForkService;
	const orgId = "org_123";
	const mockAuth: AuthContext = {
		organizationId: orgId,
		tenantId: "tenant_1",
		userId: "user_1",
		scopes: ["*"],
		roles: ["admin"],
		method: "jwt",
	};

	beforeEach(() => {
		service = new DashboardForkService();
		capturedEqCallsPerQuery.length = 0;
		mockFrom.mockClear();
	});

	describe("getDashboardForTenant", () => {
		test("fork lookup is scoped by organization_id (tenant isolation)", async () => {
			const dashboardId = "dash_1";
			const tenantId = "tenant_1";
			// First query: fork lookup (maybeSingle) -> no fork
			// Second query: original dashboard (single) -> return dashboard
			const originalDashboard = {
				id: dashboardId,
				organization_id: orgId,
				name: "My Dashboard",
				is_customer_fork: false,
				forked_from_dashboard_id: null,
				tenant_id: null,
			};
			let fromCallCount = 0;
			mockFrom.mockImplementation(() => {
				const chain = createChain();
				fromCallCount++;
				if (fromCallCount === 2) {
					// Second query: original dashboard fetch; capture eq's and return dashboard
					(chain.single as ReturnType<typeof mock>).mockImplementationOnce(
						() => {
							const eqCallsForChain = (
								chain.eq as ReturnType<typeof mock>
							).mock.calls.map(
								(args: unknown[]) =>
									[args[0], args[1]] as [string, string | number | boolean],
							);
							capturedEqCallsPerQuery.push(eqCallsForChain);
							return Promise.resolve({
								data: originalDashboard,
								error: null,
							});
						},
					);
				}
				return chain;
			});

			await service.getDashboardForTenant(mockAuth, dashboardId, tenantId);

			// Find the fork lookup: the query that has forked_from_dashboard_id and tenant_id
			const forkLookupCalls = capturedEqCallsPerQuery.find(
				(calls) =>
					calls.some(([k]) => k === "forked_from_dashboard_id") &&
					calls.some(([k]) => k === "tenant_id"),
			);
			expect(forkLookupCalls).toBeDefined();
			expect(
				forkLookupCalls?.some(
					([k, v]) => k === "organization_id" && v === orgId,
				),
			).toBe(true);
		});
	});

	describe("forkDashboard", () => {
		test("existing-fork check is scoped by organization_id (tenant isolation)", async () => {
			const dashboardId = "dash_1";
			const tenantId = "tenant_1";
			const originalDashboard = {
				id: dashboardId,
				organization_id: orgId,
				name: "Original",
				status: "deployed",
				description: null,
				content_json: "{}",
				widget_config: {},
				editor_type: "blocknote",
				datasource_id: null,
				is_customer_fork: false,
				forked_from_dashboard_id: null,
				tenant_id: null,
				version: 1,
				deployed_at: new Date().toISOString(),
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				created_by: null,
			};
			const newFork = { ...originalDashboard, id: "fork_1", is_customer_fork: true };

			let singleCalls = 0;
			mockFrom.mockImplementation(() => {
				const chain = createChain();
				(chain.single as ReturnType<typeof mock>).mockImplementation(
					() => {
						singleCalls++;
						return Promise.resolve({
							data: singleCalls === 1 ? originalDashboard : newFork,
							error: null,
						});
					},
				);
				(chain.maybeSingle as ReturnType<typeof mock>).mockImplementation(
					() => {
						const eqCallsForChain = (
							chain.eq as ReturnType<typeof mock>
						).mock.calls.map(
							(args: unknown[]) =>
								[args[0], args[1]] as [string, string | number | boolean],
						);
						capturedEqCallsPerQuery.push(eqCallsForChain);
						return Promise.resolve({
							data: null,
							error: null,
						});
					},
				);
				return chain;
			});

			await service.forkDashboard(mockAuth, dashboardId, tenantId);

			// The "existing fork" check is the maybeSingle that has forked_from_dashboard_id and tenant_id
			const existingForkCheckCalls = capturedEqCallsPerQuery.find(
				(calls) =>
					calls.some(([k]) => k === "forked_from_dashboard_id") &&
					calls.some(([k]) => k === "tenant_id"),
			);
			expect(existingForkCheckCalls).toBeDefined();
			expect(
				existingForkCheckCalls?.some(
					([k, v]) => k === "organization_id" && v === orgId,
				),
			).toBe(true);
		});
	});
});
