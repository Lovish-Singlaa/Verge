import { NextResponse } from "next/server";
import {
  createBooking,
  getPaymentByKey,
  savePayment,
  initDB,
} from "@/lib/db";
import { getHoldByBookingId, releaseHold, setSeatBooked } from "@/lib/locks";
import { mockSQS } from "@/lib/queue";

let dbInitialized = false;

export async function POST(req) {
  try {
    // Initialize DB on first request
    if (!dbInitialized) {
      await initDB();
      dbInitialized = true;
    }

    const body = await req.json().catch(() => ({}));
    const { bookingId } = body;
    
    if (!bookingId) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const idempotencyKey = req.headers.get("idempotency-key") || bookingId;

    // Check for idempotent retry
    const existingPayment = await getPaymentByKey(idempotencyKey);
    if (existingPayment) {
      const responseBody = {
        bookingId: existingPayment.booking_id,
        status: existingPayment.status,
      };
      return NextResponse.json(
        responseBody,
        { status: existingPayment.status === "CONFIRMED" ? 200 : 400 }
      );
    }

    // Get hold from Redis using bookingId
    const holdData = await getHoldByBookingId(bookingId);
    
    if (!holdData) {
      const failBody = { bookingId, status: "PAYMENT_FAILED" };
      await savePayment({
        bookingId,
        status: "FAILED",
        idempotencyKey,
      });
      return NextResponse.json(failBody, { status: 400 });
    }

    // Handle both single seat and multiple seats
    const isMultiSeat = holdData.seats && Array.isArray(holdData.seats);
    const seatsToBook = isMultiSeat ? holdData.seats : [holdData];
    const userId = holdData.userId;

    // Create bookings in Postgres for all seats
    try {
      // 1. Immediately mark seats as BOOKED in Redis (Authority)
      for (const seat of seatsToBook) {
        await setSeatBooked(seat.seatId);
      }

      // 2. Push to Queue for Async DB Persistence
      // In a real system, we'd loop or send a batch. 
      // For this simple mock, we send one message per seat or one batch message depending on worker logic.
      // Our worker handles single messages nicely, let's just queue separate messages or one message with all data.
      // Worker expects single booking logic. Let's send one message per seat to be safe and simple for the worker loop.
      
      for (const seat of seatsToBook) {
        await mockSQS.sendMessage({
          type: "BOOKING_CONFIRMED",
          data: {
            bookingId,
            seatId: seat.seatId,
            sectionId: seat.sectionId,
            userId,
            idempotencyKey
          }
        });
      }

      // 3. Start worker if not running (Simulation logic)
      // In production, the worker is a separate process. Here we lazy-start it to confirm it runs.
      // We can just rely on the worker being started in server.js, but let's ensure it processes.
      // For now, we assume worker is started in server.js or we can just import it.
      
      // 4. Return success immediately
      return NextResponse.json({ 
        bookingId, 
        status: "CONFIRMED",
        seatsBooked: seatsToBook.length,
      });

    } catch (err) {
      console.error("Failed to queue booking:", err);
      // If redis update failed, we are in trouble. 
      // Ideally we should rollback redis, but for now 500.
      return NextResponse.json(
        { error: "INTERNAL_ERROR", message: "Failed to process payment" }, 
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("Error processing payment:", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: err.message },
      { status: 500 }
    );
  }
}
