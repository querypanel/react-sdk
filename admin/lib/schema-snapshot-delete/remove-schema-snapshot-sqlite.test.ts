/**
 * SQLite mirrors PostgREST filters: org + logical database + metadata.type in
 * table_overview | column only. Gold SQL and glossary rows must remain.
 */
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  removeTableSchemaSnapshot,
  type SchemaSnapshotDeletionAdmin,
} from './remove-schema-snapshot';

function openSqliteSchemaStore() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE table_schemas (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      schema TEXT NOT NULL
    );
    CREATE TABLE schema_chunks (
      id TEXT PRIMARY KEY,
      metadata TEXT NOT NULL
    );
    CREATE TABLE schema_sync_state (
      organization_id TEXT NOT NULL,
      database_name TEXT NOT NULL,
      PRIMARY KEY (organization_id, database_name)
    );
  `);
  return db;
}

function sqliteDeletionAdmin(db: Database.Database): SchemaSnapshotDeletionAdmin {
  return {
    async fetchSchemaRow(id) {
      const row = db
        .prepare('SELECT organization_id, schema FROM table_schemas WHERE id = ?')
        .get(id) as { organization_id: string; schema: string } | undefined;
      if (!row) return null;
      return { organization_id: row.organization_id, schema: JSON.parse(row.schema) };
    },
    async deleteSchemaRow(id, orgId) {
      // Match PostgREST: delete succeeds even when no rows match.
      db.prepare('DELETE FROM table_schemas WHERE id = ? AND organization_id = ?').run(id, orgId);
      return { error: null };
    },
    async listRemainingSchemaIdsForDatabase(orgId, databaseName) {
      try {
        const rows = db
          .prepare(
            `SELECT id FROM table_schemas
             WHERE organization_id = ?
               AND json_extract(schema, '$.database') = ?`,
          )
          .all(orgId, databaseName) as { id: string }[];
        return { ids: rows.map((r) => r.id), error: null };
      } catch (e) {
        return {
          ids: [],
          error: { message: e instanceof Error ? e.message : String(e) },
        };
      }
    },
    async deleteSchemaDerivedChunksForOrgDatabase(orgId, databaseName) {
      try {
        db.prepare(
          `DELETE FROM schema_chunks
           WHERE json_extract(metadata, '$.organization_id') = ?
             AND json_extract(metadata, '$.database') = ?
             AND json_extract(metadata, '$.type') IN ('table_overview', 'column')`,
        ).run(orgId, databaseName);
        return { error: null };
      } catch (e) {
        return { error: { message: e instanceof Error ? e.message : String(e) } };
      }
    },
    async deleteSyncStateForOrgDatabase(orgId, databaseName) {
      try {
        db.prepare(
          `DELETE FROM schema_sync_state
           WHERE organization_id = ? AND database_name = ?`,
        ).run(orgId, databaseName);
        return { error: null };
      } catch (e) {
        return { error: { message: e instanceof Error ? e.message : String(e) } };
      }
    },
  };
}

describe('removeTableSchemaSnapshot (SQLite)', () => {
  const org = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it('deletes only table_overview/column chunks for org+database; keeps gold_sql', async () => {
    db = openSqliteSchemaStore();
    db.prepare(
      'INSERT INTO table_schemas (id, organization_id, schema) VALUES (?, ?, ?)',
    ).run('snap-1', org, JSON.stringify({ database: 'shop', dialect: 'pg', tables: [] }));

    const metaOverview = JSON.stringify({
      organization_id: org,
      database: 'shop',
      type: 'table_overview',
      table: 'orders',
    });
    const metaGold = JSON.stringify({
      organization_id: org,
      database: 'shop',
      type: 'gold_sql',
      table: 'orders',
    });
    const metaOtherDb = JSON.stringify({
      organization_id: org,
      database: 'warehouse',
      type: 'gold_sql',
    });

    db.prepare('INSERT INTO schema_chunks (id, metadata) VALUES (?, ?)').run('t1', metaOverview);
    db.prepare('INSERT INTO schema_chunks (id, metadata) VALUES (?, ?)').run('g1', metaGold);
    db.prepare('INSERT INTO schema_chunks (id, metadata) VALUES (?, ?)').run('g2', metaOtherDb);

    db.prepare(
      'INSERT INTO schema_sync_state (organization_id, database_name) VALUES (?, ?)',
    ).run(org, 'shop');

    const admin = sqliteDeletionAdmin(db);

    const outcome = await removeTableSchemaSnapshot(admin, 'snap-1', org);
    expect(outcome).toEqual({ kind: 'success', removed_embeddings: true });

    const remaining = db.prepare('SELECT id FROM schema_chunks ORDER BY id').all() as { id: string }[];
    expect(remaining.map((r) => r.id)).toEqual(['g1', 'g2']);

    const syncLeft = db
      .prepare('SELECT COUNT(*) AS n FROM schema_sync_state')
      .get() as { n: number };
    expect(syncLeft.n).toBe(0);
  });

  it('keeps all chunks when a second snapshot still exists for the same logical database', async () => {
    db = openSqliteSchemaStore();
    for (const id of ['a', 'b']) {
      db.prepare(
        'INSERT INTO table_schemas (id, organization_id, schema) VALUES (?, ?, ?)',
      ).run(id, org, JSON.stringify({ database: 'shop', dialect: 'pg', tables: [] }));
    }
    db.prepare('INSERT INTO schema_chunks (id, metadata) VALUES (?, ?)').run(
      'g1',
      JSON.stringify({ organization_id: org, database: 'shop', type: 'glossary' }),
    );

    const admin = sqliteDeletionAdmin(db);

    const outcome = await removeTableSchemaSnapshot(admin, 'a', org);
    expect(outcome).toEqual({ kind: 'success', removed_embeddings: false });

    const n = db.prepare('SELECT COUNT(*) AS n FROM schema_chunks').get() as { n: number };
    expect(n.n).toBe(1);
  });
});
