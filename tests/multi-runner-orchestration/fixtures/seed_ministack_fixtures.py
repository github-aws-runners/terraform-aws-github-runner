#!/usr/bin/env python
"""Seed declared fixtures into a running MiniStack instance."""

from __future__ import print_function

import argparse
import json
import os
import subprocess
import sys
import time

try:
    from urllib.request import urlopen
except ImportError:  # Python 2.7 in the AWS CLI container image.
    from urllib2 import URLError, urlopen
else:
    from urllib.error import URLError

def aws(*args):
    endpoint = os.environ.get(
        "MINISTACK_ENDPOINT_URL",
        os.environ.get("AWS_ENDPOINT_URL", "http://localhost:4566"),
    )
    region = os.environ.get("AWS_DEFAULT_REGION", "eu-west-1")
    command = ["aws", "--endpoint-url", endpoint, "--region", region] + list(args)
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = process.communicate()
    if process.returncode:
        output = (stdout or b"") + (stderr or b"")
        if hasattr(output, "decode"):
            output = output.decode("utf-8")
        sys.stderr.write(output)
        raise subprocess.CalledProcessError(process.returncode, command, output)
    if hasattr(stdout, "decode"):
        stdout = stdout.decode("utf-8")
    return stdout.strip()


def wait_for_ministack(attempts=60):
    endpoint = os.environ.get(
        "MINISTACK_ENDPOINT_URL",
        os.environ.get("AWS_ENDPOINT_URL", "http://localhost:4566"),
    )
    health_url = endpoint.rstrip("/") + "/_ministack/health"
    for unused in range(attempts):
        try:
            response = urlopen(health_url, timeout=2)
            response.close()
            print("MiniStack is ready at {0}".format(endpoint), file=sys.stderr)
            return
        except (URLError, IOError):
            time.sleep(1)
    raise RuntimeError("MiniStack did not become ready at {0}".format(endpoint))


def seed_ami(fixture):
    name = fixture["name"]
    ami_id = aws(
        "ec2",
        "describe-images",
        "--owners",
        "self",
        "--filters",
        "Name=name,Values={0}".format(name),
        "Name=state,Values=available",
        "--query",
        "Images[0].ImageId",
        "--output",
        "text",
    )
    if ami_id != "None":
        print("Fixture AMI already exists: {0} ({1})".format(name, ami_id), file=sys.stderr)
        return None

    ami_id = aws(
        "ec2",
        "register-image",
        "--name",
        name,
        "--description",
        fixture.get("description", "MiniStack test-only AMI"),
        "--architecture",
        fixture["architecture"],
        "--root-device-name",
        fixture.get("root_device_name", "/dev/xvda"),
        "--virtualization-type",
        fixture.get("virtualization_type", "hvm"),
        "--image-location",
        fixture["image_location"],
        "--query",
        "ImageId",
        "--output",
        "text",
    )
    print("Created fixture AMI: {0} ({1})".format(name, ami_id), file=sys.stderr)
    return ami_id


def seed_ecr_repository(fixture):
    name = fixture["name"]
    try:
        aws(
            "ecr",
            "create-repository",
            "--repository-name",
            name,
            "--image-tag-mutability",
            fixture.get("image_tag_mutability", "IMMUTABLE"),
            "--image-scanning-configuration",
            "scanOnPush={0}".format(str(fixture.get("image_scanning_configuration", {}).get("scanOnPush", False)).lower()),
            "--output",
            "json",
        )
        print("Created fixture ECR repository: {0}".format(name), file=sys.stderr)
    except subprocess.CalledProcessError as error:
        output = error.output or ""
        if hasattr(output, "decode"):
            output = output.decode("utf-8")
        if "RepositoryAlreadyExistsException" not in output:
            raise
        print("Fixture ECR repository already exists: {0}".format(name), file=sys.stderr)

    policy = fixture.get("policy")
    if policy:
        aws(
            "ecr",
            "set-repository-policy",
            "--repository-name",
            name,
            "--policy-text",
            json.dumps(policy, separators=(",", ":")),
        )
        print("Applied fixture ECR repository policy: {0}".format(name), file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    default_manifest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ministack-fixtures.json")
    parser.add_argument("--manifest", default=default_manifest)
    parser.add_argument("--endpoint-url", help="MiniStack endpoint override")
    parser.add_argument("--region", help="AWS region override")
    parser.add_argument(
        "--type",
        dest="fixture_types",
        action="append",
        help="Seed only fixtures of this type; may be repeated",
    )
    parser.add_argument(
        "--name",
        dest="fixture_names",
        action="append",
        help="Seed only fixtures with this name; may be repeated",
    )
    parser.add_argument(
        "--created-ids",
        action="store_true",
        help="Print IDs of fixtures created during this run, for caller cleanup",
    )
    args = parser.parse_args()

    if args.endpoint_url:
        os.environ["MINISTACK_ENDPOINT_URL"] = args.endpoint_url
    if args.region:
        os.environ["AWS_DEFAULT_REGION"] = args.region

    wait_for_ministack()
    with open(args.manifest, "r") as manifest_file:
        manifest = json.load(manifest_file)
    fixtures = manifest.get("fixtures", [])
    selected = []
    for fixture in fixtures:
        fixture_type = fixture.get("type")
        if args.fixture_types and fixture_type not in args.fixture_types:
            continue
        if args.fixture_names and fixture.get("name") not in args.fixture_names:
            continue
        selected.append(fixture)

    created_ids = []
    for fixture in selected:
        fixture_type = fixture.get("type")
        if fixture_type == "ami":
            created_id = seed_ami(fixture)
            if created_id:
                created_ids.append(created_id)
        elif fixture_type == "ecr-repository":
            seed_ecr_repository(fixture)
        else:
            raise ValueError("Unsupported MiniStack fixture type: {0!r}".format(fixture_type))

    if args.created_ids:
        print("\n".join(created_ids))
    return 0


if __name__ == "__main__":
    sys.exit(main())
