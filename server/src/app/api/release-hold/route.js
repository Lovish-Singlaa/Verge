import { NextResponse } from "next/server";
import { releaseHold } from "@/lib/locks";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { seatId, userId } = body;

    if (!seatId || !userId) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const released = await releaseHold(seatId, userId);

    if (released) {

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ success: false, message: "Hold validation failed" }, { status: 400 });
    }

  } catch (err) {
    console.error("Error releasing hold:", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: err.message },
      { status: 500 }
    );
  }
}
