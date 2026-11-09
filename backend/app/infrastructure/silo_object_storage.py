"""Silo (https://github.com/pgsty/silo) object storage via the S3 API."""
import json
from typing import BinaryIO
from urllib.parse import quote

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.domain.entities import StoredObject


class SiloObjectStorage:
    def __init__(self, endpoint_url: str, public_endpoint: str, access_key: str, secret_key: str, region: str):
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
        self._public_endpoint = public_endpoint.rstrip("/")

    def ensure_bucket(self, bucket: str, public_read: bool = True) -> None:
        try:
            self._client.head_bucket(Bucket=bucket)
        except ClientError:
            self._client.create_bucket(Bucket=bucket)
        if public_read:
            policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"AWS": ["*"]},
                        "Action": ["s3:GetObject"],
                        "Resource": [f"arn:aws:s3:::{bucket}/*"],
                    }
                ],
            }
            self._client.put_bucket_policy(Bucket=bucket, Policy=json.dumps(policy))

    def upload(self, bucket: str, key: str, data: BinaryIO, content_type: str) -> StoredObject:
        self._client.upload_fileobj(data, bucket, key, ExtraArgs={"ContentType": content_type})
        return StoredObject(bucket=bucket, key=key, url=self.public_url(bucket, key))

    def delete(self, bucket: str, key: str) -> None:
        self._client.delete_object(Bucket=bucket, Key=key)

    def public_url(self, bucket: str, key: str) -> str:
        return f"{self._public_endpoint}/{bucket}/{quote(key)}"
