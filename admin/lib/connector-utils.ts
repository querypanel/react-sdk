import { decrypt } from './encryption';

export interface DecryptedConnector {
  id: string;
  user_id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  auth_method: string;
  ssl_enabled: boolean;
  additional_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  last_tested_at?: string;
  aws_region?: string;
  aws_access_key_id?: string;
  aws_secret_access_key?: string;
  aws_session_token?: string;
  iam_role_arn?: string;
}

export function decryptConnector(connector: Record<string, unknown>): DecryptedConnector {
  const decrypted: DecryptedConnector = {
    id: connector.id as string,
    user_id: connector.user_id as string,
    name: connector.name as string,
    type: connector.type as string,
    host: connector.host as string,
    port: connector.port as number,
    database: connector.database as string,
    username: connector.username as string,
    auth_method: connector.auth_method as string,
    ssl_enabled: connector.ssl_enabled as boolean,
    additional_config: connector.additional_config as Record<string, unknown>,
    created_at: connector.created_at as string,
    updated_at: connector.updated_at as string,
    is_active: connector.is_active as boolean,
    last_tested_at: connector.last_tested_at as string | undefined,
  };

  // Decrypt password if present
  if (connector.password) {
    try {
      decrypted.password = decrypt(connector.password as string);
    } catch (error) {
      console.error('Failed to decrypt password:', error);
      throw new Error('Failed to decrypt password');
    }
  }

  // Decrypt AWS credentials if present
  if (connector.aws_access_key_id) {
    try {
      decrypted.aws_access_key_id = decrypt(connector.aws_access_key_id as string);
    } catch (error) {
      console.error('Failed to decrypt AWS access key ID:', error);
      throw new Error('Failed to decrypt AWS access key ID');
    }
  }

  if (connector.aws_secret_access_key) {
    try {
      decrypted.aws_secret_access_key = decrypt(connector.aws_secret_access_key as string);
    } catch (error) {
      console.error('Failed to decrypt AWS secret access key:', error);
      throw new Error('Failed to decrypt AWS secret access key');
    }
  }

  if (connector.aws_session_token) {
    try {
      decrypted.aws_session_token = decrypt(connector.aws_session_token as string);
    } catch (error) {
      console.error('Failed to decrypt AWS session token:', error);
      throw new Error('Failed to decrypt AWS session token');
    }
  }

  // Non-sensitive fields
  if (connector.aws_region) {
    decrypted.aws_region = connector.aws_region as string;
  }

  if (connector.iam_role_arn) {
    decrypted.iam_role_arn = connector.iam_role_arn as string;
  }

  return decrypted;
}
