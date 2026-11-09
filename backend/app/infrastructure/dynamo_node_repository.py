"""DynamoDB implementation of NodeRepository. Items keep the exact shape of data/nodes.json."""
from decimal import Decimal
from typing import Any, Iterable

import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

from app.domain.entities import Node
from app.domain.exceptions import ConflictError


def _from_dynamo(value: Any) -> Any:
    """Convert boto3 Decimals back to plain JSON numbers."""
    if isinstance(value, list):
        return [_from_dynamo(v) for v in value]
    if isinstance(value, dict):
        return {k: _from_dynamo(v) for k, v in value.items()}
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    return value


def _to_dynamo(value: Any) -> Any:
    """DynamoDB rejects Python floats; store them as Decimal."""
    if isinstance(value, list):
        return [_to_dynamo(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_dynamo(v) for k, v in value.items()}
    if isinstance(value, float):
        return Decimal(str(value))
    return value


class DynamoNodeRepository:
    def __init__(self, table_name: str, endpoint_url: str, region: str, access_key: str, secret_key: str):
        self._resource = boto3.resource(
            "dynamodb",
            endpoint_url=endpoint_url,
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
        self._table_name = table_name
        self._table = self._resource.Table(table_name)

    # --- administration -------------------------------------------------------------------
    def ensure_table(self) -> bool:
        """Create the table if missing. Returns True when it was created."""
        existing = self._resource.meta.client.list_tables()["TableNames"]
        if self._table_name in existing:
            return False
        table = self._resource.create_table(
            TableName=self._table_name,
            KeySchema=[{"AttributeName": "node_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "node_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        table.wait_until_exists()
        return True

    # --- queries ----------------------------------------------------------------------------
    def _scan(self, **kwargs: Any) -> list[Node]:
        items: list[Node] = []
        while True:
            response = self._table.scan(**kwargs)
            items.extend(response.get("Items", []))
            last_key = response.get("LastEvaluatedKey")
            if not last_key:
                return [_from_dynamo(i) for i in items]
            kwargs["ExclusiveStartKey"] = last_key

    def list_all(self) -> list[Node]:
        nodes = self._scan()
        nodes.sort(key=lambda n: (int(n["node_id"]) if str(n["node_id"]).isdigit() else 0, n["node_id"]))
        return nodes

    def get(self, node_id: str) -> Node | None:
        item = self._table.get_item(Key={"node_id": node_id}).get("Item")
        return _from_dynamo(item) if item else None

    def find_author_by_author_id(self, author_id: str) -> Node | None:
        items = self._scan(FilterExpression=Attr("node_type").eq("Author") & Attr("author_id").eq(author_id))
        return items[0] if items else None

    # --- commands ---------------------------------------------------------------------------
    def create(self, node: Node) -> Node:
        try:
            self._table.put_item(Item=_to_dynamo(node), ConditionExpression="attribute_not_exists(node_id)")
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise ConflictError(f"Node {node['node_id']} already exists, retry the operation") from exc
            raise
        return node

    def save(self, node: Node) -> Node:
        self._table.put_item(Item=_to_dynamo(node))
        return node

    def save_many(self, nodes: Iterable[Node]) -> None:
        with self._table.batch_writer(overwrite_by_pkeys=["node_id"]) as batch:
            for node in nodes:
                batch.put_item(Item=_to_dynamo(node))
