import { describe, expect, test } from "bun:test";
import {
	deriveTimeColumnsFromChunks,
	mergeTimeColumns,
} from "../../src/services/v2/time-columns";
import type { ContextChunk } from "../../src/types/query";

describe("time column helpers", () => {
	test("derives time columns from column chunks with time-like data types", () => {
		const chunks: ContextChunk[] = [
			{
				source: "column",
				pageContent: "Column: orders.created_at\nType: DateTime\nTable: orders",
				metadata: {
					table: "orders",
					column: "created_at",
					data_type: "DateTime",
				},
			},
			{
				source: "column",
				pageContent: "Column: orders.updated_at\nType: Timestamp\nTable: orders",
				metadata: {
					table: "orders",
					column: "updated_at",
				},
			},
			{
				source: "column",
				pageContent: "Column: orders.status\nType: String\nTable: orders",
				metadata: {
					table: "orders",
					column: "status",
					data_type: "String",
				},
			},
			{
				source: "table_overview",
				pageContent: "Table: orders",
				metadata: {
					table: "orders",
				},
			},
		];

		expect(deriveTimeColumnsFromChunks(chunks)).toEqual([
			"created_at",
			"updated_at",
		]);
	});

	test("keeps explicit time columns and falls back to derived ones only when needed", () => {
		expect(
			mergeTimeColumns([" event_time ", "created_at", "event_time"], [
				"updated_at",
			]),
		).toEqual(["event_time", "created_at"]);

		expect(mergeTimeColumns([], ["created_at", "created_at"])).toEqual([
			"created_at",
		]);
	});
});
