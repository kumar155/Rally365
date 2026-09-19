import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runFreeFallback } from "../../../lib/ai/free-fallback";
import { queryRally365, RALLY365_SCHEMA } from "../../../lib/ai/rally365-tools";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const SYSTEM = `You are Rally365 AI, a badminton group data assistant. The database is the source of truth. Never invent statistics, players, matches, dates, scores, or achievements. When a question needs Rally365 data, call query_rally365. You may issue multiple queries if needed. Interpret phrases such as "last 10", "recent", "today", "this month", and named player pairs precisely. If the user names two players, analyze that exact pair rather than substituting a best partner. You can calculate derived statistics from returned rows. Keep answers concise but explain the relevant numbers. Do not expose SQL or internal implementation details unless explicitly asked. Current local timezone is Asia/Kolkata.

${RALLY365_SCHEMA}`;

function textFromOutput(output: any[]): string {
  return output.filter(x => x.type === "message").flatMap(x => x.content || []).filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("\n").trim();
}

async function llmAnswer(messages: { role: string; content: string }[], groupId: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
  let input: any[] = [{ role: "developer", content: SYSTEM }, ...messages.slice(-12).map(m => ({ role: m.role, content: m.content }))];
  const tools = [{ type: "function", name: "query_rally365", description: "Run a safe read-only Rally365 database query. Use it whenever the answer depends on actual Rally365 data. Write a SELECT statement using only the documented tables; group scoping is enforced by the server.", strict: true, parameters: { type: "object", properties: { sql: { type: "string", description: "A read-only SELECT query against the documented Rally365 schema." } }, required: ["sql"], additionalProperties: false } }];

  for (let i = 0; i < 5; i++) {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input, tools, tool_choice: "auto", max_output_tokens: 700 }) });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
    const data = await response.json();
    const calls = (data.output || []).filter((x: any) => x.type === "function_call");
    if (!calls.length) return textFromOutput(data.output || []) || "I couldn't produce an answer.";
    input = [...input, ...(data.output || [])];
    for (const call of calls) {
      let args: { sql: string };
      try { args = JSON.parse(call.arguments); } catch { throw new Error("The AI produced an invalid database query."); }
      const result = await queryRally365(supabase, groupId, args.sql);
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
  }
  throw new Error("The AI needed too many database steps for this question.");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages.filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string") : [];
    if (!messages.length) return NextResponse.json({ error: "Ask a Rally365 question." }, { status: 400 });

    const { data: group, error } = await supabase.from("groups").select("id").eq("join_code", "RALLY365").single();
    if (error || !group) return NextResponse.json({ error: "Rally365 group could not be loaded." }, { status: 500 });

    if (process.env.OPENAI_API_KEY) {
      return NextResponse.json({ answer: await llmAnswer(messages, group.id), mode: "llm" });
    }

    return NextResponse.json({ answer: await runFreeFallback(supabase, group.id, messages[messages.length - 1].content), mode: "free" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI request failed." }, { status: 500 });
  }
}
