"use client";

import { useId } from 'react';
import type { SVGProps } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.2 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.6 14.5 2.8 12 2.8 7.1 2.8 3.1 6.8 3.1 11.7s4 8.9 8.9 8.9c5.1 0 8.5-3.6 8.5-8.6 0-.6-.1-1.1-.2-1.8H12z" />
      <path fill="#34A853" d="M3.1 7.4l3.2 2.4c.9-2 3-3.8 5.7-3.8 1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.6 14.5 2.8 12 2.8c-3.7 0-6.8 2.1-8.4 4.6-.3.5-.4 1.1-.5 1.7z" />
      <path fill="#4A90E2" d="M12 20.6c2.4 0 4.4-.8 5.9-2.2l-2.7-2.2c-.8.6-1.8 1-3.2 1-3.6 0-5.2-2.4-5.4-3.6l-3.2 2.5c1.4 2.8 4.5 4.5 8.6 4.5z" />
      <path fill="#FBBC05" d="M6.6 13.6c-.1-.4-.2-.8-.2-1.3 0-.4.1-.9.2-1.3L3.4 8.5c-.4.9-.6 1.9-.6 2.9 0 1.1.2 2.1.7 3.1l3.1-2.9z" />
    </svg>
  );
}

export type DatasourceFormState = {
  name: string;
  dialect: 'postgres' | 'clickhouse' | 'bigquery';
  host: string;
  port: string;
  database_name: string;
  username: string;
  password: string;
  bigquery_project_id: string;
  bigquery_dataset_project_id: string;
  bigquery_location: string;
  bigquery_auth_mode: 'google_oauth';
  ssl_mode: string;
  use_iam_auth: boolean;
  aws_region: string;
  aws_role_arn: string;
  tenant_field_name: string;
  tenant_field_type: 'String' | 'Number' | 'UUID';
};

type DatasourceFormProps = {
  value: DatasourceFormState;
  onChange: (patch: Partial<DatasourceFormState>) => void;
  onSave: () => void;
  onDelete?: () => void;
  onTest?: () => void;
  isSaving: boolean;
  isTesting: boolean;
  isNew: boolean;
  hasPassword: boolean;
  bigQueryOAuthStatus?: {
    connected: boolean;
    expired: boolean;
    subjectEmail: string | null;
    expiresAt: string | null;
  } | null;
  isOAuthLoading?: boolean;
  onConnectGoogleOAuth?: () => void;
  onDisconnectGoogleOAuth?: () => void;
};

