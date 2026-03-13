/**
 * AWS DynamoDB Client
 */
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, waitUntilTableExists } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand, TransactWriteCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { startWorker } from "./worker";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true }
});

const TABLES = {
  SEATS: "Seats",
  BOOKINGS: "Bookings",
  PAYMENTS: "Payments"
};

/**
 * Ensure tables exist and seed data
 */
export async function initDB() {
  await ensureTables();
  await seedSeats();
  
  // Start the background worker (Singleton)
  startWorker();
  
  console.log("✓ DynamoDB initialized");
}

async function ensureTables() {
  const tableDefinitions = [
    {
      TableName: TABLES.SEATS,
      KeySchema: [{ AttributeName: "seat_id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "seat_id", AttributeType: "S" }]
    },
    {
      TableName: TABLES.BOOKINGS,
      KeySchema: [{ AttributeName: "booking_id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "booking_id", AttributeType: "S" }]
    },
    {
      TableName: TABLES.PAYMENTS,
      KeySchema: [{ AttributeName: "idempotency_key", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "idempotency_key", AttributeType: "S" }]
    }
  ];

  for (const def of tableDefinitions) {
    try {
      await dynamoClient.send(new DescribeTableCommand({ TableName: def.TableName }));
    } catch (err) {
      if (err.name === "ResourceNotFoundException") {
        console.log(`Creating table ${def.TableName}...`);
        await dynamoClient.send(new CreateTableCommand({
          ...def,
          BillingMode: "PAY_PER_REQUEST"
        }));
        await waitUntilTableExists({ client: dynamoClient, maxWaitTime: 60 }, { TableName: def.TableName });
        console.log(`✓ Table ${def.TableName} created`);
      } else {
        throw err;
      }
    }
  }
}

async function seedSeats() {
  const { Count } = await docClient.send(new ScanCommand({ 
    TableName: TABLES.SEATS, 
    Select: "COUNT" 
  }));

  if (Count > 0) return;

  console.log("Seeding seats...");
  const sections = { A: 24, B: 40, C: 60 };
  const requests = [];

  for (const [sectionId, count] of Object.entries(sections)) {
    for (let i = 1; i <= count; i++) {
      requests.push({
        PutRequest: {
          Item: {
            seat_id: `${sectionId}${i}`,
            section_id: sectionId,
            status: "AVAILABLE"
          }
        }
      });
    }
  }

  // Batch write (max 25 items per request)
  const chunks = [];
  while (requests.length > 0) {
    chunks.push(requests.splice(0, 25));
  }

  for (const chunk of chunks) {
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [TABLES.SEATS]: chunk
      }
    }));
  }
  
  console.log("✓ Seeded seats table");
}

export async function getAllSeats() {
  // Scan is okay for small dataset (~124 seats)
  const { Items } = await docClient.send(new ScanCommand({ TableName: TABLES.SEATS }));
  
  // Sort to match SQL expectation (Section, then ID)
  // Simple sort: A1, A2... B1...
  return Items.sort((a, b) => {
    if (a.section_id !== b.section_id) return a.section_id.localeCompare(b.section_id);
    // numeric sort for seat number part if needed, but string sort is default in prev impl
    // Actually typically A1, A10, A2. Let's mimic basic string sort of ID or try to be smart?
    // SQL `ORDER BY section_id, seat_id` does string sort: A1, A10, A2...
    return a.seat_id.localeCompare(b.seat_id);
  });
}

export async function getSeat(seatId) {
  const { Item } = await docClient.send(new GetCommand({
    TableName: TABLES.SEATS,
    Key: { seat_id: seatId }
  }));
  return Item || null;
}

export async function createBooking({ bookingId, seatId, sectionId, userId }) {
  // Transaction: Update Seat status AND Create Booking
  try {
    await docClient.send(new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLES.SEATS,
            Key: { seat_id: seatId },
            UpdateExpression: "SET #s = :booked",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":booked": "BOOKED" }
          }
        },
        {
          Put: {
            TableName: TABLES.BOOKINGS,
            Item: {
              booking_id: bookingId,
              seat_id: seatId,
              section_id: sectionId,
              user_id: userId,
              status: "BOOKED",
              created_at: new Date().toISOString()
            }
          }
        }
      ]
    }));
    return { bookingId, seatId, sectionId, userId, status: "BOOKED" };
  } catch (err) {
    console.error("Transaction failed:", err);
    throw err;
  }
}

export async function getBooking(bookingId) {
  const { Item } = await docClient.send(new GetCommand({
    TableName: TABLES.BOOKINGS,
    Key: { booking_id: bookingId }
  }));
  return Item || null;
}

export async function getPaymentByKey(idempotencyKey) {
  const { Item } = await docClient.send(new GetCommand({
    TableName: TABLES.PAYMENTS,
    Key: { idempotency_key: idempotencyKey }
  }));
  return Item || null;
}

export async function savePayment({ bookingId, status, idempotencyKey }) {
  try {
    await docClient.send(new PutCommand({
      TableName: TABLES.PAYMENTS,
      Item: {
        booking_id: bookingId,
        status: status,
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString()
      },
      // Ensure idempotency: Fail if key exists (client handles conflict, or we return existing)
      ConditionExpression: "attribute_not_exists(idempotency_key)"
    }));
    return { booking_id: bookingId, status, idempotency_key: idempotencyKey };
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      // Return existing
      return await getPaymentByKey(idempotencyKey);
    }
    throw err;
  }
}
