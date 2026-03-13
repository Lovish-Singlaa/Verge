/**
 * PostgreSQL database client
 * In production, use connection pooling (RDS, Supabase, etc.)
 * For local dev, use Docker: docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres
 */

import pkg from "pg";
import { startWorker } from "./worker";
const { Pool, Client } = pkg;

let pool = null;

function getPool() {
  if (!pool) {
    const config = {
      host: process.env.POSTGRES_HOST || "127.0.0.1",
      port: 5434, // Hardcoded to avoid local env conflicts
      user: process.env.POSTGRES_USER || "postgres",
      password: process.env.POSTGRES_PASSWORD || "postgres",
      database: process.env.POSTGRES_DB || "ticketing-2",
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };
    console.log("DB Config:", { ...config, password: "***" });

    pool = new Pool(config);

    pool.on("error", (err) => {
      console.error("Unexpected Postgres pool error:", err);
    });
  }
  return pool;
}

/**
 * Ensure the database exists, create if needed
 */
async function ensureDatabase() {
  const dbName = process.env.POSTGRES_DB || "ticketing-2";
  
  // Connect to default 'postgres' database to check/create our database
  const client = new Client({
    host: process.env.POSTGRES_HOST || "127.0.0.1",
    port: 5434, // Hardcoded
    user: process.env.POSTGRES_USER || "postgres",
    password: process.env.POSTGRES_PASSWORD || "postgres",
    database: "postgres",
  });

  try {
    await client.connect();
    
    // Check if database exists
    const { rows } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (rows.length === 0) {
      // Database doesn't exist, create it
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`✓ Created database: ${dbName}`);
    }
  } finally {
    await client.end();
  }
}

/**
 * Initialize database schema
 */
export async function initDB() {
  // Ensure database exists first
  await ensureDatabase();
  
  // Start the background worker (Singleton)
  startWorker();
  
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS seats (
        seat_id TEXT PRIMARY KEY,
        section_id TEXT NOT NULL,
        status TEXT DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'BOOKED'))
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        booking_id TEXT NOT NULL,
        seat_id TEXT NOT NULL REFERENCES seats(seat_id),
        user_id TEXT NOT NULL,
        section_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('BOOKED')),
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (booking_id, seat_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        booking_id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('CONFIRMED', 'FAILED')),
        idempotency_key TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed seats if table is empty
    const { rows } = await client.query("SELECT COUNT(*) FROM seats");
    if (parseInt(rows[0].count) === 0) {
      const sections = { A: 24, B: 40, C: 60 };
      const seatInserts = [];
      
      for (const [sectionId, count] of Object.entries(sections)) {
        for (let i = 1; i <= count; i++) {
          const seatId = `${sectionId}${i}`;
          seatInserts.push(`('${seatId}', '${sectionId}', 'AVAILABLE')`);
        }
      }

      await client.query(`
        INSERT INTO seats (seat_id, section_id, status)
        VALUES ${seatInserts.join(", ")}
      `);
      
      console.log("✓ Seeded seats table with 124 seats");
    }

    console.log("✓ Database initialized");
  } catch (err) {
    console.error("✗ Database initialization failed:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get all seats with their current status
 */
export async function getAllSeats() {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query(`
      SELECT seat_id, section_id, status
      FROM seats
      ORDER BY section_id, seat_id
    `);
    return rows;
  } finally {
    client.release();
  }
}

/**
 * Get a single seat by ID
 */
export async function getSeat(seatId) {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query(
      "SELECT seat_id, section_id, status FROM seats WHERE seat_id = $1",
      [seatId]
    );
    return rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Create a confirmed booking and mark seat as BOOKED
 * This is only called after payment succeeds
 */
export async function createBooking({ bookingId, seatId, sectionId, userId }) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    await client.query(
      "UPDATE seats SET status = 'BOOKED' WHERE seat_id = $1",
      [seatId]
    );

    await client.query(
      `INSERT INTO bookings (booking_id, seat_id, section_id, user_id, status)
       VALUES ($1, $2, $3, $4, 'BOOKED')`,
      [bookingId, seatId, sectionId, userId]
    );

    await client.query("COMMIT");
    return { bookingId, seatId, sectionId, userId, status: "BOOKED" };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getBooking(bookingId) {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query(
      "SELECT * FROM bookings WHERE booking_id = $1",
      [bookingId]
    );
    return rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Get payment by idempotency key (for idempotent retries)
 */
export async function getPaymentByKey(idempotencyKey) {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query(
      "SELECT * FROM payments WHERE idempotency_key = $1",
      [idempotencyKey]
    );
    return rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Save payment record (idempotent)
 */
export async function savePayment({ bookingId, status, idempotencyKey }) {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO payments (booking_id, status, idempotency_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [bookingId, status, idempotencyKey]
    );
    return rows[0] || (await getPaymentByKey(idempotencyKey));
  } finally {
    client.release();
  }
}

export { getPool as pool };
