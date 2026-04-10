import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SCHEMA_DERIVED_CHUNK_TYPES,
  type SchemaSnapshotDeletionAdmin,
} from './remove-schema-snapshot';

/**
 * Bridges {@link removeTableSchemaSnapshot} to Supabase admin (service role) queries.
 */
export function createSupabaseSchemaSnapshotDeletionAdmin(
  admin: SupabaseClient,
): SchemaSnapshotDeletionAdmin {
  return {
    async fetchSchemaRow(id) {
      const { data, error } = await admin
        .from('table_schemas')
        .select('id, organization_id, schema')
        .eq('id', id)
        .single();

      if (error || !data) return null;
      return {
        organization_id: data.organization_id,
        schema: data.schema,
      };
    },

    async deleteSchemaRow(id, orgId) {
      const { error } = await admin
        .from('table_schemas')
        .delete()
        .eq('id', id)
        .eq('organization_id', orgId);
      return { error: error ? { message: error.message } : null };
    },

    async listRemainingSchemaIdsForDatabase(orgId, databaseName) {
      const { data, error } = await admin
        .from('table_schemas')
        .select('id')
        .eq('organization_id', orgId)
        .eq('schema->>database', databaseName);

      if (error) {
        return { ids: [], error: { message: error.message } };
      }
      const ids = (data ?? []).map((r: { id: string }) => r.id);
      return { ids, error: null };
    },

    async deleteSchemaDerivedChunksForOrgDatabase(orgId, databaseName) {
      const { data, error: selectError } = await admin
        .from('schema_chunks')
        .select('id')
        .contains('metadata', { organization_id: orgId })
        .eq('metadata->>database', databaseName)
        .in('metadata->>type', [...SCHEMA_DERIVED_CHUNK_TYPES]);

      if (selectError) {
        return { error: { message: selectError.message } };
      }

      const ids = (data ?? []).map((row: { id: string }) => row.id);
      if (ids.length === 0) {
        return { error: null };
      }

      const { error } = await admin.from('schema_chunks').delete().in('id', ids);
      return { error: error ? { message: error.message } : null };
    },

    async deleteSyncStateForOrgDatabase(orgId, databaseName) {
      const { error } = await admin
        .from('schema_sync_state')
        .delete()
        .eq('organization_id', orgId)
        .eq('database_name', databaseName);
      return { error: error ? { message: error.message } : null };
    },
  };
}
