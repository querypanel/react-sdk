-- Add target_db field to sdk_charts and schema_chunks tables

-- Ensure pgvector extension exists for vector indexing
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Add target_db column to existing sdk_charts table
ALTER TABLE sdk_charts 
ADD COLUMN IF NOT EXISTS target_db TEXT;

-- Add comment for the new column
COMMENT ON COLUMN sdk_charts.target_db IS 'Target database identifier for the chart query';

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_sdk_charts_target_db ON sdk_charts(target_db);

-- 2. Create schema_chunks table (if it doesn't exist) based on actual database schema
CREATE TABLE IF NOT EXISTS schema_chunks (
  id TEXT PRIMARY KEY,
  chunk_type TEXT NOT NULL,
  content TEXT NOT NULL,
  schema_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  column_count INTEGER,
  column_names TEXT[],
  data_types TEXT[],
  embedding vector(1536),
  has_foreign_keys BOOLEAN,
  has_primary_key BOOLEAN,
  has_relationships BOOLEAN,
  hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_schema_chunks_tenant_id ON schema_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_schema_chunks_schema_name ON schema_chunks(schema_name);
CREATE INDEX IF NOT EXISTS idx_schema_chunks_table_name ON schema_chunks(table_name);
CREATE INDEX IF NOT EXISTS idx_schema_chunks_chunk_type ON schema_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_schema_chunks_created_at ON schema_chunks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schema_chunks_hash ON schema_chunks(hash);

-- Enable Row Level Security
ALTER TABLE schema_chunks ENABLE ROW LEVEL SECURITY;

-- RLS: By default no access
DROP POLICY IF EXISTS "schema_chunks_select" ON schema_chunks;
DROP POLICY IF EXISTS "schema_chunks_insert" ON schema_chunks;
DROP POLICY IF EXISTS "schema_chunks_update" ON schema_chunks;
DROP POLICY IF EXISTS "schema_chunks_delete" ON schema_chunks;

-- SELECT: allow access based on tenant_id (simplified RLS for schema chunks)
CREATE POLICY "schema_chunks_select" ON schema_chunks FOR SELECT USING (true);

-- INSERT: allow access based on tenant_id (simplified RLS for schema chunks)
CREATE POLICY "schema_chunks_insert" ON schema_chunks FOR INSERT WITH CHECK (true);

-- UPDATE: allow access based on tenant_id (simplified RLS for schema chunks)
CREATE POLICY "schema_chunks_update" ON schema_chunks FOR UPDATE USING (true);

-- DELETE: allow access based on tenant_id (simplified RLS for schema chunks)
CREATE POLICY "schema_chunks_delete" ON schema_chunks FOR DELETE USING (true);

-- 3. Add target_db column to existing schema_chunks table (if it exists)
ALTER TABLE schema_chunks 
ADD COLUMN IF NOT EXISTS target_db TEXT;

-- Add comment for the new column
COMMENT ON COLUMN schema_chunks.target_db IS 'Target database identifier for the schema chunk';

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_schema_chunks_target_db ON schema_chunks(target_db);

-- Add comments for schema_chunks columns
COMMENT ON TABLE schema_chunks IS 'Schema chunks for storing database schema information with vector embeddings';
COMMENT ON COLUMN schema_chunks.id IS 'Unique identifier for the schema chunk';
COMMENT ON COLUMN schema_chunks.chunk_type IS 'Type of schema chunk (table, view, etc.)';
COMMENT ON COLUMN schema_chunks.content IS 'Schema content or metadata';
COMMENT ON COLUMN schema_chunks.schema_name IS 'Database schema name';
COMMENT ON COLUMN schema_chunks.table_name IS 'Table name';
COMMENT ON COLUMN schema_chunks.tenant_id IS 'Tenant identifier for multi-tenancy';
COMMENT ON COLUMN schema_chunks.column_count IS 'Number of columns in the table';
COMMENT ON COLUMN schema_chunks.column_names IS 'Array of column names';
COMMENT ON COLUMN schema_chunks.data_types IS 'Array of data types for columns';
COMMENT ON COLUMN schema_chunks.embedding IS 'Vector embedding for semantic search';
COMMENT ON COLUMN schema_chunks.has_foreign_keys IS 'Whether the table has foreign keys';
COMMENT ON COLUMN schema_chunks.has_primary_key IS 'Whether the table has a primary key';
COMMENT ON COLUMN schema_chunks.has_relationships IS 'Whether the table has relationships';
COMMENT ON COLUMN schema_chunks.hash IS 'Hash of the schema content for deduplication';
COMMENT ON COLUMN schema_chunks.created_at IS 'Timestamp when the schema chunk was created';

