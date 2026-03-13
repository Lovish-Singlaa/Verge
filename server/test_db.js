import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: "postgresql://neondb_owner:npg_kbt6TswLlzq8@ep-round-tree-a1oa1vu1-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require" });

const run = async () => {
    try {
        console.log("Creating seats");
        await pool.query('CREATE TABLE IF NOT EXISTS seats (seat_id VARCHAR(10) PRIMARY KEY, section_id VARCHAR(10) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT \'AVAILABLE\')');
        console.log("Creating bookings");
        await pool.query('CREATE TABLE IF NOT EXISTS bookings (booking_id VARCHAR(50) PRIMARY KEY, user_id VARCHAR(50) NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)');
        console.log("Creating booking_seats");
        await pool.query('CREATE TABLE IF NOT EXISTS booking_seats (booking_id VARCHAR(50) REFERENCES bookings(booking_id) ON DELETE CASCADE, seat_id VARCHAR(10) REFERENCES seats(seat_id), PRIMARY KEY (booking_id, seat_id))');
        console.log("Creating payments");
        await pool.query('CREATE TABLE IF NOT EXISTS payments (idempotency_key VARCHAR(100) PRIMARY KEY, booking_id VARCHAR(50) REFERENCES bookings(booking_id), status VARCHAR(20) NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)');
        console.log("SUCCESS");
    } catch (e) {
        console.error("ERROR:");
        console.error(e.message);
    } finally {
        await pool.end();
    }
}
run();
