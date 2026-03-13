import { NextResponse } from "next/server";
import { 
  setGeoUnlockTime, 
  getGeoUnlockTime, 
  isGeoUnlocked, 
  getGeoUnlockStatus,
  getAllGeoUnlockTimes
} from "@/lib/locks";

/**
 * GET /api/geo-unlock
 * Get geo-unlock status for booking regions
 * 
 * Query params:
 * - city: Specific city to check (optional)
 * - cities: Comma-separated list of cities (optional)
 * 
 * Returns status for cities (unlocked/locked with countdown)
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city");
    const citiesParam = searchParams.get("cities");

    // Get specific city status
    if (city) {
      const geoStatus = await isGeoUnlocked(city);
      return NextResponse.json({
        city,
        ...geoStatus,
        unlocksAtDate: geoStatus.unlocksAt 
          ? new Date(geoStatus.unlocksAt * 1000).toISOString() 
          : null,
      });
    }

    // Get multiple cities status
    if (citiesParam) {
      const cities = citiesParam.split(",").map(c => c.trim());
      const statuses = await getGeoUnlockStatus(cities);
      
      const result = {};
      for (const [city, status] of Object.entries(statuses)) {
        result[city] = {
          ...status,
          unlocksAtDate: status.unlocksAt 
            ? new Date(status.unlocksAt * 1000).toISOString() 
            : null,
        };
      }
      
      return NextResponse.json(result);
    }

    // Get all configured cities
    const allTimes = await getAllGeoUnlockTimes();
    const result = {};
    
    for (const [city, timeData] of Object.entries(allTimes)) {
      const geoStatus = await isGeoUnlocked(city);
      result[city] = {
        ...geoStatus,
        unlocksAtDate: new Date(geoStatus.unlocksAt * 1000).toISOString(),
      };
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Error fetching geo-unlock status:", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: err.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/geo-unlock
 * Set or update geo-unlock time for a city
 * 
 * Body:
 * {
 *   "city": "ahmedabad",
 *   "unlocksAt": "2024-02-25T05:00:00Z" (ISO string) or Unix timestamp
 * }
 */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { city, unlocksAt } = body;

    if (!city || !unlocksAt) {
      return NextResponse.json(
        { error: "INVALID_REQUEST", message: "city and unlocksAt required" },
        { status: 400 }
      );
    }

    // Convert to Unix timestamp if ISO string
    let unixTimestamp;
    if (typeof unlocksAt === "string") {
      unixTimestamp = Math.floor(new Date(unlocksAt).getTime() / 1000);
    } else {
      unixTimestamp = unlocksAt;
    }

    // Validate timestamp is in the future (or very close)
    const now = Math.floor(Date.now() / 1000);
    if (unixTimestamp < now - 60) { // Allow 60 second tolerance
      return NextResponse.json(
        { error: "INVALID_TIME", message: "Unlock time must be in the future" },
        { status: 400 }
      );
    }

    await setGeoUnlockTime(city, unixTimestamp);

    return NextResponse.json({
      success: true,
      city,
      unlocksAt: unixTimestamp,
      unlocksAtDate: new Date(unixTimestamp * 1000).toISOString(),
    });
  } catch (err) {
    console.error("Error setting geo-unlock time:", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: err.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/geo-unlock
 * Bulk set geo-unlock times for multiple cities
 * 
 * Body:
 * {
 *   "ahmedabad": "2024-02-25T05:00:00Z",
 *   "pune": "2024-02-25T05:01:00Z",
 *   "delhi": "2024-02-25T05:03:00Z"
 * }
 */
export async function PUT(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const results = {};
    
    for (const [city, unlocksAt] of Object.entries(body)) {
      try {
        // Convert to Unix timestamp if ISO string
        let unixTimestamp;
        if (typeof unlocksAt === "string") {
          const dateObj = new Date(unlocksAt);
          if (isNaN(dateObj.getTime())) {
            throw new Error(`Invalid date format for city "${city}": ${unlocksAt}`);
          }
          unixTimestamp = Math.floor(dateObj.getTime() / 1000);
        } else {
          unixTimestamp = unlocksAt;
        }

        await setGeoUnlockTime(city, unixTimestamp);
        
        results[city] = {
          unlocksAt: unixTimestamp,
          unlocksAtDate: new Date(unixTimestamp * 1000).toISOString(),
        };
      } catch (cityErr) {
        return NextResponse.json(
          { 
            error: "INVALID_TIME_FORMAT", 
            message: cityErr.message,
            city,
            value: unlocksAt
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      updated: Object.keys(results).length,
      cities: results,
    });
  } catch (err) {
    console.error("Error bulk setting geo-unlock times:", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: err.message },
      { status: 500 }
    );
  }
}
