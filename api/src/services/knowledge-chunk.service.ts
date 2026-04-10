import { createHash } from "crypto";
import { Document } from "@langchain/core/documents";
import type { KnowledgeBaseChunkRequest } from "../schemas/knowledge-base.schema";

interface BuildResult {
	documents: Document[];
	counts: {
		gold_sql: number;
		glossary: number;
	};
}

export class KnowledgeChunkService {
	private buildTargetIdentifier(
		request: KnowledgeBaseChunkRequest,
		tableName: string,
		type: "gold_sql" | "glossary",
		seed: string,
	): string {
		const hash = createHash("sha256")
			.update(
				`${request.organization_id}|${request.database}|${tableName}|${type}|${seed}`,
			)
			.digest("hex")
			.slice(0, 12);

		return `database:${request.database}:table:${tableName}:${type}:${hash}`;
	}

	buildDocuments(request: KnowledgeBaseChunkRequest): BuildResult {
		const documents: Document[] = [];
		let goldSqlCount = 0;
		let glossaryCount = 0;

		for (const table of request.tables) {
			if (table.gold_sql) {
				table.gold_sql.forEach((entry) => {
					goldSqlCount += 1;
					const targetIdentifier = this.buildTargetIdentifier(
						request,
						table.table_name,
						"gold_sql",
						`${entry.name ?? ""}|${entry.description ?? ""}|${entry.sql}`,
					);
					const title = entry.name ?? `Gold SQL for ${table.table_name}`;
					const description = entry.description
						? `Description: ${entry.description}\n`
						: "";
					const pageContent = `${title}\n${description}SQL:\n${entry.sql}`;

					documents.push(
						new Document({
							pageContent,
							metadata: {
								organization_id: request.organization_id,
								type: "gold_sql",
								database: request.database,
								dialect: request.dialect,
								table: table.table_name,
								entry_name: entry.name ?? null,
								sql: entry.sql,
								source: "knowledge_base",
								target_identifier: targetIdentifier,
								created_at: new Date().toISOString(),
							},
						}),
					);
				});
			}

			if (table.glossary) {
				table.glossary.forEach((entry) => {
					glossaryCount += 1;
					const targetIdentifier = this.buildTargetIdentifier(
						request,
						table.table_name,
						"glossary",
						`${entry.term}|${entry.definition}`,
					);
					const pageContent = `Term: ${entry.term}\nDefinition: ${entry.definition}`;

					documents.push(
						new Document({
							pageContent,
							metadata: {
								organization_id: request.organization_id,
								type: "glossary",
								database: request.database,
								dialect: request.dialect,
								table: table.table_name,
								term: entry.term,
								source: "knowledge_base",
								target_identifier: targetIdentifier,
								created_at: new Date().toISOString(),
							},
						}),
					);
				});
			}
		}

		return {
			documents,
			counts: {
				gold_sql: goldSqlCount,
				glossary: glossaryCount,
			},
		};
	}
}
