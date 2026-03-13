import { Pool } from "pg";
import { startWorker } from "./worker";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
});

/**
 * Ensure tables exist and seed data
 */
export async function initDB() {
  await ensureTables();
  await seedSeats();
  
  // Start the background worker (Singleton)
  startWorker();
  
  console.log("✓ PostgreSQL initialized");
}

async function ensureTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS seats (
          seat_id VARCHAR(10) PRIMARY KEY,
          section_id VARCHAR(10) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
          booking_id VARCHAR(50) PRIMARY KEY,
          user_id VARCHAR(50) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS booking_seats (
          booking_id VARCHAR(50) REFERENCES bookings(booking_id) ON DELETE CASCADE,
          seat_id VARCHAR(10) REFERENCES seats(seat_id),
          PRIMARY KEY (booking_id, seat_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
          idempotency_key VARCHAR(100) PRIMARY KEY,
          booking_id VARCHAR(50) REFERENCES bookings(booking_id),
          status VARCHAR(20) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✓ Tables ensured");
  } finally {
    client.release();
  }
}

async function seedSeats() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT COUNT(*) FROM seats');
    const count = parseInt(res.rows[0].count, 10);
    
    if (count > 0) return;

    console.log("Seeding seats...");
    const sections = { A: 24, B: 40, C: 60 };
    
    await client.query('BEGIN');
    
    for (const [sectionId, numSeats] of Object.entries(sections)) {
      for (let i = 1; i <= numSeats; i++) {
        await client.query(
          'INSERT INTO seats (seat_id, section_id, status) VALUES ($1, $2, $3)',
          [`${sectionId}${i}`, sectionId, 'AVAILABLE']
        );
      }
    }
    
    await client.query('COMMIT');
    console.log("✓ Seeded seats table");
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getAllSeats() {
  const res = await pool.query('SELECT seat_id, section_id, status FROM seats ORDER BY section_id, seat_id');
  return res.rows;
}

export async function getSeat(seatId) {
  const res = await pool.query('SELECT seat_id, section_id, status FROM seats WHERE seat_id = $1', [seatId]);
  return res.rows.length ? res.rows[0] : null;
}

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

export async function getBooking(bookingId) {
  const res = await pool.query(`
    SELECT b.booking_id, b.user_id, b.created_at, bs.seat_id, s.section_id, s.status
    FROM bookings b
    JOIN booking_seats bs ON b.booking_id = bs.booking_id
    JOIN seats s ON bs.seat_id = s.seat_id
    WHERE b.booking_id = $1
  `, [bookingId]);
  
  if (res.rows.length === 0) return null;
  
  // Return the first seat associated with this booking to match old structure
  // Note: the original code just had `seat_id` and `section_id` in the `bookings` table.
  return {
    booking_id: res.rows[0].booking_id,
    user_id: res.rows[0].user_id,
    seat_id: res.rows[0].seat_id,
    section_id: res.rows[0].section_id,
    status: res.rows[0].status,
    created_at: res.rows[0].created_at
  };
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
