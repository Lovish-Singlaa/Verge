import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";

const QUEUE_URL = process.env.SQS_QUEUE_URL;

// Helper to extract region from URL (e.g., https://sqs.ap-south-1.amazonaws.com/...)
const getRegionFromUrl = (url) => {
  if (!url) return null;
  const match = url.match(/sqs\.([\w-]+)\.amazonaws\.com/);
  return match ? match[1] : null;
};

// Prioritize URL region to avoid "QueueUrl differs from SQSClient resolved endpoint" error
const region = getRegionFromUrl(QUEUE_URL) || process.env.AWS_REGION || "us-east-1";

const sqsClient = new SQSClient({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

export const mockSQS = {
  /**
   * Add message to SQS
   */
  async sendMessage(message) {
    if (!QUEUE_URL) {
      console.warn("⚠️ SQS_QUEUE_URL not set, skipping SQS send");
      return false;
    }

    try {
      const command = new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify(message),
      });
      const response = await sqsClient.send(command);
      console.log(`[SQS] Message sent, ID: ${response.MessageId}`);
      return true;
    } catch (err) {
      console.error("[SQS] Send failed:", err);
      return false;
    }
  },

  /**
   * Receive messages from SQS
   */
  async receiveMessage(maxMessages = 1) {
    if (!QUEUE_URL) return { Messages: [] };

    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: 5, // Long polling
      });
      const response = await sqsClient.send(command);
      return { Messages: response.Messages || [] };
    } catch (err) {
      console.error("[SQS] Receive failed:", err);
      return { Messages: [] };
    }
  },

  /**
   * Delete message from SQS
   */
  async deleteMessage(receiptHandle) {
    if (!QUEUE_URL) return false;

    try {
      const command = new DeleteMessageCommand({
        QueueUrl: QUEUE_URL,
        ReceiptHandle: receiptHandle,
      });
      await sqsClient.send(command);
      return true;
    } catch (err) {
      console.error("[SQS] Delete failed:", err);
      return false;
    }
  }
};
