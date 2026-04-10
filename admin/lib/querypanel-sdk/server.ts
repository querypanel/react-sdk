export function getQueryPanelSdkBaseUrl() {
  return (
    process.env.QUERYPANEL_SDK_API_URL ||
    process.env.SQL_AGENT_URL ||
    process.env.NEXT_PUBLIC_QUERYPANEL_SDK_URL ||
    "http://localhost:3001"
  ).replace(/\/+$/, "");
}

export function getQueryPanelServiceApiKey() {
  return process.env.SERVICE_API_KEY || process.env.SQL_AGENT_API_KEY || "";
}

export function getVercelProtectionBypassHeaders(): Record<string, string> {
  const secret = process.env.VERCEL_BYPASS_KEY || "";

  if (!secret) return {};
  return { "x-vercel-protection-bypass": secret };
}
