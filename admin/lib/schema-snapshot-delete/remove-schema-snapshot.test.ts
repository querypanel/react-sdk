import { describe, expect, it, vi } from 'vitest';
import {
  parseLogicalDatabaseNameFromSchemaJson,
  removeTableSchemaSnapshot,
  SCHEMA_DERIVED_CHUNK_TYPES,
  type SchemaSnapshotDeletionAdmin,
} from './remove-schema-snapshot';

const derivedTypeSet = new Set<string>(SCHEMA_DERIVED_CHUNK_TYPES);

function memoryAdmin(seed: {
  schemas: Array<{ id: string; organization_id: string; schema: unknown }>;
  chunks: Array<{ id: string; metadata: Record<string, unknown> }>;
  syncState: Array<{ organization_id: string; database_name: string }>;
}): SchemaSnapshotDeletionAdmin {
  // Mutate caller's arrays so assertions see the same store the admin updates.
  const { schemas, chunks, syncState } = seed;

  return {
    async fetchSchemaRow(id) {
      const row = schemas.find((s) => s.id === id);
      return row ? { organization_id: row.organization_id, schema: row.schema } : null;
    },
    async deleteSchemaRow(id, orgId) {
      const i = schemas.findIndex((s) => s.id === id && s.organization_id === orgId);
      if (i >= 0) schemas.splice(i, 1);
      return { error: null };
    },
    async listRemainingSchemaIdsForDatabase(orgId, databaseName) {
      const ids = schemas
        .filter((s) => {
          if (s.organization_id !== orgId) return false;
          const db = parseLogicalDatabaseNameFromSchemaJson(s.schema);
          return db === databaseName;
        })
        .map((s) => s.id);
      return { ids, error: null };
    },
    async deleteSchemaDerivedChunksForOrgDatabase(orgId, databaseName) {
      for (let i = chunks.length - 1; i >= 0; i -= 1) {
        const m = chunks[i].metadata;
        const t = m.type;
        if (
          m.organization_id === orgId &&
          m.database === databaseName &&
          typeof t === 'string' &&
          derivedTypeSet.has(t)
        ) {
          chunks.splice(i, 1);
        }
      }
      return { error: null };
    },
    async deleteSyncStateForOrgDatabase(orgId, databaseName) {
      for (let i = syncState.length - 1; i >= 0; i -= 1) {
        const r = syncState[i];
        if (r.organization_id === orgId && r.database_name === databaseName) {
          syncState.splice(i, 1);
        }
      }
      return { error: null };
    },
  };
}

describe('parseLogicalDatabaseNameFromSchemaJson', () => {
  it('returns trimmed database string', () => {
    expect(parseLogicalDatabaseNameFromSchemaJson({ database: '  shop  ' })).toBe('shop');
  });
  it('returns null when missing', () => {
    expect(parseLogicalDatabaseNameFromSchemaJson({})).toBeNull();
    expect(parseLogicalDatabaseNameFromSchemaJson(null)).toBeNull();
  });
});

