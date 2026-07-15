import { NextResponse } from "next/server";

import { livenessReport } from "@/server/health";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(livenessReport());
}
