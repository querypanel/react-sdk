import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveOrganizationIdForRequest } from "@/lib/supabase/organization";
import {
  getQueryPanelSdkBaseUrl,
  getQueryPanelServiceApiKey,
  getVercelProtectionBypassHeaders,
} from "@/lib/querypanel-sdk/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_STREAM_CONTENT_TYPE = "text/event-stream";

function getSdkStreamUrl() {
  return `${getQueryPanelSdkBaseUrl()}/api/agents/sql-agent/stream`;
}

function getSdkApiKey() {
  return getQueryPanelServiceApiKey();
}

function normalizeMastraMessages(body: {
  messages?: unknown;
  prompt?: unknown;
  conversationHistory?: unknown;
}) {
  if (typeof body.messages === "string" || Array.isArray(body.messages)) {
    return body.messages;
  }

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  if (Array.isArray(body.conversationHistory)) {
    for (const turn of body.conversationHistory) {
      if (!turn || typeof turn !== "object") continue;

      const role = "role" in turn ? turn.role : undefined;
      const content = "content" in turn ? turn.content : undefined;
      const prompt = "prompt" in turn ? turn.prompt : undefined;
      const response = "response" in turn ? turn.response : undefined;

      if (
        (role === "user" || role === "assistant") &&
        typeof content === "string" &&
        content.trim().length > 0
      ) {
        messages.push({ role, content: content.trim() });
        continue;
      }

      if (typeof prompt === "string" && prompt.trim().length > 0) {
        messages.push({ role: "user", content: prompt.trim() });
      }

      if (typeof response === "string" && response.trim().length > 0) {
        messages.push({ role: "assistant", content: response.trim() });
      }
    }
  }

  if (typeof body.prompt === "string" && body.prompt.trim().length > 0) {
    messages.push({ role: "user", content: body.prompt.trim() });
  }

  if (messages.length === 0) {
    return undefined;
  }

  return messages.length === 1 ? messages[0]?.content : messages;
}

function cloneStreamHeaders(headers: Headers) {
  const responseHeaders = new Headers();

  const contentType = headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);

  const cacheControl = headers.get("cache-control");
  if (cacheControl) responseHeaders.set("cache-control", cacheControl);

  const connection = headers.get("connection");
  if (connection) responseHeaders.set("connection", connection);

  const accelBuffering = headers.get("x-accel-buffering");
  if (accelBuffering) responseHeaders.set("x-accel-buffering", accelBuffering);

  return responseHeaders;
}

function normalizeMastraStreamChunk(chunk: {
  type?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}) {
  const normalized =
    chunk.payload && typeof chunk.payload === "object"
      ? { ...chunk, ...chunk.payload }
      : { ...chunk };

  delete normalized.payload;

  if (
    normalized.type === "text-delta" &&
    typeof normalized.textDelta !== "string" &&
    typeof normalized.text === "string"
  ) {
    normalized.textDelta = normalized.text;
  }

  if (
    normalized.type === "step-finish" &&
    !normalized.response &&
    Array.isArray(normalized.messages)
  ) {
    normalized.response = { messages: normalized.messages };
  }

  return normalized;
}

function normalizePreviewSpecData(
  spec: Record<string, unknown>,
  fallbackRows: Array<Record<string, unknown>>,
) {
  const rawData = spec.data;
  const rawDataRecord =
    rawData && typeof rawData === "object" && !Array.isArray(rawData)
      ? (rawData as { values?: unknown })
      : null;
  const embeddedValues =
    rawDataRecord && Array.isArray(rawDataRecord.values)
      ? (rawDataRecord.values as Array<Record<string, unknown>>)
      : undefined;

  if (spec.kind === "chart") {
    const normalizedRows = Array.isArray(rawData)
      ? rawData
      : embeddedValues ?? fallbackRows;

    return {
      ...spec,
      data: normalizedRows,
    };
  }

  if (embeddedValues) {
    return spec;
  }

  if (Array.isArray(rawData)) {
    return {
      ...spec,
      data: { values: rawData },
    };
  }

  if (fallbackRows.length === 0) {
    return spec;
  }

  return {
    ...spec,
    data: { values: fallbackRows },
  };
}

