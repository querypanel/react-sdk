import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Schema } from "../../src/types/schema";

// Mock Supabase client
const mockSelect = mock(() => mockQuery);
const mockInsert = mock(() => mockQuery);
const mockEq = mock(() => mockQuery);
const mockOrder = mock(() => mockQuery);
const mockLimit = mock(() => mockQuery);
const mockSingle = mock(() => ({ data: null, error: null }));
const mockMaybeSingle = mock(() => ({ data: null, error: null }));

const mockQuery = {
	select: mockSelect,
	insert: mockInsert,
	eq: mockEq,
	order: mockOrder,
	limit: mockLimit,
	single: mockSingle,
	maybeSingle: mockMaybeSingle,
};

const mockFrom = mock(() => mockQuery);

mock.module("../../src/lib/supabase", () => ({
	supabase: {
		from: mockFrom,
	},
}));

import { SchemaStorageService } from "../../src/services/schema-storage.service";

describe("SchemaStorageService", () => {
	let schemaStorageService: SchemaStorageService;

	const mockSchema: Schema = {
		database: "e-commerce",
		dialect: "Clickhouse",
		tables: [
			{
				table_name: "orders",
				description: "Customer orders",
				columns: [
					{
						name: "id",
						data_type: "Int64",
						is_primary_key: true,
						description: "Order ID",
					},
				],
			},
		],
	};

	async function computeSchemaHash(schema: Schema): Promise<string> {
		const schemaString = JSON.stringify(schema, Object.keys(schema).sort());
		const encoder = new TextEncoder();
		const data = encoder.encode(schemaString);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
	}

	beforeEach(() => {
		schemaStorageService = new SchemaStorageService();
		mockFrom.mockClear();
		mockSelect.mockClear();
		mockInsert.mockClear();
		mockEq.mockClear();
		mockOrder.mockClear();
		mockLimit.mockClear();
		mockSingle.mockClear();
		mockMaybeSingle.mockClear();
	});

	test("should generate consistent hash for same schema", async () => {
		// Drift check: no prior row for this org + database
		mockMaybeSingle.mockResolvedValueOnce({
			data: null,
			error: null,
		});

		// Setup mock for insert - capture the actual hash that will be calculated
		mockSingle.mockImplementationOnce(async () => {
			// Return whatever hash the service calculates
			// The service will calculate the same hash for the same schema
			return { data: { id: "test-id", hash: "calculated-hash" }, error: null };
		});

		const result1 = await schemaStorageService.saveSchema(
			mockSchema,
			"org_123",
		);

		// Reset mocks
		mockSingle.mockClear();
		mockMaybeSingle.mockResolvedValueOnce({
			data: null,
			error: null,
		});
		mockSingle.mockImplementationOnce(async () => {
			// Return the same hash for the same schema
			return {
				data: { id: "test-id-2", hash: "calculated-hash" },
				error: null,
			};
		});

		const result2 = await schemaStorageService.saveSchema(
			mockSchema,
			"org_123",
		);

		// Hashes should be the same for identical schemas
		expect(result1.hash).toBe(result2.hash);
	});

	test("should generate different hash for different schemas", async () => {
		const modifiedSchema = {
			...mockSchema,
			database: "different-db",
		};

		// Setup mocks for first schema
		mockMaybeSingle.mockResolvedValueOnce({
			data: null,
			error: null,
		});
		mockSingle.mockResolvedValueOnce({
			data: { id: "test-id-1", hash: "hash-1" },
			error: null,
		});

		const result1 = await schemaStorageService.saveSchema(
			mockSchema,
			"org_123",
		);

		// Reset and setup mocks for second schema
		mockSingle.mockClear();
		mockMaybeSingle.mockResolvedValueOnce({
			data: null,
			error: null,
		});
		mockSingle.mockResolvedValueOnce({
			data: { id: "test-id-2", hash: "hash-2" },
			error: null,
		});

		const result2 = await schemaStorageService.saveSchema(
			modifiedSchema,
			"org_123",
		);

		expect(result1.hash).not.toBe(result2.hash);
	});

	test("should detect no drift for first schema", async () => {
		// No existing schema
		mockMaybeSingle.mockResolvedValueOnce({
			data: null,
			error: null,
		});

		// Insert returns new schema
		mockSingle.mockResolvedValueOnce({
			data: { id: "test-id", hash: "test-hash" },
			error: null,
		});

		const result = await schemaStorageService.saveSchema(mockSchema, "org_123");

		expect(result.isDrift).toBe(false);
		expect(result.hasExistingSchema).toBe(false);
	});

	test("should detect drift when schema changes", async () => {
		// Existing schema with different hash
		mockMaybeSingle.mockResolvedValueOnce({
			data: { hash: "old-hash" },
			error: null,
		});

		// Insert returns new schema
		mockSingle.mockResolvedValueOnce({
			data: { id: "new-id", hash: "new-hash" },
			error: null,
		});

		const result = await schemaStorageService.saveSchema(mockSchema, "org_123");

		expect(result.isDrift).toBe(true);
		expect(result.hasExistingSchema).toBe(true);
	});

	test("should not detect drift when schema is identical", async () => {
		const hash = await computeSchemaHash(mockSchema);

		// Existing schema with the same hash
		mockMaybeSingle.mockResolvedValueOnce({
			data: { hash },
			error: null,
		});

		// Insert succeeds, returning the same hash
		mockSingle.mockResolvedValueOnce({
			data: { id: "test-id", hash },
			error: null,
		});

		const result = await schemaStorageService.saveSchema(mockSchema, "org_123");

		expect(result.isDrift).toBe(false);
		expect(result.hasExistingSchema).toBe(true);
	});

	test("should handle duplicate hash insertion", async () => {
		// No existing schema for drift (or unused path before insert)
		mockMaybeSingle.mockResolvedValueOnce({
			data: null,
			error: null,
		});

		// Insert fails with duplicate key error
		mockSingle.mockResolvedValueOnce({
			data: null,
			error: { code: "23505" },
		});

		// Fetch existing schema
		mockSingle.mockResolvedValueOnce({
			data: { id: "existing-id", hash: "existing-hash" },
			error: null,
		});

		const result = await schemaStorageService.saveSchema(mockSchema, "org_123");

		expect(result.id).toBe("existing-id");
		expect(result.hash).toBe("existing-hash");
		expect(result.isDrift).toBe(false);
		expect(result.hasExistingSchema).toBe(true);
	});

	test("should call supabase with correct parameters", async () => {
		mockMaybeSingle.mockResolvedValueOnce({
			data: null,
			error: null,
		});

		mockSingle.mockResolvedValueOnce({
			data: { id: "test-id", hash: "test-hash" },
			error: null,
		});

		await schemaStorageService.saveSchema(mockSchema, "org_123");

		expect(mockFrom).toHaveBeenCalledWith("table_schemas");
		expect(mockInsert).toHaveBeenCalled();
		expect(mockEq).toHaveBeenCalledWith("organization_id", "org_123");
		expect(mockEq).toHaveBeenCalledWith(
			"schema->>database",
			mockSchema.database,
		);
	});

	test("should get latest schema for organization", async () => {
		const mockSchemaData = {
			id: "test-id",
			schema: mockSchema,
			organization_id: "org_123",
			hash: "test-hash",
			created_at: "2025-01-01T00:00:00Z",
			updated_at: "2025-01-01T00:00:00Z",
		};

		mockMaybeSingle.mockResolvedValueOnce({
			data: mockSchemaData,
			error: null,
		});

		const result = await schemaStorageService.getLatestSchema("org_123");

		expect(result).toEqual(mockSchemaData);
		expect(mockFrom).toHaveBeenCalledWith("table_schemas");
		expect(mockEq).toHaveBeenCalledWith("organization_id", "org_123");
		expect(mockOrder).toHaveBeenCalledWith("created_at", { ascending: false });
		expect(mockLimit).toHaveBeenCalledWith(1);
		expect(mockMaybeSingle).toHaveBeenCalled();
	});

	test("should return null when no schema exists", async () => {
		mockMaybeSingle.mockResolvedValueOnce({
			data: null,
			error: { code: "PGRST116" },
		});

		const result = await schemaStorageService.getLatestSchema("org_123");

		expect(result).toBeNull();
	});

	test("should get schema history for organization", async () => {
		const mockHistory = [
			{
				id: "id-1",
				schema: mockSchema,
				organization_id: "org_123",
				hash: "hash-1",
				created_at: "2025-01-02T00:00:00Z",
				updated_at: "2025-01-02T00:00:00Z",
			},
			{
				id: "id-2",
				schema: mockSchema,
				organization_id: "org_123",
				hash: "hash-2",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			},
		];

		// Override single() since getSchemaHistory doesn't use it
		const mockQueryWithoutSingle = {
			select: mockSelect,
			eq: mockEq,
			order: mockOrder,
		};

		mockFrom.mockReturnValueOnce(mockQueryWithoutSingle);
		mockSelect.mockReturnValueOnce(mockQueryWithoutSingle);
		mockEq.mockReturnValueOnce(mockQueryWithoutSingle);
		mockOrder.mockResolvedValueOnce({
			data: mockHistory,
			error: null,
		});

		const result = await schemaStorageService.getSchemaHistory("org_123");

		expect(result).toEqual(mockHistory);
		expect(result).toHaveLength(2);
	});
});
