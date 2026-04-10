import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createVaultSecret } from '@/lib/services/datasource.service';
import {
  exchangeGoogleCodeForTokens,
  fetchGoogleUserEmail,
  parseAndVerifyGoogleBigQueryOAuthState,
} from '@/lib/oauth/google-bigquery';

type BigQueryMeta = {
  authMode?: 'google_oauth';
  projectId?: string;
  datasetProjectId?: string;
  location?: string;
  credentialsSecretId?: string;
  oauth?: {
    refreshTokenSecretId?: string;
    accessTokenSecretId?: string;
    expiresAt?: string;
    subjectEmail?: string;
    scopes?: string[];
    tokenUri?: string;
  };
};

function normalizeBigQueryMeta(value: unknown): BigQueryMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as BigQueryMeta;
}

function redirectWithStatus(request: NextRequest, status: 'success' | 'error', datasourceId?: string, message?: string) {
  const url = new URL('/dashboard/datasources', request.url);
  url.searchParams.set('oauth', status);
  if (datasourceId) url.searchParams.set('datasourceId', datasourceId);
  if (message) url.searchParams.set('oauthMessage', message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const error = searchParams.get('error');
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (error) {
      return redirectWithStatus(request, 'error', undefined, error);
    }
    if (!code || !state) {
      return redirectWithStatus(request, 'error', undefined, 'missing_code_or_state');
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return redirectWithStatus(request, 'error', undefined, 'unauthorized');
    }

    const parsedState = parseAndVerifyGoogleBigQueryOAuthState(state);
    if (parsedState.userId !== user.id) {
      return redirectWithStatus(request, 'error', parsedState.datasourceId, 'state_user_mismatch');
    }

    const organizationId = parsedState.organizationId;

    const admin = createAdminClient();
    const { data: datasource, error: datasourceError } = await admin
      .from('datasources')
      .select('id, name, dialect, organization_id, bigquery_meta, bigquery_project_id, bigquery_dataset_project_id, bigquery_location')
      .eq('id', parsedState.datasourceId)
      .eq('organization_id', organizationId)
      .single();
    if (datasourceError || !datasource || datasource.dialect !== 'bigquery') {
      return redirectWithStatus(request, 'error', parsedState.datasourceId, 'datasource_not_found');
    }

    const tokenResponse = await exchangeGoogleCodeForTokens(code);
    const subjectEmail = await fetchGoogleUserEmail(tokenResponse.access_token);
    const currentMeta = normalizeBigQueryMeta(datasource.bigquery_meta);
    // Vault secret names must be unique; reconnect would reuse the same slug and fail create_secret.
    const refreshTokenSecretId = tokenResponse.refresh_token
      ? await createVaultSecret(
          tokenResponse.refresh_token,
          `${datasource.name}-bigquery-oauth-refresh-${randomUUID()}`,
          `Google OAuth refresh token for BigQuery datasource ${datasource.name}`
        )
      : currentMeta.oauth?.refreshTokenSecretId;

    if (!refreshTokenSecretId) {
      return redirectWithStatus(request, 'error', parsedState.datasourceId, 'missing_refresh_token');
    }

    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString();
    const scopes =
      typeof tokenResponse.scope === 'string'
        ? tokenResponse.scope.split(' ').filter(Boolean)
        : currentMeta.oauth?.scopes;

    const updatedMeta: BigQueryMeta = {
      ...currentMeta,
      authMode: 'google_oauth',
      projectId: currentMeta.projectId ?? datasource.bigquery_project_id ?? undefined,
      datasetProjectId:
        currentMeta.datasetProjectId ??
        datasource.bigquery_dataset_project_id ??
        datasource.bigquery_project_id ??
        undefined,
      location: currentMeta.location ?? datasource.bigquery_location ?? undefined,
      oauth: {
        ...(currentMeta.oauth ?? {}),
        refreshTokenSecretId,
        expiresAt,
        subjectEmail: subjectEmail ?? currentMeta.oauth?.subjectEmail,
        scopes,
        tokenUri: 'https://oauth2.googleapis.com/token',
      },
    };

    const { data: updatedDatasource, error: updateError } = await admin
      .from('datasources')
      .update({
        bigquery_meta: updatedMeta,
      })
      .eq('id', datasource.id)
      .eq('organization_id', organizationId)
      .select('id, bigquery_meta')
      .single();

    if (updateError || !updatedDatasource) {
      console.error('BIGQUERY_OAUTH_CALLBACK_PERSIST_FAILED', {
        organizationId,
        datasourceId: datasource.id,
        hasUpdateError: Boolean(updateError),
        updateError,
      });
      return redirectWithStatus(request, 'error', parsedState.datasourceId, 'failed_to_store_oauth');
    }

    const persistedMeta = normalizeBigQueryMeta(updatedDatasource.bigquery_meta);
    if (
      persistedMeta.authMode !== 'google_oauth' ||
      !persistedMeta.oauth?.refreshTokenSecretId
    ) {
      console.error('BIGQUERY_OAUTH_CALLBACK_PERSIST_MISMATCH', {
        organizationId,
        datasourceId: datasource.id,
        persistedAuthMode: persistedMeta.authMode,
        hasRefreshTokenSecretId: Boolean(persistedMeta.oauth?.refreshTokenSecretId),
      });
      return redirectWithStatus(request, 'error', parsedState.datasourceId, 'oauth_persist_mismatch');
    }

    console.info('BIGQUERY_OAUTH_CALLBACK_PERSIST_SUCCESS', {
      organizationId,
      datasourceId: datasource.id,
      subjectEmail: persistedMeta.oauth?.subjectEmail,
    });

    return redirectWithStatus(request, 'success', parsedState.datasourceId);
  } catch (err) {
    console.error('GET /api/datasources/oauth/bigquery/callback exception:', err);
    const message = err instanceof Error ? err.message : 'oauth_callback_failed';
    return redirectWithStatus(request, 'error', undefined, message);
  }
}
