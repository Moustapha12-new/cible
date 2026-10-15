import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: false, error: "Les inscriptions publiques sont fermées." }, { status: 403 });
}