describe('removeTableSchemaSnapshot', () => {
  const org = '11111111-1111-1111-1111-111111111111';

  it('removes table/column schema chunks and sync state when the last snapshot is deleted; keeps gold_sql', async () => {
    const chunks = [
      {
        id: 'c1',
        metadata: {
          organization_id: org,
          database: 'shop',
          type: 'table_overview',
        },
      },
      {
        id: 'c2',
        metadata: {
          organization_id: org,
          database: 'shop',
          type: 'gold_sql',
          table: 'orders',
        },
      },
      {
        id: 'c3',
        metadata: {
          organization_id: org,
          database: 'other',
          type: 'glossary',
        },
      },
    ];
    const syncState = [{ organization_id: org, database_name: 'shop' }];
    const admin = memoryAdmin({
      schemas: [
        {
          id: 'snap-a',
          organization_id: org,
          schema: { database: 'shop', dialect: 'postgres', tables: [] },
        },
      ],
      chunks,
      syncState,
    });

    const outcome = await removeTableSchemaSnapshot(admin, 'snap-a', org);
    expect(outcome).toEqual({ kind: 'success', removed_embeddings: true });
    expect(chunks.map((c) => c.id).sort()).toEqual(['c2', 'c3']);
    expect(syncState).toHaveLength(0);
  });

  it('does not delete chunks when another snapshot remains for the same logical database', async () => {
    const chunks = [
      {
        id: 'g1',
        metadata: { organization_id: org, database: 'shop', type: 'gold_sql' },
      },
    ];
    const admin = memoryAdmin({
      schemas: [
        {
          id: 'old',
          organization_id: org,
          schema: { database: 'shop', dialect: 'postgres', tables: [] },
        },
        {
          id: 'new',
          organization_id: org,
          schema: { database: 'shop', dialect: 'postgres', tables: [] },
        },
      ],
      chunks,
      syncState: [],
    });

    const outcome = await removeTableSchemaSnapshot(admin, 'old', org);
    expect(outcome).toEqual({ kind: 'success', removed_embeddings: false });
    expect(chunks).toHaveLength(1);
  });

  it('returns 403 when organization does not match', async () => {
    const admin = memoryAdmin({
      schemas: [
        {
          id: 'x',
          organization_id: '22222222-2222-2222-2222-222222222222',
          schema: { database: 'shop' },
        },
      ],
      chunks: [],
      syncState: [],
    });
    const outcome = await removeTableSchemaSnapshot(admin, 'x', org);
    expect(outcome).toEqual({ kind: 'error', status: 403, message: 'Forbidden' });
  });

  it('returns warning when remaining snapshot query fails', async () => {
    const admin: SchemaSnapshotDeletionAdmin = {
      async fetchSchemaRow() {
        return { organization_id: org, schema: { database: 'shop' } };
      },
      async deleteSchemaRow() {
        return { error: null };
      },
      async listRemainingSchemaIdsForDatabase() {
        return { ids: [], error: { message: 'rpc failed' } };
      },
      async deleteSchemaDerivedChunksForOrgDatabase() {
        return { error: null };
      },
      async deleteSyncStateForOrgDatabase() {
        return { error: null };
      },
    };

    const outcome = await removeTableSchemaSnapshot(admin, 'any', org);
    expect(outcome).toEqual({
      kind: 'success',
      removed_embeddings: false,
      warning: 'Schema removed but embedding cleanup status unknown',
    });
  });

  it('returns warning when chunk delete fails after last snapshot removed', async () => {
    const admin: SchemaSnapshotDeletionAdmin = {
      async fetchSchemaRow() {
        return { organization_id: org, schema: { database: 'shop' } };
      },
      async deleteSchemaRow() {
        return { error: null };
      },
      async listRemainingSchemaIdsForDatabase() {
        return { ids: [], error: null };
      },
      async deleteSchemaDerivedChunksForOrgDatabase() {
        return { error: { message: 'permission denied' } };
      },
      async deleteSyncStateForOrgDatabase() {
        return { error: null };
      },
    };

    const outcome = await removeTableSchemaSnapshot(admin, 'any', org);
    expect(outcome).toEqual({
      kind: 'success',
      removed_embeddings: false,
      warning:
        'Schema record removed; failed to delete table/column schema embeddings. Re-sync or contact support.',
    });
  });

  it('invokes onSyncStateDeleteError when sync state delete fails', async () => {
    const onSyncStateDeleteError = vi.fn();
    const admin: SchemaSnapshotDeletionAdmin = {
      async fetchSchemaRow() {
        return { organization_id: org, schema: { database: 'shop' } };
      },
      async deleteSchemaRow() {
        return { error: null };
      },
      async listRemainingSchemaIdsForDatabase() {
        return { ids: [], error: null };
      },
      async deleteSchemaDerivedChunksForOrgDatabase() {
        return { error: null };
      },
      async deleteSyncStateForOrgDatabase() {
        return { error: { message: 'sync boom' } };
      },
    };

    const outcome = await removeTableSchemaSnapshot(admin, 'any', org, {
      onSyncStateDeleteError,
    });
    expect(outcome).toEqual({ kind: 'success', removed_embeddings: true });
    expect(onSyncStateDeleteError).toHaveBeenCalledWith('sync boom');
  });
});
