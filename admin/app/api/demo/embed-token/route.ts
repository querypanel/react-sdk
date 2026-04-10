import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Demo defaults (kept in code intentionally for local demo UX).
const HARDCODED_DEMO_ORGANIZATION_ID = "02fbbef9-c692-494c-aa53-8e8202829aad";
const HARDCODED_DEMO_PRIVATE_KEY =
  "-----BEGIN PRIVATE KEY-----\n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\nbKAhGPeXR7C8RGog+i0BcqmVCrFJeg==\n-----END PRIVATE KEY-----\n";

interface TokenRequestBody {
  tenantId?: string;
  userId?: string;
}

function base64UrlEncodeString(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return base64UrlEncodeBytes(bytes);
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function privateKeyToArrayBuffer(privateKeyPem: string): ArrayBuffer {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKeyPem
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");

  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

async function signJwtRS256(
  privateKeyPem: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const encodedHeader = base64UrlEncodeString(JSON.stringify(header));
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyToArrayBuffer(privateKeyPem),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const dataBytes = new TextEncoder().encode(data);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    signingKey,
    dataBytes,
  );
  const encodedSignature = base64UrlEncodeBytes(new Uint8Array(signature));
  return `${data}.${encodedSignature}`;
}

function resolveApiBaseUrl(): string | null {
  return (
    process.env.SQL_AGENT_URL ||
    process.env.QUERYPANEL_SDK_API_URL ||
    process.env.NEXT_PUBLIC_QUERYPANEL_SDK_URL ||
    null
  );
}

function resolveOrganizationId(): string | null {
  return (
    HARDCODED_DEMO_ORGANIZATION_ID ||
    process.env.DEMO_QP_ORGANIZATION_ID ||
    process.env.ORGANIZATION_ID ||
    null
  );
}

function resolvePrivateKey(): string | null {
  return (
    HARDCODED_DEMO_PRIVATE_KEY ||
    process.env.DEMO_QP_PRIVATE_KEY ||
    process.env.QUERYPANEL_SDK_PRIVATE_KEY ||
    null
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as TokenRequestBody;
    const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    const organizationId = resolveOrganizationId();
    const privateKeyRaw = resolvePrivateKey();
    const apiBaseUrl = resolveApiBaseUrl();

    if (!organizationId) {
      throw new Error(
        "Missing organization ID. Set DEMO_QP_ORGANIZATION_ID or ORGANIZATION_ID",
      );
    }
    if (!privateKeyRaw) {
      throw new Error(
        "Missing private key. Set DEMO_QP_PRIVATE_KEY or QUERYPANEL_SDK_PRIVATE_KEY",
      );
    }
    if (!apiBaseUrl) {
      throw new Error(
        "Missing API base URL. Set SQL_AGENT_URL (preferred) or QUERYPANEL_SDK_API_URL/NEXT_PUBLIC_QUERYPANEL_SDK_URL",
      );
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
    const payload: Record<string, unknown> = {
      organizationId,
      tenantId,
    };
    if (userId) {
      payload.userId = userId;
    }

    const token = await signJwtRS256(privateKey, payload);

    return NextResponse.json({
      success: true,
      token,
      tenantId,
      organizationId,
      apiBaseUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Demo embed token error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
