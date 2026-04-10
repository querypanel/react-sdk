import { Document } from "@langchain/core/documents";
import type { Schema } from "../types/schema";

export class ChunkerService {
	chunkSchema(schema: Schema, organizationId: string): Document[] {
		const documents: Document[] = [];

		for (const table of schema.tables) {
			documents.push(...this.chunkTable(schema, table, organizationId));
		}

		return documents;
	}

	private chunkTable(
		schema: Schema,
		table: Schema["tables"][0],
		organizationId: string,
	): Document[] {
		const documents: Document[] = [];

		// Create table overview chunk
		const primaryKeys = table.columns
			.filter((col) => col.is_primary_key)
			.map((col) => col.name)
			.join(", ");

		const tableOverview = `Database: ${schema.database}
Dialect: ${schema.dialect}
Table: ${table.table_name}
Description: ${table.description}
Primary keys: ${primaryKeys}`;

		documents.push(
			new Document({
				pageContent: tableOverview,
				metadata: {
					organization_id: organizationId,
					type: "table_overview",
					database: schema.database,
					dialect: schema.dialect,
					table: table.table_name,
					target_identifier: `database:${schema.database}:table:${table.table_name}`,
					created_at: new Date().toISOString(),
				},
			}),
		);

		// Create individual column chunks
		for (const column of table.columns) {
			documents.push(this.chunkColumn(schema, table, column, organizationId));
		}

		return documents;
	}

	private chunkColumn(
		schema: Schema,
		table: Schema["tables"][0],
		column: Schema["tables"][0]["columns"][0],
		organizationId: string,
	): Document {
		const columnChunk = `Column: ${table.table_name}.${column.name}
Type: ${column.data_type}
Table: ${table.table_name}`;

		return new Document({
			pageContent: columnChunk,
			metadata: {
				organization_id: organizationId,
				type: "column",
				database: schema.database,
				dialect: schema.dialect,
				table: table.table_name,
				column: column.name,
				created_at: new Date().toISOString(),
				data_type: column.data_type,
				is_primary_key: column.is_primary_key,
				target_identifier: `database:${schema.database}:table:${table.table_name}:column:${column.name}`,
			},
		});
	}
}
