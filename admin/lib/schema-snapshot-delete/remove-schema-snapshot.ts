/**
 * Orchestration for removing one `table_schemas` row and optionally cleaning
 * **schema-derived** `schema_chunks` (`table_overview`, `column`) plus
 * `schema_sync_state` when no snapshots remain for the logical DB.
 *
 * Gold SQL and glossary chunks are never deleted here; customers remove those from
 * the Knowledge base when they want.
 *
 * Supabase-specific clients implement {@link SchemaSnapshotDeletionAdmin}.
 */

/** Same metadata filter as querypanel-sdk `EmbeddingService.deleteSchemaDerivedChunksForDatabase`. */
export const SCHEMA_DERIVED_CHUNK_TYPES = ['table_overview', 'column'] as const;

export function parseLogicalDatabaseNameFromSchemaJson(schema: unknown): string | null {
  const schemaObj = schema as Record<string, unknown> | null;
  const databaseName = typeof schemaObj?.database === 'string' ? schemaObj.database.trim() : '';
  return databaseName || null;
}

export interface SchemaSnapshotDeletionAdmin {
  fetchSchemaRow(
    id: string,
  ): Promise<{ organization_id: string; schema: unknown } | null>;
  deleteSchemaRow(id: string, orgId: string): Promise<{ error: { message: string } | null }>;
  listRemainingSchemaIdsForDatabase(
    orgId: string,
    databaseName: string,
  ): Promise<{ ids: string[]; error: { message: string } | null }>;
  /** Only `table_overview` and `column` chunks; never gold_sql / glossary. */
  deleteSchemaDerivedChunksForOrgDatabase(
    orgId: string,
    databaseName: string,
  ): Promise<{ error: { message: string } | null }>;
  deleteSyncStateForOrgDatabase(
    orgId: string,
    databaseName: string,
  ): Promise<{ error: { message: string } | null }>;
}

export type RemoveTableSchemaSnapshotSuccess = {
  kind: 'success';
  /** True when this was the last snapshot for the DB and schema-derived chunks were cleaned up. */
  removed_embeddings: boolean;
  warning?: string;
};

export type RemoveTableSchemaSnapshotError = {
  kind: 'error';
  status: number;
  message: string;
};

export type RemoveTableSchemaSnapshotOutcome =
  | RemoveTableSchemaSnapshotSuccess
  | RemoveTableSchemaSnapshotError;

export type RemoveTableSchemaSnapshotOptions = {
  /** Called when `schema_sync_state` delete fails (same as route: log only). */
  onSyncStateDeleteError?: (message: string) => void;
};

export async function removeTableSchemaSnapshot(
  admin: SchemaSnapshotDeletionAdmin,
  tableSchemaId: string,
  callerOrgId: string,
  options?: RemoveTableSchemaSnapshotOptions,
): Promise<RemoveTableSchemaSnapshotOutcome> {
  const row = await admin.fetchSchemaRow(tableSchemaId);
  if (!row) {
    return { kind: 'error', status: 404, message: 'Schema record not found' };
  }

  if (row.organization_id !== callerOrgId) {
    return { kind: 'error', status: 403, message: 'Forbidden' };
  }

  const databaseName = parseLogicalDatabaseNameFromSchemaJson(row.schema);
  if (!databaseName) {
    return { kind: 'error', status: 400, message: 'Invalid schema payload' };
  }

  const { error: deleteRowError } = await admin.deleteSchemaRow(tableSchemaId, callerOrgId);
  if (deleteRowError) {
    return { kind: 'error', status: 500, message: 'Failed to remove schema record' };
  }

  const { ids: remainingIds, error: remainingError } =
    await admin.listRemainingSchemaIdsForDatabase(callerOrgId, databaseName);

  if (remainingError) {
    return {
      kind: 'success',
      removed_embeddings: false,
      warning: 'Schema removed but embedding cleanup status unknown',
    };
  }

  const stillHasSnapshots = remainingIds.length > 0;

  if (!stillHasSnapshots) {
    const { error: chunkError } = await admin.deleteSchemaDerivedChunksForOrgDatabase(
      callerOrgId,
      databaseName,
    );
    if (chunkError) {
      return {
        kind: 'success',
        removed_embeddings: false,
        warning:
          'Schema record removed; failed to delete table/column schema embeddings. Re-sync or contact support.',
      };
    }

    const { error: syncError } = await admin.deleteSyncStateForOrgDatabase(
      callerOrgId,
      databaseName,
    );
    if (syncError) {
      options?.onSyncStateDeleteError?.(syncError.message);
    }
  }

  return {
    kind: 'success',
    removed_embeddings: !stillHasSnapshots,
  };
}
