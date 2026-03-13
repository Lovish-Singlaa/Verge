// Mock data for seat booking system
// This simulates the response you'd get from backend via websockets

export const eventData = {
  eventId: "EVT001",
  eventName: "Coldplay: Music of the Spheres World Tour",
  venue: "DY Patil Stadium, Mumbai",
  date: "2026-02-15",
  time: "7:00 PM",
  currency: "₹",
};

// Section configuration - maps backend section IDs to display info
export const sectionConfig = {
  A: {
    sectionId: "A",
    sectionName: "Gold",
    price: 15000,
    seatsPerRow: 8,
  },
  B: {
    sectionId: "B",
    sectionName: "Silver",
    price: 8000,
    seatsPerRow: 10,
  },
  C: {
    sectionId: "C",
    sectionName: "Bronze",
    price: 4000,
    seatsPerRow: 12,
  },
};

// Helper function to transform API response to UI format
export const transformSeatsData = (apiSections) => {
  console.log("[transformSeatsData] Input sections:", apiSections);
  
  const sections = apiSections.map((apiSection) => {
    const config = sectionConfig[apiSection.sectionId];
    
    if (!config) {
      console.warn(`[transformSeatsData] Unknown section: ${apiSection.sectionId}`);
      return null;
    }

    // Sort seats by numeric value (A1, A2, ... A10, A11, etc.)
    const sortedSeats = [...apiSection.seats].sort((a, b) => {
      const numA = parseInt(a.seatId.substring(1));
      const numB = parseInt(b.seatId.substring(1));
      return numA - numB;
    });

    // Convert flat seat array to 2D rows array
    const rows = [];
    for (let i = 0; i < sortedSeats.length; i += config.seatsPerRow) {
      const row = sortedSeats.slice(i, i + config.seatsPerRow);
      rows.push(row);
    }

    console.log(`[transformSeatsData] Section ${apiSection.sectionId}: ${sortedSeats.length} seats, ${rows.length} rows`);

    return {
      sectionId: apiSection.sectionId,
      sectionName: config.sectionName,
      price: config.price,
      rows,
    };
  }).filter(Boolean); // Remove null entries

  console.log("[transformSeatsData] Output sections:", sections);
  return { sections };
};

