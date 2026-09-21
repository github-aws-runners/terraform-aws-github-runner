"""EC2 implementation of the provider smoke-test interface."""

import json
from typing import Any

from .common import SmokeContext
from .provider import RunnerResource


class Ec2Provider:
    slug = "ec2"
    display_name = "EC2"

    def configure(self, context: SmokeContext) -> None:
        context.configure_jit_expectations()

    def event(self, context: SmokeContext, job_id: int, dynamic: bool) -> dict[str, Any]:
        value = json.loads((context.script_dir / "workflow_job_event.json").read_text())
        job = value["workflow_job"]
        job["id"] = job_id
        job["name"] = f"multi-runner-webhook-ec2-{job_id}"
        job["labels"] = ["self-hosted", "linux", "x64", "ec2"]
        if dynamic:
            job["labels"].append("ghr-ec2-instance-type:m5.large")
        return value

    def verify_scale_up_routes(self, context: SmokeContext, job_id: int) -> None:
        context.verify_route(
            "GET",
            "/api/v3/orgs/test-owner/actions/runner-groups",
            f"EC2 scale-up resolved the runner group for {job_id}",
        )
        context.verify_route(
            "POST",
            "/api/v3/orgs/test-owner/actions/runners/generate-jitconfig",
            f"EC2 scale-up generated JIT configuration for {job_id}",
        )

    def verify_pool_routes(self, context: SmokeContext) -> None:
        context.verify_route(
            "GET",
            "/api/v3/orgs/test-owner/actions/runner-groups",
            "EC2 pool resolved the runner group",
        )
        context.verify_route(
            "POST",
            "/api/v3/orgs/test-owner/actions/runners/generate-jitconfig",
            "EC2 pool generated JIT configuration",
        )

    def _wait_for_instance(self, context: SmokeContext, source: str, description: str) -> RunnerResource:
        def find() -> str | None:
            result = context.aws(
                "ec2", "describe-instances", "--filters",
                "Name=instance-state-name,Values=running,pending",
                "Name=tag:ghr:Application,Values=github-action-runner",
                f"Name=tag:ghr:created_by,Values={source}", check=False,
            ) or {}
            for reservation in result.get("Reservations", []):
                for instance in reservation.get("Instances", []):
                    instance_id = instance.get("InstanceId")
                    if instance_id and instance_id not in context.discovered_instance_ids:
                        context.discovered_instance_ids.append(instance_id)
                        return instance_id
            return None

        return RunnerResource(context.wait_for(find, description))

    def _instance(self, context: SmokeContext, resource: RunnerResource) -> dict[str, Any]:
        result = context.aws("ec2", "describe-instances", "--instance-ids", resource.identifier)
        return result["Reservations"][0]["Instances"][0]

    def _assert_tags(self, context: SmokeContext, resource: RunnerResource, source: str) -> None:
        tags = {tag["Key"]: tag["Value"] for tag in self._instance(context, resource).get("Tags", [])}
        expected = {
            "ghr:Application": "github-action-runner",
            "ghr:created_by": source,
            "ghr:Type": "Org",
            "ghr:Owner": "test-owner",
        }
        for key, value in expected.items():
            if tags.get(key) != value:
                raise RuntimeError(f"Unexpected EC2 runner tag {key}: expected {value}, got {tags.get(key)}")

    def wait_for_scale_up(self, context: SmokeContext, source: str) -> RunnerResource:
        return self._wait_for_instance(context, source, "an EC2 scale-up instance")

    def assert_scale_up(self, context: SmokeContext, resource: RunnerResource, dynamic: bool) -> None:
        expected_type = "m5.large" if dynamic else "m7a.large"
        actual_type = self._instance(context, resource).get("InstanceType")
        if actual_type != expected_type:
            raise RuntimeError(f"EC2 scale-up used {actual_type}, expected {expected_type}")
        self._assert_tags(context, resource, "scale-up-lambda")

    def wait_for_pool(self, context: SmokeContext, source: str) -> RunnerResource:
        return self._wait_for_instance(context, source, "an EC2 pool instance")

    def assert_pool(self, context: SmokeContext, resource: RunnerResource) -> None:
        self._assert_tags(context, resource, "pool-lambda")

    def _wait_for_termination(self, context: SmokeContext, resource: RunnerResource) -> None:
        def terminated() -> bool:
            result = context.aws("ec2", "describe-instances", "--instance-ids", resource.identifier, check=False)
            if not result:
                return True
            state = result.get("Reservations", [{}])[0].get("Instances", [{}])[0].get("State", {}).get("Name")
            return state in (None, "terminated")

        context.wait_for(terminated, f"EC2 instance {resource.identifier} termination")

    def scale_down(
        self,
        context: SmokeContext,
        resource: RunnerResource,
        runner_id: int,
        marker: str,
        active_runners: list[tuple[int, RunnerResource]],
    ) -> None:
        context.configure_runner_fixtures(
            self.slug,
            [(active_runner_id, active_resource.identifier) for active_runner_id, active_resource in active_runners],
            runner_id,
        )
        context.clear_requests()
        context.invoke(
            "multi-runner-webhook-ec2-scale-down",
            {"smokeMarker": marker, "type": "ec2"},
            "EC2 scale-down Lambda invoked",
        )
        context.wait_for_log("/aws/lambda/multi-runner-webhook-ec2-scale-down", marker, "EC2 scale-down Lambda started")
        context.scale_down_routes(runner_id)
        context.configure_runner_removed(runner_id)
        context.assert_runner_removed(runner_id)
        self._wait_for_termination(context, resource)


provider = Ec2Provider()
