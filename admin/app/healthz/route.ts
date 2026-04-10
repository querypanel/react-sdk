import { NextResponse } from "next/server";

/** Public liveness for uptime monitors (aligned with querypanel-sdk /healthz). */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    message: "OK",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
}
