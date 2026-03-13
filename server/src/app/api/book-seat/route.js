import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSeat, initDB } from "@/lib/db";
import { HOLD_TTL_SECONDS, createHold, createMultipleHolds, isHeld, isGeoUnlocked } from "@/lib/locks";

let dbInitialized = false;

export async function POST(req) {
  try {
    // Initialize DB on first request
    if (!dbInitialized) {
      await initDB();
      dbInitialized = true;
    }

    const body = await req.json().catch(() => ({}));
    const { seats, seatId, sectionId, userId, city } = body;

    if (!userId) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    // ===== GEO-UNLOCK CHECK =====
    // If city is provided, check if booking is unlocked for this region
    if (city) {
      const geoStatus = await isGeoUnlocked(city);
      if (!geoStatus.isUnlocked) {
        return NextResponse.json({
          error: "BOOKING_LOCKED",
          city,
          unlocksAt: new Date(geoStatus.unlocksAt * 1000).toISOString(),
          remainingSeconds: geoStatus.remainingSeconds,
          message: `Bookings for ${city} open in ${geoStatus.remainingSeconds} seconds`
        }, { status: 403 });
      }
    }

    // Support both single seat and multiple seats
    const seatsToBook = seats || (seatId && sectionId ? [{ seatId, sectionId }] : null);

    if (!seatsToBook || seatsToBook.length === 0) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    // Validate all seats first
    for (const seat of seatsToBook) {
      if (!seat.seatId || !seat.sectionId) {
        return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
      }

      // Check if seat exists in DB
      const dbSeat = await getSeat(seat.seatId);
      if (!dbSeat) {
        return NextResponse.json({ 
          error: "SEAT_NOT_FOUND",
          seatId: seat.seatId 
        }, { status: 404 });
      }

      // Validate section ID
      if (dbSeat.section_id !== seat.sectionId) {
        return NextResponse.json({ 
          error: "SEAT_SECTION_MISMATCH",
          seatId: seat.seatId 
        }, { status: 400 });
      }

      // Check if seat is already booked in DB
      if (dbSeat.status === "BOOKED") {
        return NextResponse.json({ 
          error: "SEAT_ALREADY_TAKEN",
          seatId: seat.seatId 
        }, { status: 409 });
      }

      // Check if seat is held in Redis
      if (await isHeld(seat.seatId)) {
        return NextResponse.json({ 
          error: "SEAT_ALREADY_TAKEN",
          seatId: seat.seatId 
        }, { status: 409 });
      }
    }

    // All seats are available, try to book them all atomically
    const bookingId = crypto.randomUUID();
    
    if (seatsToBook.length === 1) {
      // Single seat booking
      const seat = seatsToBook[0];
      const holdCreated = await createHold(seat.seatId, { 
        userId, 
        bookingId, 
        sectionId: seat.sectionId 
      });

      if (!holdCreated) {
        return NextResponse.json({ 
          error: "SEAT_ALREADY_TAKEN",
          seatId: seat.seatId 
        }, { status: 409 });
      }

      return NextResponse.json({
        bookingId,
        seatId: seat.seatId,
        sectionId: seat.sectionId,
        status: "HOLD",
        expiresIn: HOLD_TTL_SECONDS,
      });
    } else {
      // Multiple seats booking (atomic) - all share same bookingId
      const holdCreated = await createMultipleHolds(seatsToBook, userId, bookingId);

      if (!holdCreated) {
        return NextResponse.json({ 
          error: "SEAT_ALREADY_TAKEN",
          message: "One or more seats became unavailable during booking"
        }, { status: 409 });
      }

      // Return single booking with multiple seats
      return NextResponse.json({
        bookingId,
        seats: seatsToBook.map(seat => ({
          seatId: seat.seatId,
          sectionId: seat.sectionId,
        })),
        status: "HOLD",
        expiresIn: HOLD_TTL_SECONDS,
        count: seatsToBook.length,
      });
    }
  } catch (err) {
    console.error("Error booking seat:", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: err.message },
      { status: 500 }
    );
  }
}
