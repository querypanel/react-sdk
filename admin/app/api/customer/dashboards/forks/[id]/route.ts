import { type NextRequest, NextResponse } from "next/server";
import {
  getEmbeddedDemoSdk,
  getHttpStatus,
  resolveDemoEmbedContext,
} from "@/lib/demo/embedded-backend";

export const runtime = "nodejs";

interface UpdateForkBody {
  content_json?: string;
  widget_config?: Record<string, unknown> | null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const context = await resolveDemoEmbedContext(request);
    const body = (await request.json().catch(() => ({}))) as UpdateForkBody;
    const sdk = getEmbeddedDemoSdk();

    const updated = await sdk.updateFork(
      id,
      {
        tenant_id: context.tenantId,
        content_json: body.content_json,
        widget_config: body.widget_config ?? undefined,
      },
      { userId: context.userId },
    );

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: getHttpStatus(error) });
  }
}
