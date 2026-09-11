#!/usr/bin/env python3
"""Snapshot and compare effective inline IAM permissions grouped by role."""

from __future__ import annotations

import argparse
import difflib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.parse import unquote_plus


def aws(*arguments: str) -> dict[str, Any]:
    endpoint = os.environ.get("AWS_ENDPOINT_URL")
    region = os.environ.get("AWS_DEFAULT_REGION") or os.environ.get("AWS_REGION")
    command = ["aws"]
    if endpoint:
        command.extend(["--endpoint-url", endpoint])
    if region:
        command.extend(["--region", region])
    command.extend(["iam", *arguments, "--output", "json"])
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def canonical(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: canonical(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        values = [canonical(item) for item in value]
        return sorted(values, key=lambda item: json.dumps(item, sort_keys=True))
    return value


def policy_document(value: Any) -> Any:
    if isinstance(value, dict):
        return canonical(value)
    if not isinstance(value, str):
        raise TypeError(f"Unexpected IAM policy document type: {type(value).__name__}")

    decoded = unquote_plus(value)
    return canonical(json.loads(decoded))


def values(value: Any) -> list[Any]:
    if value is None:
        return [None]
    return value if isinstance(value, list) else [value]


def permission_entries(document: dict[str, Any]) -> set[str]:
    statements = values(document.get("Statement", []))
    entries: set[str] = set()
    for statement in statements:
        if not isinstance(statement, dict):
            raise TypeError("Unexpected IAM statement type")

        base = {
            key: canonical(value)
            for key, value in statement.items()
            if key not in {"Action", "NotAction", "Resource", "NotResource", "Sid"}
        }
        actions = values(statement.get("Action", statement.get("NotAction")))
        resources = values(statement.get("Resource", statement.get("NotResource")))
        action_key = "Action" if "Action" in statement else "NotAction"
        resource_key = "Resource" if "Resource" in statement else "NotResource"

        for action in actions:
            for resource in resources:
                entry = dict(base)
                if action is not None:
                    entry[action_key] = action
                if resource is not None:
                    entry[resource_key] = resource
                entries.add(json.dumps(canonical(entry), sort_keys=True))
    return entries


def snapshot() -> dict[str, Any]:
    roles_snapshot: dict[str, Any] = {}
    roles = aws("list-roles").get("Roles", [])
    for role in sorted(roles, key=lambda item: item["RoleName"]):
        role_name = role["RoleName"]
        permissions: set[str] = set()
        policy_names = aws("list-role-policies", "--role-name", role_name).get("PolicyNames", [])
        for policy_name in sorted(policy_names):
            response = aws(
                "get-role-policy",
                "--role-name",
                role_name,
                "--policy-name",
                policy_name,
            )
            document = policy_document(response["PolicyDocument"])
            permissions.update(permission_entries(document))
        if permissions:
            roles_snapshot[role_name] = {
                "permissions": [json.loads(value) for value in sorted(permissions)]
            }
    return {"roles": roles_snapshot}


def write_snapshot(path: Path) -> None:
    path.write_text(json.dumps(snapshot(), indent=2, sort_keys=True) + "\n", encoding="utf-8")


def compare(first_path: Path, second_path: Path) -> int:
    first = json.loads(first_path.read_text(encoding="utf-8"))["roles"]
    second = json.loads(second_path.read_text(encoding="utf-8"))["roles"]
    first_keys = set(first)
    second_keys = set(second)

    differences = False
    for key in sorted(first_keys - second_keys):
        differences = True
        print(f"IAM role removed after migration: {key}", file=sys.stderr)
    for key in sorted(second_keys - first_keys):
        differences = True
        print(f"IAM role added after migration: {key}", file=sys.stderr)
    for key in sorted(first_keys & second_keys):
        if first[key] == second[key]:
            continue
        differences = True
        before = json.dumps(first[key], indent=2, sort_keys=True).splitlines(keepends=True)
        after = json.dumps(second[key], indent=2, sort_keys=True).splitlines(keepends=True)
        print(f"IAM role permissions changed after migration: {key}", file=sys.stderr)
        print(
            "".join(
                difflib.unified_diff(
                    before,
                    after,
                    fromfile=f"v1/{key}/permissions",
                    tofile=f"v2/{key}/permissions",
                )
            ),
            file=sys.stderr,
        )

    if differences:
        return 1
    print("IAM role permissions are unchanged after migration.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    snapshot_parser = subparsers.add_parser("snapshot", help="Write an IAM policy snapshot.")
    snapshot_parser.add_argument("output", type=Path)

    compare_parser = subparsers.add_parser("compare", help="Compare two IAM policy snapshots.")
    compare_parser.add_argument("first", type=Path)
    compare_parser.add_argument("second", type=Path)

    arguments = parser.parse_args()
    if arguments.command == "snapshot":
        write_snapshot(arguments.output)
        return 0
    return compare(arguments.first, arguments.second)


if __name__ == "__main__":
    raise SystemExit(main())
