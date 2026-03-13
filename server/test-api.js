const baseURL = process.env.API_URL || "http://localhost:3000/api";

async function testAPI() {
  try {
    // Test 1: GET /seats
    console.log("\n=== TEST 1: GET /api/seats ===");
    let res = await fetch(`${baseURL}/seats`);
    let data = await res.json();
    console.log(JSON.stringify(data, null, 2));

    // Test 2: POST /book-seat (single seat)
    console.log("\n=== TEST 2: POST /api/book-seat (single: A1) ===");
    res = await fetch(`${baseURL}/book-seat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seatId: "A1", sectionId: "A", userId: "user123" }),
    });
    data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(JSON.stringify(data, null, 2));
    const bookingId1 = data.bookingId;

    // Test 3: Try booking same seat (should fail)
    console.log("\n=== TEST 3: POST /api/book-seat (A1 again - should fail) ===");
    res = await fetch(`${baseURL}/book-seat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seatId: "A1", sectionId: "A", userId: "user456" }),
    });
    data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(JSON.stringify(data, null, 2));

    // Test 4: Book multiple seats at once
    console.log("\n=== TEST 4: POST /api/book-seat (multiple: B1, B2, B3) ===");
    res = await fetch(`${baseURL}/book-seat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seats: [
          { seatId: "B1", sectionId: "B" },
          { seatId: "B2", sectionId: "B" },
          { seatId: "B3", sectionId: "B" },
        ],
        userId: "user789",
      }),
    });
    data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(JSON.stringify(data, null, 2));
    const multiBookingId = data.bookingId; // Single bookingId for all seats

    // Test 5: Try booking where one seat is already held (should fail all)
    console.log("\n=== TEST 5: POST /api/book-seat (C1, B1 - should fail, B1 held) ===");
    res = await fetch(`${baseURL}/book-seat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seats: [
          { seatId: "C1", sectionId: "C" },
          { seatId: "B1", sectionId: "B" }, // Already held
        ],
        userId: "user999",
      }),
    });
    data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(JSON.stringify(data, null, 2));

    // Test 6: Payment (single)
    console.log("\n=== TEST 6: POST /api/pay (single bookingId1) ===");
    res = await fetch(`${baseURL}/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "idempotency-key": bookingId1,
      },
      body: JSON.stringify({ bookingId: bookingId1 }),
    });
    data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(JSON.stringify(data, null, 2));

    // Test 7: Payment retry (idempotent, should return same)
    console.log("\n=== TEST 7: POST /api/pay retry (same bookingId1 - idempotent) ===");
    res = await fetch(`${baseURL}/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "idempotency-key": bookingId1,
      },
      body: JSON.stringify({ bookingId: bookingId1 }),
    });
    data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(JSON.stringify(data, null, 2));

    // Test 8: Payment (multiple seats, single bookingId)
    console.log("\n=== TEST 8: POST /api/pay (multiBookingId for 3 seats) ===");
    res = await fetch(`${baseURL}/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "idempotency-key": multiBookingId,
      },
      body: JSON.stringify({ bookingId: multiBookingId }),
    });
    data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(JSON.stringify(data, null, 2));

    // Test 9: Final seat map
    console.log("\n=== TEST 9: GET /api/seats (final state) ===");
    res = await fetch(`${baseURL}/seats`);
    data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}

testAPI();
