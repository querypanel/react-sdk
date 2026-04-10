-- Drop the connector_credentials table and related objects

-- Drop policies
DROP POLICY IF EXISTS "connector_credentials_select" ON connector_credentials;
DROP POLICY IF EXISTS "connector_credentials_insert" ON connector_credentials;
DROP POLICY IF EXISTS "connector_credentials_update" ON connector_credentials;
DROP POLICY IF EXISTS "connector_credentials_delete" ON connector_credentials;
DROP POLICY IF EXISTS "connector_credentials_modify" ON connector_credentials;

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_update_connector_credentials_updated_at ON connector_credentials;

-- Drop function
DROP FUNCTION IF EXISTS update_connector_credentials_updated_at();

-- Drop table
DROP TABLE IF EXISTS connector_credentials;

-- Drop indexes (they will be dropped with the table, but we can be explicit)
DROP INDEX IF EXISTS idx_connector_credentials_user_id;
DROP INDEX IF EXISTS idx_connector_credentials_type;
DROP INDEX IF EXISTS idx_connector_credentials_auth_method;
DROP INDEX IF EXISTS idx_connector_credentials_active;
DROP INDEX IF EXISTS idx_connector_credentials_aws_region;
DROP INDEX IF EXISTS idx_connector_credentials_org_id;

COMMENT ON SCHEMA public IS 'Removed connector_credentials table - no longer needed';

