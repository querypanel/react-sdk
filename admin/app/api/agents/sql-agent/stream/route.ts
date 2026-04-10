import { POST as sqlAgentStreamPost } from "@/app/api/ai/sql-agent/stream/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = sqlAgentStreamPost;
