"""Creates or updates Reconomy's AWS resources. Safe to run again (idempotent).

  - S3 bucket  reconomy-data-<account>   (private, encrypted) with data/catalog.csv and data/rates.json
  - IAM role   reconomy-catalog-lambda   (read-only access to that bucket + CloudWatch logs)
  - Lambda     reconomy-catalog          (matches AI-identified items to the catalog)

Usage:
  .venv/bin/python scripts/setup_aws.py              # everything
  .venv/bin/python scripts/setup_aws.py --data-only  # just re-upload catalog.csv / rates.json after editing them
"""
import io
import json
import os
import sys
import time
import zipfile
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
FUNCTION = os.getenv("CATALOG_FUNCTION", "reconomy-catalog")
ROLE = "reconomy-catalog-lambda"

session = boto3.Session(
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    aws_session_token=os.getenv("AWS_SESSION_TOKEN"),
    region_name=REGION,
)
account = session.client("sts").get_caller_identity()["Account"]
BUCKET = os.getenv("DATA_BUCKET", f"reconomy-data-{account}")
s3, iam, lam = session.client("s3"), session.client("iam"), session.client("lambda")


def bucket():
    try:
        s3.head_bucket(Bucket=BUCKET)
        print(f"bucket   {BUCKET} exists")
    except ClientError:
        kw = {} if REGION == "us-east-1" else {"CreateBucketConfiguration": {"LocationConstraint": REGION}}
        s3.create_bucket(Bucket=BUCKET, **kw)
        print(f"bucket   {BUCKET} created")
    s3.put_public_access_block(Bucket=BUCKET, PublicAccessBlockConfiguration={
        "BlockPublicAcls": True, "IgnorePublicAcls": True, "BlockPublicPolicy": True, "RestrictPublicBuckets": True})
    s3.put_bucket_encryption(Bucket=BUCKET, ServerSideEncryptionConfiguration={
        "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]})


def upload_data():
    json.loads((ROOT / "data/rates.json").read_text())  # fail early on a JSON typo
    for name, ctype in (("catalog.csv", "text/csv"), ("rates.json", "application/json")):
        s3.upload_file(str(ROOT / "data" / name), BUCKET, f"data/{name}", ExtraArgs={"ContentType": ctype})
        print(f"upload   s3://{BUCKET}/data/{name}")


def role():
    trust = {"Version": "2012-10-17", "Statement": [
        {"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}]}
    try:
        arn = iam.create_role(RoleName=ROLE, AssumeRolePolicyDocument=json.dumps(trust))["Role"]["Arn"]
        print(f"role     {ROLE} created")
        fresh = True
    except iam.exceptions.EntityAlreadyExistsException:
        arn = iam.get_role(RoleName=ROLE)["Role"]["Arn"]
        print(f"role     {ROLE} exists")
        fresh = False
    iam.attach_role_policy(RoleName=ROLE, PolicyArn="arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole")
    iam.put_role_policy(RoleName=ROLE, PolicyName="read-reconomy-data", PolicyDocument=json.dumps({
        "Version": "2012-10-17", "Statement": [
            {"Effect": "Allow", "Action": "s3:GetObject", "Resource": f"arn:aws:s3:::{BUCKET}/data/*"}]}))
    return arn, fresh


def code_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(ROOT / "lambda/catalog/handler.py", "handler.py")
    return buf.getvalue()


def function(role_arn, fresh_role):
    env = {"Variables": {"BUCKET": BUCKET}}
    try:
        lam.get_function(FunctionName=FUNCTION)
        lam.update_function_code(FunctionName=FUNCTION, ZipFile=code_zip())
        lam.get_waiter("function_updated_v2").wait(FunctionName=FUNCTION)
        lam.update_function_configuration(FunctionName=FUNCTION, Environment=env, Role=role_arn)
        print(f"lambda   {FUNCTION} updated")
    except lam.exceptions.ResourceNotFoundException:
        for attempt in range(10):  # a brand-new IAM role takes a few seconds to become usable
            try:
                lam.create_function(FunctionName=FUNCTION, Runtime="python3.12", Handler="handler.handler",
                                    Role=role_arn, Code={"ZipFile": code_zip()}, Timeout=15, MemorySize=256,
                                    Architectures=["arm64"], Environment=env,
                                    Description="Reconomy: match AI-identified returns to the S3 catalog")
                print(f"lambda   {FUNCTION} created")
                break
            except lam.exceptions.InvalidParameterValueException:
                if attempt == 9:
                    raise
                time.sleep(3 if not fresh_role else 5)
    lam.get_waiter("function_active_v2").wait(FunctionName=FUNCTION)
    lam.get_waiter("function_updated_v2").wait(FunctionName=FUNCTION)


def smoke():
    for attempt in range(8):  # new IAM permissions can take ~10-20 s to apply (shows up as S3 403)
        out = lam.invoke(FunctionName=FUNCTION, Payload=json.dumps(
            {"items": [{"name": "Nike Free RN Flyknit", "brand": "Nike", "model": "Free RN Flyknit", "observedText": ["NIKE", "FREE", "RN", "FLYKNIT"], "category": "apparel", "identityConfidence": 0.95}]}).encode())
        body = json.loads(out["Payload"].read())
        if not out.get("FunctionError"):
            break
        if "403" not in str(body) or attempt == 7:
            sys.exit(f"Lambda test FAILED: {body}")
        print("test     waiting for IAM permissions to apply...")
        time.sleep(5)
    match = body["matches"][0]
    if match.get("status") != "verified":
        sys.exit(f"Lambda test FAILED: expected a verified catalog match, got {match}")
    print(f"test     catalog={body['catalogSize']} products, verified match={match}")


if __name__ == "__main__":
    bucket()
    upload_data()
    if "--data-only" not in sys.argv:
        arn, fresh = role()
        function(arn, fresh)
    smoke()
    print("done")
