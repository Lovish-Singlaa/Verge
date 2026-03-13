import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
});

export async function createBooking({ bookingId, seatId, sectionId, userId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Update seat status
    const seatRes = await client.query(
      'UPDATE seats SET status = $1 WHERE seat_id = $2 AND status != $1 RETURNING seat_id',
      ['BOOKED', seatId]
    );

    if (seatRes.rowCount === 0) {
      throw new Error(`Seat ${seatId} was already booked or does not exist`);
    }

    // Insert booking
    await client.query(
      'INSERT INTO bookings (booking_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [bookingId, userId]
    );

    // Insert booking seat association
    await client.query(
      'INSERT INTO booking_seats (booking_id, seat_id) VALUES ($1, $2)',
      [bookingId, seatId]
    );

    await client.query('COMMIT');
    return { bookingId, seatId, sectionId, userId, status: "BOOKED" };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Booking transaction failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getPaymentByKey(idempotencyKey) {
  const res = await pool.query(
    'SELECT idempotency_key, booking_id, status, created_at FROM payments WHERE idempotency_key = $1',
    [idempotencyKey]
  );
  return res.rows.length ? res.rows[0] : null;
}

export async function savePayment({ bookingId, status, idempotencyKey }) {
  const client = await pool.connect();
  try {
    // Attempt to insert. If conflict, return existing
    const insertRes = await client.query(`
      INSERT INTO payments (idempotency_key, booking_id, status) 
      VALUES ($1, $2, $3)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING idempotency_key, booking_id, status
    `, [idempotencyKey, bookingId, status]);

    if (insertRes.rowCount === 0) {
      const existing = await getPaymentByKey(idempotencyKey);
      return existing;
    }

    return { booking_id: bookingId, status, idempotency_key: idempotencyKey };
  } finally {
    client.release();
  }
}
