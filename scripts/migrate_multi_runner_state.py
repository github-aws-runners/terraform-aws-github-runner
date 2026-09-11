#!/usr/bin/env python3
"""Move v1 multi-runner state into the v2 runner-config topology.

The module's moved.tf file contains relative, unkeyed mappings. The actual
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
ATTRIBUTE_RE = re.compile(r'^\s*(from|to)\s*=\s*(\S+)\s*$')
INSTANCE_SUFFIX_RE = r'(?P<instances>(?:\[[^]]+\])*)$'


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
            "Expand multi-runner moved.tf mappings for dynamic state keys "
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
        "--moved-file",
        type=Path,
        required=True,
        help="The multi-runner moved.tf file containing relative mappings.",
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


def parse_moved_file(path: Path) -> list[Mapping]:
    mappings: list[Mapping] = []
    current: dict[str, str] = {}
    in_block = False

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line == "moved {":
            current = {}
            in_block = True
            continue
        if not in_block:
            continue
        match = ATTRIBUTE_RE.match(raw_line)
        if match:
            current[match.group(1)] = match.group(2)
            continue
        if line == "}":
            if "from" in current and "to" in current:
                mappings.append(Mapping(current["from"], current["to"]))
            current = {}
            in_block = False

    if in_block:
        raise ValueError(f"unterminated moved block in {path}")
    if not mappings:
        raise ValueError(f"no moved blocks found in {path}")
    return mappings


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
    source = mapping.source.replace("module.runners", f"module.runners{key_ref}", 1)
    target = mapping.target.replace(
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
    moved_file = args.moved_file.resolve()
    working_directory = args.working_directory.resolve()

    if not moved_file.is_file():
        print(f"moved file not found: {moved_file}", file=sys.stderr)
        return 2
    if not working_directory.is_dir():
        print(f"working directory not found: {working_directory}", file=sys.stderr)
        return 2

    try:
        mappings = parse_moved_file(moved_file)
        addresses = state_addresses(args.tool, working_directory)
    except (OSError, RuntimeError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 2

    moves = expand_moves(mappings, addresses)
    address_set = set(addresses)
    conflicts = [move for move in moves if move.target in address_set]

    print(f"Found {len(key_refs(addresses))} runner key(s).")
    print(f"Found {len(mappings)} moved.tf mapping(s).")
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
