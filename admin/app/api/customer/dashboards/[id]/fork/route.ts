import { type NextRequest, NextResponse } from "next/server";
import {
  getEmbeddedDemoSdk,
  getHttpStatus,
  resolveDemoEmbedContext,
} from "@/lib/demo/embedded-backend";

export const runtime = "nodejs";

interface ForkBody {
  name?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const context = await resolveDemoEmbedContext(request);
    const body = (await request.json().catch(() => ({}))) as ForkBody;
    const sdk = getEmbeddedDemoSdk();

    const fork = await sdk.forkDashboard(
      id,
      {
        tenant_id: context.tenantId,
        name: typeof body.name === "string" ? body.name : undefined,
      },
      { userId: context.userId },
    );

    return NextResponse.json(fork, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: getHttpStatus(error) });
  }
}
