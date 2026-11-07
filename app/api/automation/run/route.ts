import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runAutomation } from "@/lib/automation";

export const dynamic = "force-dynamic";

/**
 * POST (or GET) /api/automation/run
 *
 * Runs the escrow automation rules once. Protected by AUTOMATION_SECRET,
 * sent as the `x-automation-secret` header (or `?secret=` for quick browser
 * demos). Add `?dryRun=1` to see what WOULD happen without changing anything.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  const expected = process.env.AUTOMATION_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "AUTOMATION_SECRET is not configured" }, { status: 500 });
  }

  const provided =
    req.headers.get("x-automation-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!secretMatches(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
    const summary = await runAutomation({ dryRun });
    console.log("Automation run:", JSON.stringify({ ...summary, results: summary.results.length }));
    return NextResponse.json(summary);
  } catch (err) {
    console.error("Automation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