// 2D array based seat layout (MOCK - kept for fallback/reference)
// Each section has rows (array) and each row has seats (array)
// Status: "AVAILABLE" | "HOLD" | "BOOKED"
export const seatLayout = {
  sections: [
    {
      sectionId: "GOLD",
      sectionName: "Gold",
      price: 15000,
      rows: [
        [
          { seatId: "G1-1", status: "AVAILABLE" },
          { seatId: "G1-2", status: "AVAILABLE" },
          { seatId: "G1-3", status: "BOOKED" },
          { seatId: "G1-4", status: "AVAILABLE" },
          { seatId: "G1-5", status: "HOLD" },
          { seatId: "G1-6", status: "AVAILABLE" },
          { seatId: "G1-7", status: "AVAILABLE" },
          { seatId: "G1-8", status: "BOOKED" },
        ],
        [
          { seatId: "G2-1", status: "AVAILABLE" },
          { seatId: "G2-2", status: "BOOKED" },
          { seatId: "G2-3", status: "AVAILABLE" },
          { seatId: "G2-4", status: "AVAILABLE" },
          { seatId: "G2-5", status: "AVAILABLE" },
          { seatId: "G2-6", status: "HOLD" },
          { seatId: "G2-7", status: "AVAILABLE" },
          { seatId: "G2-8", status: "AVAILABLE" },
        ],
        [
          { seatId: "G3-1", status: "BOOKED" },
          { seatId: "G3-2", status: "AVAILABLE" },
          { seatId: "G3-3", status: "AVAILABLE" },
          { seatId: "G3-4", status: "HOLD" },
          { seatId: "G3-5", status: "AVAILABLE" },
          { seatId: "G3-6", status: "AVAILABLE" },
          { seatId: "G3-7", status: "BOOKED" },
          { seatId: "G3-8", status: "AVAILABLE" },
        ],
      ],
    },
    {
      sectionId: "SILVER",
      sectionName: "Silver",
      price: 8000,
      rows: [
        [
          { seatId: "S1-1", status: "AVAILABLE" },
          { seatId: "S1-2", status: "AVAILABLE" },
          { seatId: "S1-3", status: "AVAILABLE" },
          { seatId: "S1-4", status: "BOOKED" },
          { seatId: "S1-5", status: "AVAILABLE" },
          { seatId: "S1-6", status: "AVAILABLE" },
          { seatId: "S1-7", status: "HOLD" },
          { seatId: "S1-8", status: "AVAILABLE" },
          { seatId: "S1-9", status: "AVAILABLE" },
          { seatId: "S1-10", status: "BOOKED" },
        ],
        [
          { seatId: "S2-1", status: "HOLD" },
          { seatId: "S2-2", status: "AVAILABLE" },
          { seatId: "S2-3", status: "AVAILABLE" },
          { seatId: "S2-4", status: "AVAILABLE" },
          { seatId: "S2-5", status: "BOOKED" },
          { seatId: "S2-6", status: "AVAILABLE" },
          { seatId: "S2-7", status: "AVAILABLE" },
          { seatId: "S2-8", status: "AVAILABLE" },
          { seatId: "S2-9", status: "HOLD" },
          { seatId: "S2-10", status: "AVAILABLE" },
        ],
        [
          { seatId: "S3-1", status: "AVAILABLE" },
          { seatId: "S3-2", status: "BOOKED" },
          { seatId: "S3-3", status: "AVAILABLE" },
          { seatId: "S3-4", status: "AVAILABLE" },
          { seatId: "S3-5", status: "AVAILABLE" },
          { seatId: "S3-6", status: "HOLD" },
          { seatId: "S3-7", status: "AVAILABLE" },
          { seatId: "S3-8", status: "BOOKED" },
          { seatId: "S3-9", status: "AVAILABLE" },
          { seatId: "S3-10", status: "AVAILABLE" },
        ],
        [
          { seatId: "S4-1", status: "AVAILABLE" },
          { seatId: "S4-2", status: "AVAILABLE" },
          { seatId: "S4-3", status: "BOOKED" },
          { seatId: "S4-4", status: "AVAILABLE" },
          { seatId: "S4-5", status: "AVAILABLE" },
          { seatId: "S4-6", status: "AVAILABLE" },
          { seatId: "S4-7", status: "AVAILABLE" },
          { seatId: "S4-8", status: "AVAILABLE" },
          { seatId: "S4-9", status: "BOOKED" },
          { seatId: "S4-10", status: "HOLD" },
        ],
      ],
    },
    {
      sectionId: "BRONZE",
      sectionName: "Bronze",
      price: 4000,
      rows: [
        [
          { seatId: "B1-1", status: "AVAILABLE" },
          { seatId: "B1-2", status: "AVAILABLE" },
          { seatId: "B1-3", status: "BOOKED" },
          { seatId: "B1-4", status: "AVAILABLE" },
          { seatId: "B1-5", status: "AVAILABLE" },
          { seatId: "B1-6", status: "AVAILABLE" },
          { seatId: "B1-7", status: "HOLD" },
          { seatId: "B1-8", status: "AVAILABLE" },
          { seatId: "B1-9", status: "AVAILABLE" },
          { seatId: "B1-10", status: "AVAILABLE" },
          { seatId: "B1-11", status: "BOOKED" },
          { seatId: "B1-12", status: "AVAILABLE" },
        ],
        [
          { seatId: "B2-1", status: "AVAILABLE" },
          { seatId: "B2-2", status: "HOLD" },
          { seatId: "B2-3", status: "AVAILABLE" },
          { seatId: "B2-4", status: "AVAILABLE" },
          { seatId: "B2-5", status: "BOOKED" },
          { seatId: "B2-6", status: "AVAILABLE" },
          { seatId: "B2-7", status: "AVAILABLE" },
          { seatId: "B2-8", status: "AVAILABLE" },
          { seatId: "B2-9", status: "HOLD" },
          { seatId: "B2-10", status: "AVAILABLE" },
          { seatId: "B2-11", status: "AVAILABLE" },
          { seatId: "B2-12", status: "BOOKED" },
        ],
        [
          { seatId: "B3-1", status: "BOOKED" },
          { seatId: "B3-2", status: "AVAILABLE" },
          { seatId: "B3-3", status: "AVAILABLE" },
          { seatId: "B3-4", status: "AVAILABLE" },
          { seatId: "B3-5", status: "AVAILABLE" },
          { seatId: "B3-6", status: "HOLD" },
          { seatId: "B3-7", status: "AVAILABLE" },
          { seatId: "B3-8", status: "BOOKED" },
          { seatId: "B3-9", status: "AVAILABLE" },
          { seatId: "B3-10", status: "AVAILABLE" },
          { seatId: "B3-11", status: "AVAILABLE" },
          { seatId: "B3-12", status: "AVAILABLE" },
        ],
        [
          { seatId: "B4-1", status: "AVAILABLE" },
          { seatId: "B4-2", status: "AVAILABLE" },
          { seatId: "B4-3", status: "AVAILABLE" },
          { seatId: "B4-4", status: "BOOKED" },
          { seatId: "B4-5", status: "AVAILABLE" },
          { seatId: "B4-6", status: "AVAILABLE" },
          { seatId: "B4-7", status: "AVAILABLE" },
          { seatId: "B4-8", status: "AVAILABLE" },
          { seatId: "B4-9", status: "AVAILABLE" },
          { seatId: "B4-10", status: "BOOKED" },
          { seatId: "B4-11", status: "HOLD" },
          { seatId: "B4-12", status: "AVAILABLE" },
        ],
        [
          { seatId: "B5-1", status: "AVAILABLE" },
          { seatId: "B5-2", status: "BOOKED" },
          { seatId: "B5-3", status: "AVAILABLE" },
          { seatId: "B5-4", status: "AVAILABLE" },
          { seatId: "B5-5", status: "HOLD" },
          { seatId: "B5-6", status: "AVAILABLE" },
          { seatId: "B5-7", status: "BOOKED" },
          { seatId: "B5-8", status: "AVAILABLE" },
          { seatId: "B5-9", status: "AVAILABLE" },
          { seatId: "B5-10", status: "AVAILABLE" },
          { seatId: "B5-11", status: "AVAILABLE" },
          { seatId: "B5-12", status: "AVAILABLE" },
        ],
      ],
    },
  ],
};

// Helper to simulate backend delay
export const simulateDelay = (ms = 400) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Helper to simulate random success/failure (70% success rate)
export const simulateBookingAttempt = () => {
  return Math.random() > 0.3;
};

// Helper to simulate payment (80% success rate)
export const simulatePayment = () => {
  return Math.random() > 0.2;
};
