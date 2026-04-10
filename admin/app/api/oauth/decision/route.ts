import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const decision = formData.get("decision");
  const authorizationId = formData.get("authorization_id") as string;

  if (!authorizationId) {
    return NextResponse.json(
      { error: "Missing authorization_id" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (decision === "approve") {
    const { data, error } = await supabase.auth.oauth.approveAuthorization(
      authorizationId,
      { skipBrowserRedirect: true }
    );

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Failed to approve" },
        { status: 400 }
      );
    }

    // Redirect back to the client with authorization code
    return NextResponse.redirect(data.redirect_url);
  } else {
    const { data, error } = await supabase.auth.oauth.denyAuthorization(
      authorizationId,
      { skipBrowserRedirect: true }
    );

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Failed to deny" },
        { status: 400 }
      );
    }

    // Redirect back to the client with error
    return NextResponse.redirect(data.redirect_url);
  }
}