function createPreviewEnrichedStream(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let lastRows: Array<Record<string, unknown>> = [];

  const rewriteEvent = (rawEvent: string) => {
    if (!rawEvent.trim()) return rawEvent;

    const lines = rawEvent.split("\n");
    const dataLines: string[] = [];
    const otherLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      } else {
        otherLines.push(line);
      }
    }

    if (dataLines.length === 0) {
      return rawEvent;
    }

    const payload = dataLines.join("\n");
    if (payload === "[DONE]") {
      return rawEvent;
    }

    try {
      const chunk = normalizeMastraStreamChunk(JSON.parse(payload) as {
        type?: string;
        toolName?: string;
        result?: Record<string, unknown>;
        payload?: Record<string, unknown>;
        [key: string]: unknown;
      });

      const result =
        chunk.result && typeof chunk.result === "object"
          ? (chunk.result as Record<string, unknown>)
          : undefined;
      const resultSpec =
        result?.spec && typeof result.spec === "object"
          ? (result.spec as Record<string, unknown>)
          : undefined;

      if (
        chunk.type === "tool-result" &&
        chunk.toolName === "execute_sql" &&
        Array.isArray(result?.rows)
      ) {
        lastRows = result.rows as Array<Record<string, unknown>>;
      }

      if (
        chunk.type === "tool-result" &&
        chunk.toolName === "generate_visualization" &&
        resultSpec &&
        !Array.isArray(resultSpec)
      ) {
        chunk.result = {
          ...result,
          spec: normalizePreviewSpecData(resultSpec, lastRows),
        };
      }

      return [...otherLines, `data: ${JSON.stringify(chunk)}`].join("\n");
    } catch {
      return rawEvent;
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const reader = body.getReader();
      let buffer = "";

      const flushBuffer = (flushRemaining: boolean) => {
        let boundaryIndex = buffer.indexOf("\n\n");
        while (boundaryIndex !== -1) {
          const rawEvent = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);
          controller.enqueue(encoder.encode(`${rewriteEvent(rawEvent)}\n\n`));
          boundaryIndex = buffer.indexOf("\n\n");
        }

        if (flushRemaining && buffer.trim().length > 0) {
          controller.enqueue(encoder.encode(`${rewriteEvent(buffer)}\n\n`));
          buffer = "";
        }
      };

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              buffer += decoder.decode();
              flushBuffer(true);
              controller.close();
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            flushBuffer(false);
          }
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      };

      void pump();
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolved = await resolveOrganizationIdForRequest(request, supabase, user.id);
    const organizationId = resolved.organizationId;

    if (!organizationId) {
      return NextResponse.json(
        { error: resolved.source === "explicit" ? "Forbidden" : "No organization found" },
        { status: resolved.source === "explicit" ? 403 : 404 },
      );
    }

    const apiKey = getSdkApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "SERVICE_API_KEY is not configured" },
        { status: 500 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {
          messages?: unknown;
          prompt?: unknown;
          conversationHistory?: unknown;
          dashboardId?: unknown;
          tenantFieldName?: unknown;
          requestContext?: {
            organizationId?: string;
            tenantId?: string;
            datasourceId?: string;
            userId?: string;
          };
          [key: string]: unknown;
        }
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const messages = normalizeMastraMessages(body);
    if (!messages) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          issues: [{ field: "messages", message: "Provide messages or prompt" }],
        },
        { status: 400 },
      );
    }

    const tenantId =
      typeof body.requestContext?.tenantId === "string" &&
      body.requestContext.tenantId.trim().length > 0
        ? body.requestContext.tenantId.trim()
        : undefined;

    const upstreamBody = { ...body };
    delete upstreamBody.prompt;
    delete upstreamBody.conversationHistory;
    delete upstreamBody.dashboardId;
    delete upstreamBody.tenantFieldName;

    const upstreamResponse = await fetch(getSdkStreamUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: EVENT_STREAM_CONTENT_TYPE,
        "x-api-key": apiKey,
        "x-organization-id": organizationId,
        ...(tenantId ? { "x-tenant-id": tenantId } : {}),
        ...getVercelProtectionBypassHeaders(),
      },
      body: JSON.stringify({
        ...upstreamBody,
        messages,
        organization_id: organizationId,
        ...(tenantId ? { tenant_id: tenantId } : {}),
        requestContext: {
          ...body.requestContext,
          organizationId,
          userId: user.id,
          ...(tenantId ? { tenantId } : {}),
        },
      }),
      cache: "no-store",
    });

    const responseHeaders = cloneStreamHeaders(upstreamResponse.headers);
    const contentType = upstreamResponse.headers.get("content-type") || "";

    if (!upstreamResponse.body || !contentType.includes(EVENT_STREAM_CONTENT_TYPE)) {
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    }

    return new Response(createPreviewEnrichedStream(upstreamResponse.body), {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("SQL agent stream proxy error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to proxy SQL agent stream",
      },
      { status: 500 },
    );
  }
}
