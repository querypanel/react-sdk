import { type NextRequest, NextResponse } from "next/server";
import {
  getEmbeddedDemoSdk,
  getHttpStatus,
  resolveDemoEmbedContext,
} from "@/lib/demo/embedded-backend";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const context = await resolveDemoEmbedContext(request);
    const sdk = getEmbeddedDemoSdk();

    const original = await sdk.rollbackFork(id, context.tenantId, {
      userId: context.userId,
    });

    return NextResponse.json(original);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: getHttpStatus(error) });
  }
}
