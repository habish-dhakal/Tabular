import { NextResponse } from "next/server";

import { readinessReport, readinessStatusCode } from "@/server/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await readinessReport();
  return NextResponse.json(report, { status: readinessStatusCode(report) });
}
