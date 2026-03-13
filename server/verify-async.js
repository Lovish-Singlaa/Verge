import pkg from "pg";
const { Client } = pkg;
const baseURL = process.env.API_URL || "http://localhost:3000/api";

const dbClient = new Client({
  host: "127.0.0.1",
  port: 5434,
  user: "postgres",
  password: "postgres",
  database: "ticketing-2"
});

async function verifyAsyncArchitecture() {
  try {
    await dbClient.connect();
    
    // 1. Pick a seat
    const seatId = "C50";
    const sectionId = "C";
    const userId = "tester-" + Date.now();
    
    console.log(`\n=== 1. Booking Seat ${seatId} ===`);
    let res = await fetch(`${baseURL}/book-seat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seatId, sectionId, userId }),
    });
    let data = await res.json();
    const bookingId = data.bookingId;
    console.log("Booking Response:", res.status);

    // 2. Pay (triggers SQS + Redis Update)
    console.log(`\n=== 2. Paying for ${seatId} ===`);
    console.log("Worker has a 5s delay. Expect return immediately.");
    const start = Date.now();
    
    res = await fetch(`${baseURL}/pay`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Idempotency-Key": bookingId
      },
      body: JSON.stringify({ bookingId }),
    });
    data = await res.json();
    const took = Date.now() - start;
    console.log(`Payment API took: ${took}ms (Should be fast!)`);
    console.log("Payment Status:", data.status);

    // 3. IMMEDIATE CHECK (Within delay window)
    console.log(`\n=== 3. IMMEDIATE STATUS CHECK (< 5s) ===`);
    
    // Check API (Redis Authority)
    res = await fetch(`${baseURL}/seats`);
    const map = await res.json();
    const section = map.sections.find(s => s.sectionId === sectionId);
    const seatAPI = section.seats.find(s => s.seatId === seatId);
    console.log(`[API/Redis] Seat Status: ${seatAPI.status} (EXPECT: BOOKED)`);
    
    // Check DB (Direct SQL)
    const dbRes = await dbClient.query("SELECT status FROM bookings WHERE booking_id = $1", [bookingId]);
    const dbBooking = dbRes.rows[0];
    const dbSeatRes = await dbClient.query("SELECT status FROM seats WHERE seat_id = $1", [seatId]);
    const dbSeat = dbSeatRes.rows[0];
    
    console.log(`[DB Direct] Booking Row Exists? ${!!dbBooking} (EXPECT: false)`);
    console.log(`[DB Direct] Seat Status: ${dbSeat?.status} (EXPECT: AVAILABLE or HOLD, not BOOKED)`);

    // 4. WAIT FOR WORKER
    console.log(`\n=== 4. WAITING FOR WORKER (6s) ===`);
    await new Promise(r => setTimeout(r, 6000));
    
    // 5. FINAL CHECK
    const dbResFinal = await dbClient.query("SELECT status FROM bookings WHERE booking_id = $1", [bookingId]);
    console.log(`[DB Direct] Booking Row Exists? ${!!dbResFinal.rows[0]} (EXPECT: true)`);
    
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await dbClient.end();
  }
}

verifyAsyncArchitecture();
