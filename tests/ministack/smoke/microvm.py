"""MicroVM implementation of the provider smoke-test interface."""

import json
from typing import Any

from .common import SmokeContext
from .provider import RunnerResource


class MicrovmProvider:
    slug = "microvm"
    display_name = "MicroVM"
    image_arn = "arn:aws:lambda:eu-west-1:000000000000:microvm-image:ministack"
    image_version = "3.0"
    metadata_path = "/github-action-runners/multi-runner-webhook/microvm/runners/config/microvm-metadata"

    def configure(self, context: SmokeContext) -> None:
        context.configure_jit_expectations()
        context.before_microvm_ids = set(self._metadata_by_path(context))

    def event(self, context: SmokeContext, job_id: int, dynamic: bool) -> dict[str, Any]:
        value = json.loads((context.script_dir / "workflow_job_event.json").read_text())
        job = value["workflow_job"]
        job["id"] = job_id
        job["name"] = f"multi-runner-webhook-microvm-{job_id}"
        job["labels"] = ["self-hosted", "linux", "arm64", "microvm"]
        if dynamic:
            job["labels"].append(f"ghr-microvm-image-version:{self.image_version}")
        return value

    def verify_scale_up_routes(self, context: SmokeContext, job_id: int) -> None:
        context.verify_route("GET", "/api/v3/orgs/test-owner/actions/runner-groups", "MicroVM scale-up resolved the runner group")
        context.verify_route("POST", "/api/v3/orgs/test-owner/actions/runners/generate-jitconfig", "MicroVM scale-up generated JIT configuration")

    def verify_pool_routes(self, context: SmokeContext) -> None:
        context.verify_route("GET", "/api/v3/orgs/test-owner/actions/runner-groups", "MicroVM pool resolved the runner group")
        context.verify_route("POST", "/api/v3/orgs/test-owner/actions/runners/generate-jitconfig", "MicroVM pool generated JIT configuration")

    def _metadata(self, context: SmokeContext, microvm_id: str) -> dict[str, Any]:
        value = context.aws(
            "ssm", "get-parameter",
            "--name", f"{self.metadata_path}/{microvm_id}",
            check=False,
        )
        if not value or value.get("Parameter", {}).get("Value") in (None, "None"):
            raise RuntimeError(f"Missing MicroVM ownership metadata for {microvm_id}")
        return json.loads(value["Parameter"]["Value"])

    def _metadata_by_path(self, context: SmokeContext) -> dict[str, dict[str, Any]]:
        result = context.aws(
            "ssm",
            "get-parameters-by-path",
            "--path",
            self.metadata_path,
            check=False,
        ) or {}
        prefix = f"{self.metadata_path}/"
        metadata: dict[str, dict[str, Any]] = {}
        for parameter in result.get("Parameters", []):
            name = parameter.get("Name", "")
            if not name.startswith(prefix):
                continue
            microvm_id = name[len(prefix):]
            if "." in microvm_id:
                continue
            value = parameter.get("Value")
            if value in (None, "None"):
                continue
            metadata[microvm_id] = json.loads(value)
        return metadata

    def _wait_for_microvm(self, context: SmokeContext, source: str, description: str) -> RunnerResource:
        def find() -> str | None:
            for microvm_id, metadata in self._metadata_by_path(context).items():
                if microvm_id in context.before_microvm_ids or microvm_id in context.discovered_microvm_ids:
                    continue
                if metadata.get("source") != source:
                    continue
                details = self._details(context, RunnerResource(microvm_id))
                if details.get("state") not in ("PENDING", "RUNNING", "SUSPENDING", "SUSPENDED"):
                    continue
                context.discovered_microvm_ids.append(microvm_id)
                return microvm_id
            return None

        return RunnerResource(context.wait_for(find, description))

    def _details(self, context: SmokeContext, resource: RunnerResource) -> dict[str, Any]:
        return context.aws(
            "lambda-microvms",
            "get-microvm",
            "--microvm-identifier",
            resource.identifier,
            check=False,
        ) or {}

    def _assert_resource(self, context: SmokeContext, resource: RunnerResource, source: str, dynamic: bool) -> None:
        details = self._details(context, resource)
        if details.get("state") not in ("PENDING", "RUNNING", "SUSPENDING", "SUSPENDED"):
            raise RuntimeError(f"MicroVM {resource.identifier} is not active: {details}")
        if details.get("imageArn") != self.image_arn:
            raise RuntimeError(f"MicroVM {resource.identifier} used {details.get('imageArn')}, expected {self.image_arn}")
        if dynamic and details.get("imageVersion") != self.image_version:
            raise RuntimeError(f"MicroVM {resource.identifier} used image version {details.get('imageVersion')}, expected {self.image_version}")
        metadata = self._metadata(context, resource.identifier)
        expected = {
            "environment": "multi-runner-webhook-microvm",
            "source": source,
            "runnerOwner": "test-owner",
            "runnerType": "Org",
        }
        if any(metadata.get(key) != value for key, value in expected.items()):
            raise RuntimeError(f"Unexpected MicroVM metadata: {metadata}")

    def wait_for_scale_up(self, context: SmokeContext, source: str) -> RunnerResource:
        return self._wait_for_microvm(context, source, "a MicroVM scale-up resource")

    def assert_scale_up(self, context: SmokeContext, resource: RunnerResource, dynamic: bool) -> None:
        self._assert_resource(context, resource, "scale-up-lambda", dynamic)

    def wait_for_pool(self, context: SmokeContext, source: str) -> RunnerResource:
        return self._wait_for_microvm(context, source, "a MicroVM pool resource")

    def assert_pool(self, context: SmokeContext, resource: RunnerResource) -> None:
        self._assert_resource(context, resource, "pool-lambda", False)

    def _wait_for_termination(self, context: SmokeContext, resource: RunnerResource) -> None:
        def terminated() -> bool:
            details = context.aws(
                "lambda-microvms",
                "get-microvm",
                "--microvm-identifier",
                resource.identifier,
                check=False,
            )
            return not details or details.get("state") == "TERMINATED"

        context.wait_for(terminated, f"MicroVM {resource.identifier} termination")

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
            "multi-runner-webhook-microvm-scale-down",
            {"smokeMarker": marker, "type": "microvm"},
            "MicroVM scale-down Lambda invoked",
        )
        context.wait_for_log("/aws/lambda/multi-runner-webhook-microvm-scale-down", marker, "MicroVM scale-down Lambda started")
        context.scale_down_routes(runner_id)
        context.configure_runner_removed(runner_id)
        context.assert_runner_removed(runner_id)
        self._wait_for_termination(context, resource)


provider = MicrovmProvider()
