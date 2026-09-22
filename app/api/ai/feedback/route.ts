import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const feedback = body?.feedback === "up" || body?.feedback === "down" ? body.feedback : null;
    if (!feedback || typeof body?.question !== "string" || typeof body?.response !== "string") {
      return NextResponse.json({ error: "Invalid AI feedback." }, { status: 400 });
    }

    let groupId = typeof body?.groupId === "string" ? body.groupId : null;
    if (!groupId) {
      const { data: group } = await supabase.from("groups").select("id").eq("join_code", "RALLY365").single();
      groupId = group?.id || null;
    }
    if (!groupId) return NextResponse.json({ error: "Rally365 group could not be loaded." }, { status: 500 });

    const { error } = await supabase.from("ai_response_feedback").insert({
      group_id: groupId,
      question: body.question,
      response: body.response,
      feedback,
      intent: typeof body.intent === "string" ? body.intent : null,
      retry_response: typeof body.retryResponse === "string" ? body.retryResponse : null,
    });

    if (error) {
      // Feedback must never break the chat. This also keeps older deployments
      // usable until the migration has been applied.
      return NextResponse.json({ saved: false, error: error.message }, { status: 200 });
    }
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ saved: false }, { status: 200 });
  }
}
