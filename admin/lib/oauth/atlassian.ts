interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface AtlassianSite {
  id: string;
  url: string;
  name: string;
  scopes: string[];
  avatarUrl: string;
}

export class AtlassianOAuth {
  /**
   * Refresh an expired access token using the refresh token
   */
  static async refreshToken(
    refreshToken: string, 
    clientIdEnv: string = 'ATLASSIAN_CLIENT_ID',
    clientSecretEnv: string = 'ATLASSIAN_CLIENT_SECRET'
  ): Promise<TokenResponse> {
    const clientId = process.env[clientIdEnv];
    const clientSecret = process.env[clientSecretEnv];

    if (!clientId || !clientSecret) {
      throw new Error(`Missing OAuth credentials: ${clientIdEnv} or ${clientSecretEnv}`);
    }

    const response = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    return response.json();
  }

  /**
   * Get user's accessible Atlassian sites
   */
  static async getAccessibleSites(accessToken: string): Promise<AtlassianSite[]> {
    const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch accessible sites');
    }

    return response.json();
  }

  /**
   * Get user information from Atlassian
   */
  static async getUserInfo(accessToken: string): Promise<{ email: string; name: string }> {
    const response = await fetch('https://api.atlassian.com/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }

    return response.json();
  }

  /**
   * Check if a token is still valid (with 5 minute buffer)
   */
  static isTokenValid(expiresAt: string): boolean {
    const expirationTime = new Date(expiresAt).getTime();
    const currentTime = Date.now();
    const fiveMinutesInMs = 5 * 60 * 1000;
    
    return expirationTime > (currentTime + fiveMinutesInMs);
  }

  /**
   * Ensure a valid access token, refreshing if necessary
   */
  static async ensureValidToken(mcpConnection: {
    envs: Record<string, unknown>;
  }): Promise<string> {
    const { 
      ATLASSIAN_OAUTH_ACCESS_TOKEN: accessToken, // Using correct OAuth token field
      OAUTH_REFRESH_TOKEN: refreshToken,
      OAUTH_EXPIRES_AT: expiresAt
    } = mcpConnection.envs;

    if (typeof accessToken !== 'string' || !accessToken) {
      throw new Error('No access token found');
    }

    if (typeof expiresAt === 'string' && this.isTokenValid(expiresAt)) {
      return accessToken;
    }

    // Token is expired or about to expire, refresh it
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new Error('No refresh token available');
    }

    const newTokens = await this.refreshToken(refreshToken);
    
    // Return the new access token (caller should update storage)
    return newTokens.access_token;
  }

  /**
   * Transform OAuth tokens to correct Atlassian MCP format
   */
  static transformToMcpConfig(
    tokens: TokenResponse,
    site: AtlassianSite
  ): Record<string, string> {
    return {
      // Correct Atlassian OAuth MCP environment variables
      JIRA_URL: site.url,
      CONFLUENCE_URL: `${site.url}/wiki`,
      ATLASSIAN_OAUTH_CLOUD_ID: site.id,
      ATLASSIAN_OAUTH_ACCESS_TOKEN: tokens.access_token,
      
      // OAuth management fields
      OAUTH_REFRESH_TOKEN: tokens.refresh_token,
      OAUTH_SITE_ID: site.id,
      OAUTH_EXPIRES_AT: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
      OAUTH_PROVIDER: 'atlassian'
    };
  }
}
