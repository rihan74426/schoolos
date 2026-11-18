import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDb } from "@schoolos/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDb();
    await mongoose.connection.db?.admin().ping();
    return NextResponse.json({ ok: true, service: "schoolos-web", database: "up" });
  } catch {
    return NextResponse.json(
      { ok: false, service: "schoolos-web", database: "down" },
      { status: 503 },
    );
  }
}
