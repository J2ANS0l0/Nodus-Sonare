"""Prepare local infrastructure.

  * SQLite: creates the users table
  * DynamoDB: creates the `node` table and seeds it from data/nodes.json (only when empty, or with --reseed)
  * Silo: creates the buckets (music, music-cover, profile-picture) with anonymous read access

Usage:  uv run python -m scripts.init_infra [--reseed]
"""
import argparse
import json
import sys

from app.core.config import get_settings
from app.infrastructure.dynamo_node_repository import DynamoNodeRepository
from app.infrastructure.silo_object_storage import SiloObjectStorage
from app.infrastructure.sqlite_user_repository import SqliteUserRepository


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reseed", action="store_true", help="overwrite nodes with data/nodes.json even if not empty")
    args = parser.parse_args()
    settings = get_settings()

    SqliteUserRepository(settings.sqlite_path)
    print(f"[sqlite] users table ready at {settings.sqlite_path}")

    nodes = DynamoNodeRepository(
        table_name=settings.dynamodb_table,
        endpoint_url=settings.dynamodb_endpoint,
        region=settings.dynamodb_region,
        access_key=settings.aws_access_key_id,
        secret_key=settings.aws_secret_access_key,
    )
    created = nodes.ensure_table()
    print(f"[dynamodb] table '{settings.dynamodb_table}' {'created' if created else 'already exists'}")

    if args.reseed or not nodes.list_all():
        seed = json.loads(settings.nodes_seed_path.read_text(encoding="utf-8"))
        nodes.save_many(seed)
        print(f"[dynamodb] seeded {len(seed)} nodes from {settings.nodes_seed_path}")
    else:
        print("[dynamodb] table already has data, skipping seed (use --reseed to overwrite)")

    storage = SiloObjectStorage(
        endpoint_url=settings.s3_endpoint,
        public_endpoint=settings.s3_public_endpoint,
        access_key=settings.s3_access_key,
        secret_key=settings.s3_secret_key,
        region=settings.s3_region,
    )
    for bucket in settings.buckets:
        storage.ensure_bucket(bucket, public_read=True)
        print(f"[silo] bucket '{bucket}' ready (public read)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
