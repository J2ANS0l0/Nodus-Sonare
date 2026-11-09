import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const dynamo_config = {
  region: "us-east-1",
  endpoint: "http://localhost:8002",
  credentials: {
    accessKeyId: "minioadmin",
    secretAccessKey: "minioadmin123",
  },
};

const client = new DynamoDBClient(dynamo_config);
const doc_client = DynamoDBDocumentClient.from(client);

async function check_nodes() {
  try {
    const command = new ScanCommand({
      TableName: "node",
    });
    const response = await doc_client.send(command);
    console.log("Count:", response.Count);
    console.log("First item:", JSON.stringify(response.Items?.[0], null, 2));
  } catch (error) {
    console.error("Error:", error);
  }
}

check_nodes();
