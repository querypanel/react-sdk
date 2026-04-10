-- Add OAuth support to available_mcps table
ALTER TABLE available_mcps ADD COLUMN IF NOT EXISTS oauth_config JSONB DEFAULT NULL;

-- Update Atlassian MCP with OAuth configuration
UPDATE available_mcps 
SET oauth_config = '{
  "provider": "atlassian",
  "auth_url": "https://auth.atlassian.com/authorize",
  "token_url": "https://auth.atlassian.com/oauth/token",
  "scopes": [
    "read:jira-user",
    "read:jira-work", 
    "write:jira-work",
    "read:confluence-content.all",
    "write:confluence-content",
    "offline_access"
  ],
  "client_id_env": "ATLASSIAN_CLIENT_ID",
  "client_secret_env": "ATLASSIAN_CLIENT_SECRET",
  "audience": "api.atlassian.com"
}'
WHERE name ILIKE '%atlassian%' OR name ILIKE '%jira%';

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_available_mcps_oauth_config ON available_mcps USING GIN (oauth_config);
CREATE INDEX IF NOT EXISTS idx_customer_mcps_envs ON customer_mcps USING GIN (envs);