export function DatasourceForm({
  value,
  onChange,
  onSave,
  onDelete,
  onTest,
  isSaving,
  isTesting,
  isNew,
  hasPassword,
  bigQueryOAuthStatus,
  isOAuthLoading = false,
  onConnectGoogleOAuth,
  onDisconnectGoogleOAuth,
}: DatasourceFormProps) {
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const hostId = `${baseId}-host`;
  const portId = `${baseId}-port`;
  const databaseId = `${baseId}-database`;
  const usernameId = `${baseId}-username`;
  const passwordId = `${baseId}-password`;
  const bigQueryProjectId = `${baseId}-bigquery-project-id`;
  const bigQueryDatasetProjectId = `${baseId}-bigquery-dataset-project-id`;
  const bigQueryLocationId = `${baseId}-bigquery-location`;
  const regionId = `${baseId}-region`;
  const roleId = `${baseId}-role`;
  const tenantFieldNameId = `${baseId}-tenant-field-name`;
  const tenantFieldTypeId = `${baseId}-tenant-field-type`;
  const isBigQuery = value.dialect === 'bigquery';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            value={value.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Primary analytics DB"
          />
        </div>

        <div className={cn("gap-4", isBigQuery ? "grid grid-cols-1" : "grid grid-cols-1 md:grid-cols-2")}>
          <div className="space-y-2">
            <Label>Dialect</Label>
            <Select value={value.dialect} onValueChange={(dialect) => onChange({ dialect: dialect as DatasourceFormState['dialect'] })}>
              <SelectTrigger>
                <SelectValue placeholder="Select dialect" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="postgres">Postgres</SelectItem>
                <SelectItem value="clickhouse">ClickHouse</SelectItem>
                <SelectItem value="bigquery">BigQuery</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!isBigQuery && (
            <div className="space-y-2">
              <Label>SSL Mode</Label>
              <Select value={value.ssl_mode} onValueChange={(ssl_mode) => onChange({ ssl_mode })}>
                <SelectTrigger>
                  <SelectValue placeholder="SSL mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="require">Require</SelectItem>
                  <SelectItem value="disable">Disable</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={databaseId}>{isBigQuery ? 'Dataset' : 'Database'}</Label>
          <Input
            id={databaseId}
            value={value.database_name}
            onChange={(event) => onChange({ database_name: event.target.value })}
            placeholder={
              isBigQuery
                ? 'analytics'
                : value.dialect === 'clickhouse'
                  ? 'default'
                  : 'analytics'
            }
          />
        </div>

        {isBigQuery ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor={bigQueryProjectId}>Project ID</Label>
                <Input
                  id={bigQueryProjectId}
                  value={value.bigquery_project_id}
                  onChange={(event) => onChange({ bigquery_project_id: event.target.value })}
                  placeholder="my-gcp-project"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={bigQueryDatasetProjectId}>Dataset Project ID (optional)</Label>
                <Input
                  id={bigQueryDatasetProjectId}
                  value={value.bigquery_dataset_project_id}
                  onChange={(event) => onChange({ bigquery_dataset_project_id: event.target.value })}
                  placeholder="bigquery-public-data"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={bigQueryLocationId}>Location (optional)</Label>
                <Input
                  id={bigQueryLocationId}
                  value={value.bigquery_location}
                  onChange={(event) => onChange({ bigquery_location: event.target.value })}
                  placeholder="US"
                />
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Google OAuth Connection</p>
                  <p className="text-xs text-muted-foreground">
                    {bigQueryOAuthStatus?.connected
                      ? bigQueryOAuthStatus.expired
                        ? 'Connection expired. Reconnect to continue querying.'
                        : `Connected${bigQueryOAuthStatus.subjectEmail ? ` as ${bigQueryOAuthStatus.subjectEmail}` : ''}`
                      : 'Not connected'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onConnectGoogleOAuth}
                    disabled={isOAuthLoading || !onConnectGoogleOAuth}
                  >
                    <GoogleIcon className="mr-2 h-4 w-4" />
                    {bigQueryOAuthStatus?.connected ? 'Reconnect' : 'Connect Google'}
                  </Button>
                  {bigQueryOAuthStatus?.connected && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={onDisconnectGoogleOAuth}
                      disabled={isOAuthLoading || !onDisconnectGoogleOAuth}
                    >
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
              {bigQueryOAuthStatus?.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  Token expires at: {new Date(bigQueryOAuthStatus.expiresAt).toLocaleString()}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={hostId}>Host</Label>
                <Input
                  id={hostId}
                  value={value.host}
                  onChange={(event) => onChange({ host: event.target.value })}
                  placeholder="db.example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={portId}>Port</Label>
                <Input
                  id={portId}
                  value={value.port}
                  onChange={(event) => onChange({ port: event.target.value })}
                  placeholder={value.dialect === 'clickhouse' ? '8123' : '5432'}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={usernameId}>Username</Label>
                <Input
                  id={usernameId}
                  value={value.username}
                  onChange={(event) => onChange({ username: event.target.value })}
                  placeholder="db_user"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={passwordId}>Password</Label>
                <Input
                  id={passwordId}
                  type="password"
                  value={value.password}
                  onChange={(event) => onChange({ password: event.target.value })}
                  placeholder={hasPassword && !value.password ? 'Password saved' : 'Enter password'}
                  disabled={value.use_iam_auth}
                />
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={tenantFieldNameId}>Tenant field name (optional)</Label>
            <Input
              id={tenantFieldNameId}
              value={value.tenant_field_name}
              onChange={(event) => onChange({ tenant_field_name: event.target.value })}
              placeholder="tenant_id"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={tenantFieldTypeId}>Tenant field type</Label>
            <Select
              value={value.tenant_field_type}
              onValueChange={(tenant_field_type) =>
                onChange({ tenant_field_type: tenant_field_type as DatasourceFormState['tenant_field_type'] })
              }
            >
              <SelectTrigger id={tenantFieldTypeId}>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="String">String</SelectItem>
                <SelectItem value="Number">Number</SelectItem>
                <SelectItem value="UUID">UUID</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {!isBigQuery && (
          <>
            <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">AWS IAM Auth</p>
                <p className="text-xs text-muted-foreground">Generate tokens for RDS connections</p>
              </div>
              <Switch
                checked={value.use_iam_auth}
                onCheckedChange={(checked) => onChange({ use_iam_auth: checked })}
              />
            </div>

            <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", !value.use_iam_auth && "opacity-50 pointer-events-none")}>
              <div className="space-y-2">
                <Label htmlFor={regionId}>AWS Region</Label>
                <Input
                  id={regionId}
                  value={value.aws_region}
                  onChange={(event) => onChange({ aws_region: event.target.value })}
                  placeholder="us-east-1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={roleId}>Role ARN (optional)</Label>
                <Input
                  id={roleId}
                  value={value.aws_role_arn}
                  onChange={(event) => onChange({ aws_role_arn: event.target.value })}
                  placeholder="arn:aws:iam::123456789012:role/db-access"
                />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {onTest && (
          <Button variant="outline" onClick={onTest} disabled={isTesting || isNew}>
            {isTesting ? 'Testing...' : 'Test connection'}
          </Button>
        )}
        <Button
          onClick={onSave}
          disabled={isSaving}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
        >
          {isSaving ? 'Saving...' : isNew ? 'Create datasource' : 'Save changes'}
        </Button>
        {onDelete && (
          <Button variant="destructive" onClick={onDelete} disabled={isSaving || isTesting}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
