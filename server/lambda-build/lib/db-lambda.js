/**
 * AWS DynamoDB Client (Lambda Version - No/Min Dependencies)
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1"
  // Credentials are automatically loaded from env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
});

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true }
});

const TABLES = {
  SEATS: "Seats",
  BOOKINGS: "Bookings",
  PAYMENTS: "Payments"
};

// Note: No initDB or startWorker here purely because Lambda doesn't need to seed/poll

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
