import { describe, expect, test } from "bun:test";
import { KnowledgeChunkService } from "../../src/services/knowledge-chunk.service";

const baseRequest = {
	organization_id: "550e8400-e29b-41d4-a716-446655440000",
	database: "e-commerce",
	dialect: "Clickhouse",
	tables: [
		{
			table_name: "orders",
			gold_sql: [
				{
					name: "Total orders by day",
					description: "Counts orders grouped by day",
					sql: "select created_at::date as day, count(*) from orders group by 1",
				},
				{
					name: "Total revenue",
					sql: "select sum(amount) from orders",
				},
			],
			glossary: [
				{
					term: "gmv",
					definition: "Gross merchandise value",
				},
			],
		},
	],
} as const;

describe("KnowledgeChunkService", () => {
	test("should build gold sql and glossary chunks with unique identifiers", () => {
		const service = new KnowledgeChunkService();
		const { documents, counts } = service.buildDocuments(baseRequest);

		expect(counts.gold_sql).toBe(2);
		expect(counts.glossary).toBe(1);
		expect(documents).toHaveLength(3);

		const goldIds = documents
			.filter((doc) => doc.metadata.type === "gold_sql")
			.map((doc) => doc.metadata.target_identifier as string);

		expect(new Set(goldIds).size).toBe(goldIds.length);
		goldIds.forEach((id) => {
			expect(id).toMatch(
				/^database:e-commerce:table:orders:gold_sql:[a-f0-9]{12}$/,
			);
		});

		const glossaryId = documents.find((doc) => doc.metadata.type === "glossary")
			?.metadata.target_identifier as string;

		expect(glossaryId).toMatch(
			/^database:e-commerce:table:orders:glossary:[a-f0-9]{12}$/,
		);
	});

	test("should generate deterministic identifiers for identical payloads", () => {
		const service = new KnowledgeChunkService();
		const first = service
			.buildDocuments(baseRequest)
			.documents.map((doc) => doc.metadata.target_identifier);
		const second = service
			.buildDocuments(baseRequest)
			.documents.map((doc) => doc.metadata.target_identifier);

		expect(first).toEqual(second);
	});
});
