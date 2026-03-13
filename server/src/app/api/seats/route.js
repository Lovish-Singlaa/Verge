// app/api/seats/route.ts
import { NextResponse } from "next/server";
import { getAllSeats, initDB } from "@/lib/db";
import { redis } from "@/lib/redis";
import { isHeld, getRedisSeatStatus, getAllSeatStatuses } from "@/lib/locks";

let dbInitialized = false;

export async function GET() {
  try {
    // Initialize DB on first request
    if (!dbInitialized) {
      await initDB();
      dbInitialized = true;
    }

    const seats = await getAllSeats();
    
    // Batch fetch all seat statuses from Redis in one go
    const seatIds = seats.map(s => s.seat_id);
    const redisStatuses = await getAllSeatStatuses(seatIds);
    
    const sections = {};

    for (const seat of seats) {
      let status = seat.status;
      const seatId = seat.seat_id;

      // Check Redis Authoritative Status
      const redisStatus = redisStatuses.get(seatId);
      
      if (redisStatus) {
        status = redisStatus;
      }

      if (!sections[seat.section_id]) {
        sections[seat.section_id] = [];
      }

      sections[seat.section_id].push({
        seatId: seat.seat_id,
        status,
      });
    }

    return NextResponse.json({
      sections: Object.entries(sections).map(([sectionId, seats]) => ({
        sectionId,
        seats,
      })),
    });
  } catch (err) {
    console.error("Error fetching seats:", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: err.message },
      { status: 500 }
    );
  }
}
