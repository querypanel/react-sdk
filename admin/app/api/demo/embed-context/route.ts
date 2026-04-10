import { type NextRequest, NextResponse } from "next/server";
import {
  generateQPJwt,
  resolveApiBaseUrl,
} from "@/lib/demo/embedded-backend";

export const runtime = "nodejs";

interface ContextRequestBody {
  tenantId?: string;
  userId?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as ContextRequestBody;
    const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    const apiBaseUrl = resolveApiBaseUrl();
    if (!apiBaseUrl) {
      return NextResponse.json(
        { success: false, error: "Missing QueryPanel API URL for embed demo." },
        { status: 500 },
      );
    }

    const jwt = await generateQPJwt({
      tenantId,
      userId: userId || undefined,
    });

    return NextResponse.json({
      success: true,
      apiBaseUrl,
      jwt,
      tenantId,
      userId: userId || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
