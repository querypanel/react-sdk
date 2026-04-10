-- Create connector credentials table for managing database connections
CREATE TABLE IF NOT EXISTS connector_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('postgresql', 'clickhouse', 'snowflake', 'mysql', 'mongodb')),
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  database TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT, -- Made optional for IAM auth
  auth_method TEXT DEFAULT 'password' CHECK (auth_method IN ('password', 'iam', 'oauth')),
  ssl_enabled BOOLEAN DEFAULT true,
  additional_config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  last_tested_at TIMESTAMP WITH TIME ZONE,
  -- AWS IAM specific fields
  aws_region TEXT,
  aws_access_key_id TEXT,
  aws_secret_access_key TEXT,
  aws_session_token TEXT,
  iam_role_arn TEXT,
  UNIQUE(user_id, name)
);

-- Add constraints for authentication method validation
ALTER TABLE connector_credentials 
ADD CONSTRAINT check_password_required_for_password_auth 
CHECK (
  (auth_method = 'password' AND password IS NOT NULL) OR 
  (auth_method != 'password')
);

ALTER TABLE connector_credentials 
ADD CONSTRAINT check_aws_credentials_required_for_iam_auth 
CHECK (
  (auth_method = 'iam' AND aws_region IS NOT NULL AND aws_access_key_id IS NOT NULL AND aws_secret_access_key IS NOT NULL) OR 
  (auth_method != 'iam')
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_connector_credentials_user_id ON connector_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_connector_credentials_type ON connector_credentials(type);
CREATE INDEX IF NOT EXISTS idx_connector_credentials_auth_method ON connector_credentials(auth_method);
CREATE INDEX IF NOT EXISTS idx_connector_credentials_active ON connector_credentials(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_connector_credentials_aws_region ON connector_credentials(aws_region) WHERE aws_region IS NOT NULL;

-- Enable RLS
ALTER TABLE connector_credentials ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own connector credentials" ON connector_credentials
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own connector credentials" ON connector_credentials
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connector credentials" ON connector_credentials
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own connector credentials" ON connector_credentials
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_connector_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_connector_credentials_updated_at
  BEFORE UPDATE ON connector_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_connector_credentials_updated_at();