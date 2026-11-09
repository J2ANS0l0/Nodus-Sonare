import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import * as fs from "fs";

const client = new DynamoDBClient({
  region: "us-east-1",
  endpoint: "http://localhost:8002",
  credentials: {
    accessKeyId: "dummy",
    secretAccessKey: "dummy"
  }
});

const doc_client = DynamoDBDocumentClient.from(client);

async function run() {
  const raw = fs.readFileSync("data/nodes.json", "utf-8");
  const items = JSON.parse(raw);

  for (const item of items) {
    await doc_client.send(
      new PutCommand({
        TableName: "node",
        Item: item
      })
    );
  }
}

run();