import { redis, ensureConnection } from "./redis.js";
import crypto from "crypto";

// Key for permanent status in Redis
const STATUS_KEY_PREFIX = "seat:status:";


export const HOLD_TTL_SECONDS = 120;

export async function createHold(seatId, { userId, bookingId, sectionId }) {
  await ensureConnection();
  const expiresAt = Date.now() + HOLD_TTL_SECONDS * 1000;
  const holdData = JSON.stringify({ userId, bookingId, sectionId, expiresAt });
  
  const result = await redis.set(
    `hold:seat:${seatId}`,
    holdData,
    "NX",
    "EX",
    HOLD_TTL_SECONDS
  );
  
  if (result === "OK") {
    // Create reverse mapping for payment lookup
    await redis.set(`booking:${bookingId}`, seatId, "EX", HOLD_TTL_SECONDS);
    return true;
  }
  
  return false;
}

/**
 * Get hold information for a seat
 */
export async function getHold(seatId) {
  await ensureConnection();
  const data = await redis.get(`hold:seat:${seatId}`);
  if (!data) return null;
  
  try {
    const hold = JSON.parse(data);
    // Double-check expiry (Redis TTL should handle this, but defensive)
    if (hold.expiresAt && hold.expiresAt < Date.now()) {
      await redis.del(`hold:seat:${seatId}`);
      return null;
    }
    return hold;
  } catch (err) {
    console.error("Failed to parse hold data:", err);
    return null;
  }
}

export async function getHoldByBookingId(bookingId) {
  await ensureConnection();
  const data = await redis.get(`booking:${bookingId}`);
  if (!data) return null;
  
  try {
    // Parse as array of seatIds (for multi-seat bookings)
    const seatIds = JSON.parse(data);
    const seats = [];
    
    // Handle both single seat (backward compat) and multiple seats
    const seatIdArray = Array.isArray(seatIds) ? seatIds : [seatIds];
    
    for (const seatId of seatIdArray) {
      const hold = await getHold(seatId);
      if (hold) {
        seats.push({
          seatId,
          userId: hold.userId,
          sectionId: hold.sectionId,
          bookingId: hold.bookingId,
        });
      }
    }
    
    if (seats.length === 0) return null;
    
    // Return first seat's data for single bookings, or array for multiple
    if (seats.length === 1) {
      return seats[0];
    }
    
    return {
      bookingId,
      userId: seats[0].userId,
      seats,
    };
  } catch (err) {
    // Fallback for old format (single seatId string)
    const seatId = data;
    const hold = await getHold(seatId);
    if (hold) {
      return {
        seatId,
        userId: hold.userId,
        sectionId: hold.sectionId,
        bookingId: hold.bookingId,
      };
    }
    return null;
  }
}

export async function releaseHold(seatId, userId) {
  await ensureConnection();
  const hold = await getHold(seatId);
  if (hold && hold.userId === userId) {
    await redis.del(`hold:seat:${seatId}`);
    await redis.del(`booking:${hold.bookingId}`);
    return true;
  }
  return false;
}

export async function isHeld(seatId) {
  const hold = await getHold(seatId);
  return Boolean(hold);
}

/**
 * Set seat as permanently BOOKED in Redis.
 * This acts as the immediate authority before DB sync.
 */
export async function setSeatBooked(seatId) {
  await ensureConnection();
  // Set status to BOOKED. technically we don't need an expiry if we want it to be permanent until restart
  // But maybe give it a long TTL just in case of weird state, though infinite is better for "authority"
  await redis.set(`${STATUS_KEY_PREFIX}${seatId}`, "BOOKED");
}

/**
 * Get Redis-authoritative status (BOOKED or HOLD or null)
 */
export async function getRedisSeatStatus(seatId) {
  await ensureConnection();
  
  // Check permanent booked status first
  const booked = await redis.get(`${STATUS_KEY_PREFIX}${seatId}`);
  if (booked === "BOOKED") return "BOOKED";
  
  // Check temporary hold
  const hold = await getHold(seatId);
  if (hold) return "HOLD";
  
  return null;
}


/**
 * Create multiple holds atomically (all or nothing) with single bookingId
 * Returns true if successful, false if any seat is unavailable
 */
export async function createMultipleHolds(seats, userId, bookingId) {
  await ensureConnection();
  const expiresAt = Date.now() + HOLD_TTL_SECONDS * 1000;
  const lockedSeats = [];

  try {
    // Try to lock all seats with the same bookingId
    for (const { seatId, sectionId } of seats) {
      const holdData = JSON.stringify({ userId, bookingId, sectionId, expiresAt });

      const result = await redis.set(
        `hold:seat:${seatId}`,
        holdData,
        "NX",
        "EX",
        HOLD_TTL_SECONDS
      );

      if (result !== "OK") {
        // Lock failed, rollback all previous locks
        for (const lockedSeatId of lockedSeats) {
          await redis.del(`hold:seat:${lockedSeatId}`);
        }
        await redis.del(`booking:${bookingId}`);
        return false;
      }

      lockedSeats.push(seatId);
    }

    // Create reverse mapping: bookingId -> array of seatIds
    await redis.set(
      `booking:${bookingId}`,
      JSON.stringify(lockedSeats),
      "EX",
      HOLD_TTL_SECONDS
    );

    return true;
  } catch (err) {
    // On error, rollback all locks
    for (const lockedSeatId of lockedSeats) {
      await redis.del(`hold:seat:${lockedSeatId}`);
    }
    await redis.del(`booking:${bookingId}`);
    throw err;
  }
}
