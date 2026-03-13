
import { Pool } from "pg";
import fs from "fs";
import path from "path";

// Load .env manually for standalone script
try {
  const envConfig = fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf-8");
  envConfig.split("\n").forEach(line => {
    const [key, ...valueParts] = line.split("=");
    const value = valueParts.join("="); // In case value contains =
    if (key && value && !process.env[key]) {
      process.env[key.trim()] = value.trim();
    }
  });
} catch (e) {
  console.log("Note: Could not load .env file");
}

const baseURL = process.env.API_URL || "http://localhost:3000/api";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
});

async function verifyArchitecture() {
  try {
    const seatId = "C45";
    const sectionId = "C";
    const userId = "verifier-" + Date.now();

    console.log(`\n=== 1. Booking Seat ${seatId} ===`);
    let res = await fetch(`${baseURL}/book-seat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seatId, sectionId, userId }),
    });
    let data = await res.json();
    const bookingId = data.bookingId;
    console.log("Booking Response:", res.status, data);

    if (!bookingId) return;

    console.log(`\n=== 2. Paying for ${seatId} via API ===`);
    res = await fetch(`${baseURL}/pay`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Idempotency-Key": bookingId
      },
      body: JSON.stringify({ bookingId }),
    });
    data = await res.json();
    console.log("Payment Response:", res.status, data);

    console.log(`\n=== 3. Checking PostgreSQL for Async Update ===`);
    console.log("Waiting 10s for SQS -> Lambda/Worker -> PostgreSQL...");
    
    // Poll loop
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 2000));
        process.stdout.write(".");
        
        const res = await pool.query('SELECT * FROM bookings WHERE booking_id = $1', [bookingId]);
        if (res.rows.length > 0) {
            console.log("\n✅ SUCCESS: Booking found in PostgreSQL!");
            console.log(res.rows[0]);
            return;
        }
    }
    
    console.log("\n❌ TIMEOUT: Booking NOT found in PostgreSQL after 20s.");
    console.log("Check: AWS SQS Console (Messages visible?) or CloudWatch Logs (Lambda errors?)");

  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await pool.end();
  }
}

verifyArchitecture();
