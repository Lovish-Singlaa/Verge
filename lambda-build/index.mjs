import { createBooking, savePayment } from "../lib/db";
import { releaseHold } from "../lib/locks";

export const handler = async (event) => {
  console.log("Processing SQS Event with records:", event.Records.length);

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      
      if (body.type === "BOOKING_CONFIRMED") {
        const { bookingId, seatId, sectionId, userId, idempotencyKey } = body.data;
        
        console.log(`[Lambda] Processing booking ${bookingId} for seat ${seatId}`);

        // 1. Create booking in Postgres
        await createBooking({
          bookingId,
          seatId,
          sectionId,
          userId
        });
        
        // 2. Release the HOLD lock in Redis
        await releaseHold(seatId, userId);
        
        // 3. Mark payment as CONFIRMED
        await savePayment({
          bookingId,
          status: "CONFIRMED",
          idempotencyKey
        });
        
        console.log(`[Lambda] Successfully processed booking ${bookingId}`);
      }
    } catch (err) {
      console.error(`[Lambda] Failed to process message ${record.messageId}:`, err);
      // Throwing error causes SQS to retry this message later
      throw err; 
    }
  }

  return { status: "success" };
};
