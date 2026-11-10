"""Prepare local infrastructure.

  * SQLite: creates the users table
  * DynamoDB: creates the `node` table (empty by default)
  * Silo: creates the buckets (music, music-cover, profile-picture) with anonymous read access

Usage:
  uv run python -m scripts.init_infra            # create whatever is missing (keeps existing data)
  uv run python -m scripts.init_infra --reset    # wipe users, nodes and files: a brand-new empty app
"""
import argparse
import sys

from app.core.config import get_settings
from app.infrastructure.dynamo_node_repository import DynamoNodeRepository
from app.infrastructure.silo_object_storage import SiloObjectStorage
from app.infrastructure.sqlite_user_repository import SqliteUserRepository


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="delete all users, nodes and stored files first")
    args = parser.parse_args()
    settings = get_settings()

    users = SqliteUserRepository(settings.sqlite_path)
    nodes = DynamoNodeRepository(
        table_name=settings.dynamodb_table,
        endpoint_url=settings.dynamodb_endpoint,
        region=settings.dynamodb_region,
        access_key=settings.aws_access_key_id,
        secret_key=settings.aws_secret_access_key,
    )
    storage = SiloObjectStorage(
        endpoint_url=settings.s3_endpoint,
        public_endpoint=settings.s3_public_endpoint,
        access_key=settings.s3_access_key,
        secret_key=settings.s3_secret_key,
        region=settings.s3_region,
    )

    if args.reset:
        users.clear()
        print("[sqlite] all users deleted")
        if nodes.drop_table():
            print(f"[dynamodb] table '{settings.dynamodb_table}' deleted")
        for bucket in settings.buckets:
            print(f"[silo] bucket '{bucket}': {storage.empty_bucket(bucket)} objects deleted")

    print(f"[sqlite] users table ready at {settings.sqlite_path}")

    created = nodes.ensure_table()
    print(f"[dynamodb] table '{settings.dynamodb_table}' {'created' if created else 'already exists'}")

    for bucket in settings.buckets:
        storage.ensure_bucket(bucket, public_read=True)
        print(f"[silo] bucket '{bucket}' ready (public read)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
