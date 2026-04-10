import { supabase } from "../lib/supabase";
import type { Schema } from "../types/schema";

/** Date/time-like columns from table definitions (shared with v2 query-runner snapshot parsing). */
export function deriveTimeColumnsFromTableDefinitions(
	tables: Schema["tables"],
): string[] {
	const cols: string[] = [];
	for (const table of tables) {
		for (const col of table.columns) {
			const name = (col.name ?? "").trim();
			const dataType = (col.data_type ?? "").trim();
			if (!name) continue;
			if (/date|time|timestamp|datetime/i.test(dataType)) cols.push(name);
		}
	}
	return Array.from(new Set(cols));
}

export function deriveTimeColumnsFromSchemaTables(schema: Schema): string[] {
	return deriveTimeColumnsFromTableDefinitions(schema.tables);
}

export interface TenantSettings {
	tenantFieldName: string;
	tenantFieldType: string;
	enforceTenantIsolation: boolean;
}

export interface SchemaConfig {
	tenant?: {
		fieldName: string;
		fieldType: string;
		enforceIsolation: boolean;
	};
	timeColumns?: string[];
}

interface TableSchema {
	id: string;
	schema: Schema;
	organization_id: string;
	hash: string;
	tenant_settings?: TenantSettings;
	config?: SchemaConfig;
	created_at: string;
	updated_at: string;
}

interface DriftCheckResult {
	hasExistingSchema: boolean;
	isDrift: boolean;
}

interface SaveResult extends DriftCheckResult {
	id: string;
	hash: string;
}

export class SchemaStorageService {
	/**
	 * Generates a SHA-256 hash of the schema for drift detection
	 */
	private async hashSchema(schema: Schema): Promise<string> {
		const schemaString = JSON.stringify(schema, Object.keys(schema).sort());
		const encoder = new TextEncoder();
		const data = encoder.encode(schemaString);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashHex = hashArray
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		return hashHex;
	}

	/**
	 * Checks if a schema with the same hash already exists for this org + logical database.
	 * Scoped per `schema.database` so another DB's latest row does not skew drift for this ingest.
	 */
	private async checkForDrift(
		organizationId: string,
		database: string,
		hash: string,
	): Promise<DriftCheckResult> {
		const { data, error } = await supabase
			.from("table_schemas")
			.select("hash")
			.eq("organization_id", organizationId)
			.eq("schema->>database", database)
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle();

		if (error && error.code !== "PGRST116") {
			throw error;
		}

		if (!data) {
			return {
				hasExistingSchema: false,
				isDrift: false,
			};
		}

		return {
			hasExistingSchema: true,
			isDrift: data.hash !== hash,
		};
	}

	/**
	 * Saves a schema to the database
	 */
	async saveSchema(
		schema: Schema,
		organizationId: string,
		tenantSettings?: TenantSettings,
		config?: SchemaConfig,
	): Promise<SaveResult> {
		const hash = await this.hashSchema(schema);
		const driftState = await this.checkForDrift(
			organizationId,
			schema.database,
			hash,
		);
		let { hasExistingSchema, isDrift } = driftState;

		const { data, error } = await supabase
			.from("table_schemas")
			.insert({
				schema,
				organization_id: organizationId,
				hash,
				tenant_settings: tenantSettings,
				config: config ?? null,
			})
			.select("id, hash")
			.single();

		if (error) {
			// Check if it's a duplicate hash error
			if (error.code === "23505") {
				hasExistingSchema = true;
				// Schema already exists, fetch the existing one
				const { data: existingData, error: fetchError } = await supabase
					.from("table_schemas")
					.select("id, hash")
					.eq("organization_id", organizationId)
					.eq("hash", hash)
					.single();

				if (fetchError) {
					throw fetchError;
				}

				return {
					id: existingData.id,
					hash: existingData.hash,
					isDrift: false,
					hasExistingSchema,
				};
			}
			throw error;
		}

		return {
			id: data.id,
			hash: data.hash,
			isDrift,
			hasExistingSchema,
		};
	}

	/**
	 * Gets the latest schema for an organization
	 */
	async getLatestSchema(
		organizationId: string,
		databaseName?: string,
	): Promise<TableSchema | null> {
		let query = supabase
			.from("table_schemas")
			.select("*")
			.eq("organization_id", organizationId);

		if (databaseName) {
			query = query.eq("schema->>database", databaseName);
		}

		const { data, error } = await query
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle();

		if (error && error.code !== "PGRST116") {
			throw error;
		}

		return data as TableSchema | null;
	}

	/**
	 * Gets all schemas for an organization
	 */
	async getSchemaHistory(organizationId: string): Promise<TableSchema[]> {
		const { data, error } = await supabase
			.from("table_schemas")
			.select("*")
			.eq("organization_id", organizationId)
			.order("created_at", { ascending: false });

		if (error) {
			throw error;
		}

		return data as TableSchema[];
	}
}
