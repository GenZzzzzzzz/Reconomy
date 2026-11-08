"""Deletes everything scripts/setup_aws.py created: the Lambda, its IAM role and the S3 bucket (with its files)."""
import os
from pathlib import Path

import boto3
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
session = boto3.Session(
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    aws_session_token=os.getenv("AWS_SESSION_TOKEN"),
    region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1"),
)
account = session.client("sts").get_caller_identity()["Account"]
BUCKET = os.getenv("DATA_BUCKET", f"reconomy-data-{account}")
FUNCTION = os.getenv("CATALOG_FUNCTION", "reconomy-catalog")
ROLE = "reconomy-catalog-lambda"

if input(f"Delete Lambda {FUNCTION}, role {ROLE} and bucket {BUCKET} with all files? Type yes: ") != "yes":
    raise SystemExit("Cancelled.")

lam, iam = session.client("lambda"), session.client("iam")
try:
    lam.delete_function(FunctionName=FUNCTION); print("deleted lambda")
except lam.exceptions.ResourceNotFoundException:
    pass
try:
    for p in iam.list_attached_role_policies(RoleName=ROLE)["AttachedPolicies"]:
        iam.detach_role_policy(RoleName=ROLE, PolicyArn=p["PolicyArn"])
    for p in iam.list_role_policies(RoleName=ROLE)["PolicyNames"]:
        iam.delete_role_policy(RoleName=ROLE, PolicyName=p)
    iam.delete_role(RoleName=ROLE); print("deleted role")
except iam.exceptions.NoSuchEntityException:
    pass
b = session.resource("s3").Bucket(BUCKET)
try:
    b.objects.all().delete(); b.delete(); print("deleted bucket")
except Exception as e:
    print("bucket:", e)
