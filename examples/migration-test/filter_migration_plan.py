#!/usr/bin/env python3
"""Report unexpected changes from a migration-test Terraform plan."""

from __future__ import annotations

import copy
import json
import sys
from typing import Any


IGNORED_RESOURCE_TYPES = {
    # Inline role policies are validated by compare_iam_role_policies.py.
    "aws_iam_role_policy",
    # MiniStack does not preserve the configured KMS key on these resources.
    "aws_ssm_parameter",
}
IGNORED_RESOURCE_ADDRESS_SUFFIXES = {
    # MiniStack does not preserve this queue policy consistently.
    ".aws_sqs_queue_policy.job_retry_check_queue_policy",
    # MiniStack does not preserve the launch-template version and tag state.
    ".aws_launch_template.runner",
}
IGNORED_TAG_KEYS = {"Name", "ghr:ssm_config_path"}
IGNORED_LAMBDA_ENVIRONMENT_KEYS = {
    ".aws_lambda_function.job_retry": {
        "NODE_TLS_REJECT_UNAUTHORIZED",
        "RUNNER_NAME_PREFIX",
        "USER_AGENT",
    },
    ".aws_lambda_function.pool": {
        "SSM_PARAMETER_STORE_TAGS",
    },
    ".aws_lambda_function.scale_up": {
        "SSM_PARAMETER_STORE_TAGS",
    },
}


def remove_assume_role_sids(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        policy = json.loads(value)
    except json.JSONDecodeError:
        return value
    if not isinstance(policy, dict):
        return value

    statements = policy.get("Statement")
    if isinstance(statements, dict):
        statements = [statements]
    if not isinstance(statements, list):
        return value

    normalized_statements = []
    for statement in statements:
        if isinstance(statement, dict):
            statement = dict(statement)
            statement.pop("Sid", None)
        normalized_statements.append(statement)
    policy = dict(policy)
    policy["Statement"] = normalized_statements
    return json.dumps(policy, sort_keys=True, separators=(",", ":"))


def without_expected_changes(
    value: Any, resource_type: str, resource_address: str
) -> Any:
    if not isinstance(value, dict):
        return value

    normalized = copy.deepcopy(value)
    for attribute in ("tags", "tags_all"):
        tags = normalized.get(attribute)
        if isinstance(tags, dict):
            normalized[attribute] = {
                key: tag_value
                for key, tag_value in tags.items()
                if key not in IGNORED_TAG_KEYS
            }

    if resource_type == "aws_lambda_event_source_mapping" and resource_address.endswith(
        ".aws_lambda_event_source_mapping.job_retry"
    ):
        normalized.pop("tags", None)
        normalized.pop("tags_all", None)

    if resource_type == "aws_lambda_function":
        for attribute in ("filename", "last_modified", "layers"):
            normalized.pop(attribute, None)
        for address_suffix, environment_keys in IGNORED_LAMBDA_ENVIRONMENT_KEYS.items():
            if not resource_address.endswith(address_suffix):
                continue
            environment = normalized.get("environment")
            environments = environment if isinstance(environment, list) else [environment]
            normalized_environments = []
            for environment_block in environments:
                if not isinstance(environment_block, dict):
                    normalized_environments.append(environment_block)
                    continue
                environment_block = copy.deepcopy(environment_block)
                variables = environment_block.get("variables")
                if isinstance(variables, dict):
                    environment_block["variables"] = {
                        key: variable_value
                        for key, variable_value in variables.items()
                        if key not in environment_keys
                    }
                normalized_environments.append(environment_block)
            if isinstance(environment, list):
                normalized["environment"] = normalized_environments
            elif normalized_environments:
                normalized["environment"] = normalized_environments[0]

    if resource_type == "aws_cloudwatch_log_group":
        # MiniStack does not return logGroupClass from DescribeLogGroups.
        normalized.pop("log_group_class", None)

    if resource_type == "aws_launch_template" and ".module.compute_aws_ec2[" in resource_address:
        normalized.pop("metadata_options", None)
        normalized.pop("instance_initiated_shutdown_behavior", None)

    if resource_type == "aws_security_group" and resource_address.endswith(
        ".aws_security_group.runner_sg[0]"
    ):
        # MiniStack duplicates/normalizes the runner egress CIDR blocks.
        normalized.pop("egress", None)

    if resource_type == "aws_iam_role" and resource_address.endswith(
        ".aws_iam_role.job_retry"
    ):
        normalized["assume_role_policy"] = remove_assume_role_sids(
            normalized.get("assume_role_policy")
        )

    return normalized


def is_ignored(resource: dict[str, Any]) -> bool:
    address = resource.get("address", "")
    return resource.get("type") in IGNORED_RESOURCE_TYPES or any(
        address.endswith(suffix) for suffix in IGNORED_RESOURCE_ADDRESS_SUFFIXES
    )


def main() -> int:
    unexpected = []
    for resource in json.load(sys.stdin).get("resource_changes", []):
        address = resource.get("address", "")
        resource_type = resource.get("type", "")
        if resource.get("mode") != "managed" or resource_type == "terraform_data":
            continue
        if not address.startswith("module.runners.") or is_ignored(resource):
            continue

        actions = resource.get("change", {}).get("actions", [])
        if actions == ["no-op"]:
            continue
        change = resource.get("change", {})
        if resource_type == "aws_cloudwatch_log_group" and change.get(
            "replace_paths"
        ) == [["log_group_class"]]:
            # MiniStack does not return logGroupClass from DescribeLogGroups.
            continue
        before = without_expected_changes(change.get("before"), resource_type, address)
        after = without_expected_changes(change.get("after"), resource_type, address)
        if before == after:
            continue
        unexpected.append(f"{address}: {','.join(actions)}")

    if unexpected:
        print("Migration changed infrastructure resources:", file=sys.stderr)
        print("\n".join(f"  {change}" for change in unexpected), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
