#!/usr/bin/env python3
"""Run the shared multi-runner webhook smoke test once for both providers."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from smoke.common import SmokeContext  # noqa: E402
from smoke.lifecycle import run  # noqa: E402
from smoke import ec2, microvm  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the multi-runner webhook smoke test for one or all compute providers."
    )
    parser.add_argument("provider", nargs="?", choices=("all", "ec2", "microvm"), default="all")
    parser.add_argument(
        "--keep-deployment",
        action="store_true",
        default=False,
        help="Keep the Terraform deployment and temporary tfvars file for debugging",
    )
    args = parser.parse_args()

    providers = {item.slug: item for item in (ec2.provider, microvm.provider)}

    context = SmokeContext(Path(__file__).parent, keep_deployment=args.keep_deployment)
    selected = tuple(providers.values()) if args.provider == "all" else (providers[args.provider],)
    context.initialize_checklist([item.slug for item in selected])
    succeeded = False
    try:
        context.prepare()
        for selected_provider in selected:
            run(context, selected_provider)
        tested = "EC2 and MicroVM" if args.provider == "all" else providers[args.provider].display_name
        print(f"MiniStack multi-runner-webhook smoke tests passed for {tested}.", flush=True)
        succeeded = True
        return 0
    except BaseException as error:
        context.record_checklist_failure(error)
        raise
    finally:
        try:
            context.cleanup()
        finally:
            context.finish_checklist(succeeded)


if __name__ == "__main__":
    raise SystemExit(main())
