import crypto from 'node:crypto';

type BigQueryOAuthStatePayload = {
  datasourceId: string;
  organizationId: string;
  userId: string;
  ts: number;
  nonce: string;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

const DEFAULT_GOOGLE_BIGQUERY_SCOPES = [
  'https://www.googleapis.com/auth/bigquery',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getStateSecret(): string {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error('GOOGLE_OAUTH_STATE_SECRET is required');
  }
  return secret;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signState(payload: string): string {
  return crypto.createHmac('sha256', getStateSecret()).update(payload).digest('base64url');
}

export function buildGoogleBigQueryOAuthState(input: {
  datasourceId: string;
  organizationId: string;
  userId: string;
}): string {
  const payload: BigQueryOAuthStatePayload = {
    datasourceId: input.datasourceId,
    organizationId: input.organizationId,
    userId: input.userId,
    ts: Date.now(),
    nonce: crypto.randomUUID(),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signState(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function parseAndVerifyGoogleBigQueryOAuthState(
  rawState: string,
  maxAgeMs = 10 * 60 * 1000
): BigQueryOAuthStatePayload {
  const [encodedPayload, receivedSignature] = rawState.split('.');
  if (!encodedPayload || !receivedSignature) {
    throw new Error('Invalid OAuth state');
  }

  const expectedSignature = signState(encodedPayload);
  if (receivedSignature.length !== expectedSignature.length) {
    throw new Error('Invalid OAuth state signature');
  }
  const validSignature = crypto.timingSafeEqual(
    Buffer.from(receivedSignature),
    Buffer.from(expectedSignature)
  );
  if (!validSignature) {
    throw new Error('Invalid OAuth state signature');
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as BigQueryOAuthStatePayload;
  if (!payload?.datasourceId || !payload?.organizationId || !payload?.userId || !payload?.ts) {
    throw new Error('Invalid OAuth state payload');
  }
  if (Date.now() - payload.ts > maxAgeMs) {
    throw new Error('OAuth state expired');
  }
  return payload;
}

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth is not configured. Missing GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI');
  }
  const scopesRaw = process.env.GOOGLE_OAUTH_SCOPES;
  const scopes = scopesRaw
    ? scopesRaw.split(',').map((scope) => scope.trim()).filter(Boolean)
    : DEFAULT_GOOGLE_BIGQUERY_SCOPES;
  return { clientId, clientSecret, redirectUri, scopes };
}

export function buildGoogleAuthorizationUrl(state: string): string {
  const { clientId, redirectUri, scopes } = getGoogleOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Failed to exchange Google OAuth code: ${errorBody || response.statusText}`);
  }
  return response.json() as Promise<GoogleTokenResponse>;
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string | undefined> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    return undefined;
  }
  const data = await response.json() as { email?: string };
  return data.email;
}

export function isGoogleInvalidRaptError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as {
    message?: string;
    response?: {
      data?: {
        error?: string;
        error_description?: string;
        error_subtype?: string;
      };
    };
  };
  const subtype = err.response?.data?.error_subtype ?? '';
  const description = err.response?.data?.error_description ?? '';
  const message = err.message ?? '';
  return (
    subtype === 'invalid_rapt' ||
    description.toLowerCase().includes('invalid_rapt') ||
    message.toLowerCase().includes('invalid_rapt') ||
    description.toLowerCase().includes('reauth related error')
  );
}
