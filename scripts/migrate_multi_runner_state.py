#!/usr/bin/env python3
"""Move v1 multi-runner state into the v2 runner-config topology.

The migration mapping table contains relative, unkeyed mappings. The actual
state contains one module instance per dynamic multi-runner key, for example:

    module.runners["large"].aws_iam_role.runner[0]

This script expands every mapping for every key found in the current state and
then optionally runs state mv. It is deliberately a dry run unless --apply
is supplied.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


MODULE_KEY_RE = re.compile(r'module\.runners(\["(?:\\.|[^"])*"\])')
INSTANCE_SUFFIX_RE = r'(?P<instances>(?:\[[^]]+\])*)$'
MULTI_RUNNER_MODULE_PREFIX = "module.runners."

# These are the relative addresses from the v1 module call to the v2 module
# call. The runner key is inserted after module.runners/module.runner_configs
# at runtime because it is a user-controlled for_each key.
MIGRATION_MAPPINGS = (
    ('module.runners.aws_iam_role.runner', 'module.runner_configs.aws_iam_role.runner'),
    ('module.runners.aws_ssm_parameter.runner_agent_mode', 'module.runner_configs.aws_ssm_parameter.runner_agent_mode'),
    ('module.runners.aws_ssm_parameter.disable_default_labels', 'module.runner_configs.aws_ssm_parameter.disable_default_labels'),
    ('module.runners.aws_ssm_parameter.jit_config_enabled', 'module.runner_configs.aws_ssm_parameter.jit_config_enabled'),
    ('module.runners.aws_ssm_parameter.token_path', 'module.runner_configs.aws_ssm_parameter.token_path'),
    ('module.runners.aws_iam_policy.ami_id_ssm_parameter_read', 'module.runner_configs.module.compute_aws_ec2[0].aws_iam_policy.ami_id_ssm_parameter_read'),
    ('module.runners.aws_iam_instance_profile.runner', 'module.runner_configs.module.compute_aws_ec2[0].aws_iam_instance_profile.runner'),
    ('module.runners.aws_ssm_parameter.cloudwatch_agent_config_runner', 'module.runner_configs.module.compute_aws_ec2[0].aws_ssm_parameter.cloudwatch_agent_config_runner'),
    ('module.runners.aws_cloudwatch_log_group.gh_runners', 'module.runner_configs.module.compute_aws_ec2[0].aws_cloudwatch_log_group.gh_runners'),
    ('module.runners.aws_iam_role_policy.cloudwatch[0]', 'module.runner_configs.aws_iam_role_policy.runner_provider["cloudwatch"]'),
    ('module.runners.aws_ssm_parameter.runner_ami_id', 'module.runner_configs.module.compute_aws_ec2[0].aws_ssm_parameter.runner_ami_id'),
    ('module.runners.aws_launch_template.runner', 'module.runner_configs.module.compute_aws_ec2[0].aws_launch_template.runner'),
    ('module.runners.aws_security_group.runner_sg', 'module.runner_configs.module.compute_aws_ec2[0].aws_security_group.runner_sg'),
    ('module.runners.aws_ssm_parameter.runner_config_run_as', 'module.runner_configs.module.compute_aws_ec2[0].aws_ssm_parameter.runner_config_run_as'),
    ('module.runners.aws_ssm_parameter.runner_enable_cloudwatch', 'module.runner_configs.module.compute_aws_ec2[0].aws_ssm_parameter.runner_enable_cloudwatch'),
    ('module.runners.aws_iam_role_policy.runner_session_manager_aws_managed[0]', 'module.runner_configs.aws_iam_role_policy.runner_provider["session_manager"]'),
    ('module.runners.aws_iam_role_policy.ssm_parameters[0]', 'module.runner_configs.aws_iam_role_policy.runner_provider["ssm_parameters"]'),
    ('module.runners.aws_iam_role_policy.dist_bucket[0]', 'module.runner_configs.aws_iam_role_policy.runner_provider["distribution_bucket"]'),
    ('module.runners.aws_iam_role_policy.describe_tags[0]', 'module.runner_configs.aws_iam_role_policy.runner_provider["describe_tags"]'),
    ('module.runners.aws_iam_role_policy.create_tag[0]', 'module.runner_configs.aws_iam_role_policy.runner_provider["create_tags"]'),
    ('module.runners.aws_iam_role_policy.ec2[0]', 'module.runner_configs.aws_iam_role_policy.runner_provider["terminate_self"]'),
    ('module.runners.aws_iam_role_policy_attachment.xray_tracing[0]', 'module.runner_configs.aws_iam_role_policy_attachment.runner["xray"]'),
    ('module.runners.module.pool[0].aws_lambda_function.pool', 'module.runner_configs.module.orchestration_webhook[0].module.pool[0].aws_lambda_function.pool'),
    ('module.runners.module.pool[0].aws_cloudwatch_log_group.pool', 'module.runner_configs.module.orchestration_webhook[0].module.pool[0].aws_cloudwatch_log_group.pool'),
    ('module.runners.module.pool[0].aws_iam_role.pool', 'module.runner_configs.module.orchestration_webhook[0].module.pool[0].aws_iam_role.pool'),
    ('module.runners.module.pool[0].aws_iam_role_policy.pool', 'module.runner_configs.module.orchestration_webhook[0].module.pool[0].aws_iam_role_policy.pool'),
    ('module.runners.module.pool[0].aws_iam_role_policy.pool_logging', 'module.runner_configs.module.orchestration_webhook[0].module.pool[0].aws_iam_role_policy.pool_logging'),
    ('module.runners.module.pool[0].aws_iam_role_policy_attachment.pool_vpc_execution_role', 'module.runner_configs.module.orchestration_webhook[0].module.pool[0].aws_iam_role_policy_attachment.pool_vpc_execution_role'),
    ('module.runners.module.pool[0].aws_iam_role_policy_attachment.ami_id_ssm_parameter_read', 'module.runner_configs.module.orchestration_webhook[0].module.pool[0].aws_iam_role_policy_attachment.provider'),
    ('module.runners.module.pool[0].aws_iam_role_policy.pool_xray', 'module.runner_configs.module.orchestration_webhook[0].module.pool[0].aws_iam_role_policy.pool_xray'),
    ('module.runners.module.pool[0].aws_scheduler_schedule_group.pool', 'module.runner_configs.module.orchestration_webhook[0].module.pool[0].aws_scheduler_schedule_group.pool'),
    ('module.runners.module.pool[0].aws_iam_role.scheduler', 'module.runner_configs.module.orchestration_webhook[0].module.pool[0].aws_iam_role.scheduler'),
    ('module.runners.module.pool[0].aws_iam_role_policy.scheduler', 'module.runner_configs.module.orchestration_webhook[0].module.pool[0].aws_iam_role_policy.scheduler'),
    ('module.runners.module.pool[0].aws_scheduler_schedule.pool', 'module.runner_configs.module.orchestration_webhook[0].module.pool[0].aws_scheduler_schedule.pool'),
    ('module.runners.aws_lambda_function.scale_up', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_lambda_function.scale_up'),
    ('module.runners.aws_cloudwatch_log_group.scale_up', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_cloudwatch_log_group.scale_up'),
    ('module.runners.aws_lambda_event_source_mapping.scale_up', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_lambda_event_source_mapping.scale_up'),
    ('module.runners.aws_lambda_permission.scale_runners_lambda', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_lambda_permission.scale_runners_lambda'),
    ('module.runners.aws_iam_role.scale_up', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role.scale_up'),
    ('module.runners.aws_iam_role_policy.scale_up', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.scale_up'),
    ('module.runners.aws_iam_role_policy.scale_up_logging', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.scale_up_logging'),
    ('module.runners.aws_iam_role_policy.service_linked_role', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.service_linked_role'),
    ('module.runners.aws_iam_role_policy_attachment.scale_up_vpc_execution_role', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy_attachment.scale_up_vpc_execution_role'),
    ('module.runners.aws_iam_role_policy_attachment.ami_id_ssm_parameter_read', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy_attachment.provider'),
    ('module.runners.aws_iam_role_policy.scale_up_xray', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.scale_up_xray'),
    ('module.runners.aws_iam_role_policy.job_retry_sqs_publish', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.job_retry_sqs_publish'),
    ('module.runners.aws_lambda_function.scale_down', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_lambda_function.scale_down'),
    ('module.runners.aws_cloudwatch_log_group.scale_down', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_cloudwatch_log_group.scale_down'),
    ('module.runners.aws_cloudwatch_event_rule.scale_down', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_cloudwatch_event_rule.scale_down'),
    ('module.runners.aws_cloudwatch_event_target.scale_down', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_cloudwatch_event_target.scale_down'),
    ('module.runners.aws_lambda_permission.scale_down', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_lambda_permission.scale_down'),
    ('module.runners.aws_iam_role.scale_down', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role.scale_down'),
    ('module.runners.aws_iam_role_policy.scale_down', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.scale_down'),
    ('module.runners.aws_iam_role_policy.scale_down_logging', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.scale_down_logging'),
    ('module.runners.aws_iam_role_policy_attachment.scale_down_vpc_execution_role', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy_attachment.scale_down_vpc_execution_role'),
    ('module.runners.aws_iam_role_policy.scale_down_xray', 'module.runner_configs.module.orchestration_webhook[0].module.scale_runners.aws_iam_role_policy.scale_down_xray'),
    ('module.runners.module.job_retry[0].aws_sqs_queue_policy.job_retry_check_queue_policy', 'module.runner_configs.module.orchestration_webhook[0].module.job_retry[0].aws_sqs_queue_policy.job_retry_check_queue_policy'),
    ('module.runners.module.job_retry[0].aws_sqs_queue.job_retry_check_queue', 'module.runner_configs.module.orchestration_webhook[0].module.job_retry[0].aws_sqs_queue.job_retry_check_queue'),
    ('module.runners.module.job_retry[0].module.job_retry.aws_lambda_function.main', 'module.runner_configs.module.orchestration_webhook[0].module.job_retry[0].aws_lambda_function.job_retry'),
    ('module.runners.module.job_retry[0].module.job_retry.aws_cloudwatch_log_group.main', 'module.runner_configs.module.orchestration_webhook[0].module.job_retry[0].aws_cloudwatch_log_group.job_retry'),
    ('module.runners.module.job_retry[0].module.job_retry.aws_iam_role.main', 'module.runner_configs.module.orchestration_webhook[0].module.job_retry[0].aws_iam_role.job_retry'),
    ('module.runners.module.job_retry[0].module.job_retry.aws_iam_role_policy.lambda_logging', 'module.runner_configs.module.orchestration_webhook[0].module.job_retry[0].aws_iam_role_policy.job_retry_logging'),
    ('module.runners.module.job_retry[0].module.job_retry.aws_iam_role_policy_attachment.vpc_execution_role', 'module.runner_configs.module.orchestration_webhook[0].module.job_retry[0].aws_iam_role_policy_attachment.job_retry_vpc_execution_role'),
    ('module.runners.module.job_retry[0].module.job_retry.aws_iam_role_policy.xray', 'module.runner_configs.module.orchestration_webhook[0].module.job_retry[0].aws_iam_role_policy.job_retry_xray'),
    ('module.runners.module.job_retry[0].aws_lambda_event_source_mapping.job_retry', 'module.runner_configs.module.orchestration_webhook[0].module.job_retry[0].aws_lambda_event_source_mapping.job_retry'),
    ('module.runners.module.job_retry[0].aws_lambda_permission.job_retry', 'module.runner_configs.module.orchestration_webhook[0].module.job_retry[0].aws_lambda_permission.job_retry'),
    ('module.runners.module.job_retry[0].aws_iam_role_policy.job_retry', 'module.runner_configs.module.orchestration_webhook[0].module.job_retry[0].aws_iam_role_policy.job_retry'),
    ('module.runners.aws_lambda_function.ssm_housekeeper', 'module.runner_configs.module.ssm_housekeeper.aws_lambda_function.ssm_housekeeper'),
    ('module.runners.aws_cloudwatch_log_group.ssm_housekeeper', 'module.runner_configs.module.ssm_housekeeper.aws_cloudwatch_log_group.ssm_housekeeper'),
    ('module.runners.aws_cloudwatch_event_rule.ssm_housekeeper', 'module.runner_configs.module.ssm_housekeeper.aws_cloudwatch_event_rule.ssm_housekeeper'),
    ('module.runners.aws_cloudwatch_event_target.ssm_housekeeper', 'module.runner_configs.module.ssm_housekeeper.aws_cloudwatch_event_target.ssm_housekeeper'),
    ('module.runners.aws_lambda_permission.ssm_housekeeper', 'module.runner_configs.module.ssm_housekeeper.aws_lambda_permission.ssm_housekeeper'),
    ('module.runners.aws_iam_role.ssm_housekeeper', 'module.runner_configs.module.ssm_housekeeper.aws_iam_role.ssm_housekeeper'),
    ('module.runners.aws_iam_role_policy.ssm_housekeeper', 'module.runner_configs.module.ssm_housekeeper.aws_iam_role_policy.ssm_housekeeper'),
    ('module.runners.aws_iam_role_policy.ssm_housekeeper_logging', 'module.runner_configs.module.ssm_housekeeper.aws_iam_role_policy.ssm_housekeeper_logging'),
    ('module.runners.aws_iam_role_policy_attachment.ssm_housekeeper_vpc_execution_role', 'module.runner_configs.module.ssm_housekeeper.aws_iam_role_policy_attachment.ssm_housekeeper_vpc_execution_role'),
    ('module.runners.aws_iam_role_policy.ssm_housekeeper_xray', 'module.runner_configs.module.ssm_housekeeper.aws_iam_role_policy.ssm_housekeeper_xray'),
)

# These resources are outside the dynamic runner-key modules and therefore
# must be moved once, without inserting a runner key into their addresses.
STATIC_MIGRATION_MAPPINGS = (
    (
        'module.runners.terraform_data.validate_v1[0]',
        'module.runners.terraform_data.validate_v2[0]',
    ),
)


@dataclass(frozen=True)
class Mapping:
    source: str
    target: str


@dataclass(frozen=True)
class Move:
    source: str
    target: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Expand multi-runner migration mappings for dynamic state keys "
            "and optionally run terraform/terragrunt state mv."
        )
    )
    parser.add_argument(
        "--working-directory",
        type=Path,
        default=Path.cwd(),
        help="Terraform/Terragrunt working directory (default: current directory).",
    )
    parser.add_argument(
        "--tool",
        default="terragrunt",
        help="State command to run: terragrunt, terraform, or tofu (default: terragrunt).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Execute the generated state mv commands. Without this, only a plan is printed.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip the confirmation prompt when --apply is supplied.",
    )
    parser.add_argument(
        "--backup",
        type=Path,
        help="Optional path for a state pull backup before any moves are executed.",
    )
    return parser.parse_args()


def command(tool: str, args: list[str], working_directory: Path) -> str:
    completed = subprocess.run(
        [tool, *args],
        cwd=working_directory,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if completed.returncode != 0:
        details = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(
            f"{tool} {' '.join(args)} failed with exit status "
            f"{completed.returncode}: {details}"
        )
    return completed.stdout


def state_addresses(tool: str, working_directory: Path) -> list[str]:
    output = command(tool, ["state", "list"], working_directory)
    return [line.strip() for line in output.splitlines() if line.strip()]


def key_refs(addresses: Iterable[str]) -> list[str]:
    refs = {
        match.group(1)
        for address in addresses
        for match in MODULE_KEY_RE.finditer(address)
    }
    return sorted(refs)


def keyed_mapping(mapping: Mapping, key_ref: str) -> Mapping:
    source = MULTI_RUNNER_MODULE_PREFIX + mapping.source.replace(
        "module.runners", f"module.runners{key_ref}", 1
    )
    target = MULTI_RUNNER_MODULE_PREFIX + mapping.target.replace(
        "module.runner_configs", f"module.runner_configs{key_ref}", 1
    )
    return Mapping(source, target)


def expand_moves(mappings: Iterable[Mapping], addresses: Iterable[str]) -> list[Move]:
    addresses = list(addresses)
    moves: list[Move] = []
    seen: set[tuple[str, str]] = set()

    for key_ref in key_refs(addresses):
        for mapping in mappings:
            expanded = keyed_mapping(mapping, key_ref)
            pattern = re.compile(re.escape(expanded.source) + INSTANCE_SUFFIX_RE)
            for address in addresses:
                match = pattern.search(address)
                if not match:
                    continue
                prefix = address[: match.start()]
                target = f"{prefix}{expanded.target}{match.group('instances')}"
                pair = (address, target)
                if pair not in seen:
                    moves.append(Move(address, target))
                    seen.add(pair)
    return moves


def expand_static_moves(mappings: Iterable[Mapping], addresses: Iterable[str]) -> list[Move]:
    address_set = set(addresses)
    return [
        Move(mapping.source, mapping.target)
        for mapping in mappings
        if mapping.source in address_set
    ]


def pull_backup(tool: str, working_directory: Path, path: Path) -> None:
    if path.exists():
        raise RuntimeError(f"refusing to overwrite existing backup: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    completed = subprocess.run(
        [tool, "state", "pull"],
        cwd=working_directory,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if completed.returncode != 0:
        details = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(f"{tool} state pull failed: {details}")
    path.write_text(completed.stdout, encoding="utf-8")
    os.chmod(path, 0o600)
    print(f"State backup written to {path}")


def main() -> int:
    args = parse_args()
    working_directory = args.working_directory.resolve()

    if not working_directory.is_dir():
        print(f"working directory not found: {working_directory}", file=sys.stderr)
        return 2

    try:
        mappings = [Mapping(source, target) for source, target in MIGRATION_MAPPINGS]
        static_mappings = [
            Mapping(source, target) for source, target in STATIC_MIGRATION_MAPPINGS
        ]
        addresses = state_addresses(args.tool, working_directory)
    except (OSError, RuntimeError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 2

    moves = expand_moves(mappings, addresses)
    moves.extend(expand_static_moves(static_mappings, addresses))
    address_set = set(addresses)
    conflicts = [move for move in moves if move.target in address_set]

    print(f"Found {len(key_refs(addresses))} runner key(s).")
    print(f"Found {len(mappings) + len(static_mappings)} migration mapping(s).")
    print(f"Generated {len(moves)} state move(s).")
    if not moves:
        print("No old keyed addresses matched the current state.")
        return 1

    if conflicts:
        print("Refusing to continue because target addresses already exist:", file=sys.stderr)
        for move in conflicts:
            print(f"  {move.source} -> {move.target}", file=sys.stderr)
        return 2

    for move in moves:
        print(f"  {move.source} -> {move.target}")

    if not args.apply:
        print("Dry run only. Re-run with --apply after reviewing the mappings.")
        return 0

    if not args.yes:
        answer = input("Execute these state moves? Type 'move' to continue: ")
        if answer != "move":
            print("Aborted.")
            return 1

    try:
        if args.backup:
            pull_backup(args.tool, working_directory, args.backup.resolve())
        for move in moves:
            command(args.tool, ["state", "mv", move.source, move.target], working_directory)
            print(f"Moved {move.source} -> {move.target}")
    except (OSError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        print("Migration stopped. Review state before retrying.", file=sys.stderr)
        return 2

    print("State migration completed. Run the Terraform plan again.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
