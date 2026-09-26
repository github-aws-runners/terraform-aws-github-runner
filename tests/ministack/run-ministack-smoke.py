#!/usr/bin/env python3
"""Run webhook EC2/MicroVM and scale-set EC2 smoke tests on one deployment."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from smoke import webhook_ec2, webhook_microvm  # noqa: E402
from smoke.common import SmokeContext  # noqa: E402
from smoke.scale_set_ec2 import provider as scale_set_ec2_provider  # noqa: E402
from smoke.scale_set_scenario import prepare as prepare_scale_set  # noqa: E402
from smoke.scale_set_scenario import run as run_scale_set  # noqa: E402
from smoke.scale_set_provider import ScaleSetProvider  # noqa: E402
from smoke.webhook_provider import SmokeProvider  # noqa: E402
from smoke.webhook_scenario import run as run_webhook  # noqa: E402

SCALE_SET_PROVIDERS = (scale_set_ec2_provider,)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run webhook EC2/MicroVM and scale-set EC2 smoke tests using one MiniStack deployment."
    )
    parser.add_argument(
        "--webhook-provider",
        choices=("all", "ec2", "microvm"),
        default="all",
        help="Webhook compute-provider scenarios to run",
    )
    parser.add_argument(
        "--scale-set-provider",
        choices=("all", *(provider.slug for provider in SCALE_SET_PROVIDERS)),
        default="all",
        help="Scale-set compute-provider scenarios to run",
    )
    parser.add_argument(
        "--keep-deployment",
        action="store_true",
        help="Keep the shared Terraform deployment and generated tfvars for debugging",
    )
    return parser.parse_args()


def _select_providers(selection: str) -> tuple[SmokeProvider, ...]:
    providers = (webhook_ec2.provider, webhook_microvm.provider)
    if selection == "all":
        return providers
    return tuple(provider for provider in providers if provider.slug == selection)


def _select_scale_set_providers(selection: str) -> tuple[ScaleSetProvider, ...]:
    if selection == "all":
        return SCALE_SET_PROVIDERS
    return tuple(provider for provider in SCALE_SET_PROVIDERS if provider.slug == selection)


def _run_smoke(args: argparse.Namespace) -> int:
    selected = _select_providers(args.webhook_provider)
    selected_scale_set = _select_scale_set_providers(args.scale_set_provider)
    context = SmokeContext(
        Path(__file__).parent,
        microvm_enabled=any(
            provider.slug == "microvm" for provider in (*selected, *selected_scale_set)
        ),
        keep_deployment=args.keep_deployment,
    )
    try:
        with context.step("Prepare combined MiniStack smoke deployment"):
            context.configure_mockserver()
            with context.step("Build and publish scale-set controller image"):
                scale_set_image = prepare_scale_set(context, selected_scale_set[0])
            context.prepare(scale_set_image=scale_set_image)
        # Replace MiniStack's initial ECS task with a revision carrying test-only AWS credentials.
        with context.step("Scale-set orchestration testing"):
            for provider in selected_scale_set:
                with context.step(provider.display_name):
                    run_scale_set(context, provider, scale_set_image)
        with context.step("Webhook orchestration testing"):
            for provider in selected:
                with context.step(provider.display_name):
                    run_webhook(context, provider)
        tested = "EC2 and MicroVM" if args.webhook_provider == "all" else selected[0].display_name
        scale_set_tested = " and ".join(provider.display_name for provider in selected_scale_set)
        context.progress(f"MiniStack combined smoke passed: webhook {tested}, scale-set {scale_set_tested}.")
    finally:
        context.cleanup()
    return 0


def main() -> int:
    return _run_smoke(_parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
