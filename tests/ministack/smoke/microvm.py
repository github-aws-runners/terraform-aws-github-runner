"""MicroVM implementation of the provider smoke-test interface."""

import base64
import json
import shutil
from typing import Any

from .common import SmokeContext
from .provider import RunnerResource

MICROVM_HOOK_CONTAINER = "microvm-lifecycle-hook"
MICROVM_HOOK_PORT = 8080
MICROVM_HOOK_URL = f"http://127.0.0.1:{MICROVM_HOOK_PORT}"


def _base64_json(value: dict[str, Any]) -> str:
    return base64.b64encode(json.dumps(value, separators=(",", ":")).encode()).decode()


def _smoke_jit_config(context: SmokeContext) -> str:
    """Return a synthetic but runner-compatible JIT configuration for MockServer."""
    # The smoke validates JIT handoff, not the runner service protocol. Keep the
    # launched runner away from MockServer, whose REST expectations are for the
    # control plane and GitHub API only.
    runner_server_url = "http://127.0.0.1:65535"
    files = {
        ".runner": _base64_json(
            {
                "AgentId": 987654321,
                "AgentName": "ministack-microvm",
                "DisableUpdate": True,
                "Ephemeral": True,
                "PoolId": 1,
                "PoolName": "Default",
                "ServerUrl": runner_server_url,
                "WorkFolder": "_work",
            }
        ),
        ".credentials": _base64_json(
            {
                "scheme": "OAuth",
                "data": {
                    "clientId": "00000000-0000-0000-0000-000000000000",
                    "authorizationUrl": f"{runner_server_url}/_apis/oauth2/token",
                },
            }
        ),
        # This is a throwaway RSA key used only to let the runner pass its local
        # JIT bootstrap. It does not authenticate against a real GitHub service.
        ".credentials_rsaparams": _base64_json(
            {
                "d": "BnkRwk8qg/fMob7o5QboXqqTJsPX2mO7uw7QQAZdFw8FY0P7GmpaiGRPsyu6hhRHH5n6vkMw3gRWvIcP+0rBQ3S32U+tKf4+CaARP9iongbice0xUDdKZKXrTlqSZ9AUND5ZIGIuFNDFn5qXS2J6SyrvF/LopAUu13lWxDrduyEpWRtJkR4RPNKEHi7Lk8NsaZ6N8AIz3+/y0dkWI3pPmelzi+rAssDnz7soK4o6CG9RjIXzeBQzJ4BXefD6zEeXM++mDZylnVJNOoHJWNLvPN+aL5vCfBmgYkk6KZgYzMCFFsxkwtvw+6el3PumxHayginTZ9kd8QJBTypCLtWHWQ==",
                "dp": "lkubjli9JdkRuXqnHXHlSDy38RaNGKy+qEa1v4yQTg6h8ni3ZBDMfDhsNhUtlgBHF1AhYod2qwkCZKRNRWAVg00G1Pxswmt57b+4jfW4J0LQ1AytrxhTSrthlyQR5ikUK3d/kEMQs+yP0f2SapkYqXzdaHiU1RA6IhT35bFhHfU=",
                "dq": "r7ZtgewAZCZt21o3fBkhAB08Ct+QV0KkzCJlcDr0QbmbjLg/0Nuy6zeiA2QC609LZPgGv6BnPhHMG11bT401WsSkgu/h56L77fK8GwVKCpeZ8SSn3fwyCSpjRHQx3duTerLgi3paVuJTVgL3FdFKSko7wkdSDI1eu9BSHGYnu18=",
                "exponent": "AQAB",
                "inverseQ": "FSukzwvdLNKkglKWjmYcs1ZCqcgAxecU3bczzVi1TCIYmLN7bLavs15ezr2Xe7MnUJCVz9Lk61sCDVxAA1XK/Bx88iuZvC9GFuM9wZEflvibycx6KI4dvmfSgM0Gff8BnoLs5WinopSuz/fvCzpB26aNfsuv4eCnBgAn8F8bDGU=",
                "modulus": "mEkM5pFWZbsCIhVBw2PHC3OfcgP6UtrabLxkAHw6NfxNxdyfRErU6BeI2e6Sh9bRNlo3GbHtq4CizVhcmwJo6CKc1/r1Zrgbb1xQ/FiiHJDA8J6b7cxY894N7rY2r0PqOAxBruGfyAUgG3eFSC5ZSxJfiJe/sd6gwtetrh1ncoCXfeI3IGzZa/dQtIZkefFoqgv5h45gy5KwcAODZ5G0M0aYksFQyUHPLEqSGESsz8LWUOMm1Fgauj2poy8ZHC4xGvfKISPoONRAbHOQDQ7IP09v/w1iAKt02qy9Xdr4vHzZK34a6/Ug/YJpYuIE4fxyTgi096FVIrOl5v+QZg8h4w==",
                "p": "zEqTwQJRTY7JmI+zamHZJ/GZ+Hv6n2RSBwFX7BdBS3rxUzAxrijax7fgmhyd4WUgTnMliWZWW3B61Ez/pzXT39ZtSrelOMa6TCMZBbAfq964X5nlWwAdEfHN0SAffKLjXlVBcF6Ov0nhjB8Ci081kjebO1hEgH8ri5awtJLw2S0=",
                "q": "vtSnRA6EtRsr+o2gq0E0RA44hBpMe7NMyMIIAxcM4vyMRsKhGc2+vaHIyXLejiaomPlTYWLjCBGoNx8wFN/K0ZoshEJAPAYBVgX9hX9eywigdoGWufkaJqHG1a5YmIqTRqO9dQs8rItpGGPeJmToPLwPaPz1rZH1/BoBO7pksU8=",
            }
        ),
    }
    return _base64_json(files)


class MicrovmProvider:
    slug = "microvm"
    display_name = "MicroVM"
    image_arn = "arn:aws:lambda:eu-west-1:000000000000:microvm-image:ministack"
    image_version = "3.0"
    hook_url = MICROVM_HOOK_URL
    runner_config_path = "/github-action-runners/multi-runner-webhook/microvm/runners/config"
    runner_token_path = "/github-action-runners/multi-runner-webhook/microvm/runners/tokens"
    metadata_path = "/github-action-runners/multi-runner-webhook/microvm/runners/config/microvm-metadata"

    def __init__(self) -> None:
        self._runner_image_built = False
        self._hook_needs_restart = False

    def configure(self, context: SmokeContext) -> None:
        self.build_runner_image(context)
        self._configure_jit_expectations(context)
        context.before_microvm_ids = set(self._metadata_by_path(context))

    def _configure_jit_expectations(self, context: SmokeContext) -> None:
        runner_group_path = "/api/v3/orgs/test-owner/actions/runner-groups"
        jit_config_path = "/api/v3/orgs/test-owner/actions/runners/generate-jitconfig"
        context.clear_expectation("GET", runner_group_path)
        context.clear_expectation("POST", jit_config_path)
        context.add_expectation(
            "GET",
            runner_group_path,
            200,
            [{"id": 1, "name": "Default"}],
        )
        context.add_expectation(
            "POST",
            jit_config_path,
            200,
            {
                "runner": {"id": 987654321, "labels": [{"name": "self-hosted"}, {"name": "linux"}]},
                "encoded_jit_config": _smoke_jit_config(context),
            },
        )

    def build_runner_image(self, context: SmokeContext) -> None:
        """Build the local ARM64 runner image once before lifecycle checks."""
        if self._runner_image_built:
            return

        with context.step("Test Packer"):
            output = json.loads(context.terraform("output", "-json", "microvm"))
            foundation = output["microvm_foundation"]
            ecr_repository_uri = output["ecr_repo"]
            repository_name = ecr_repository_uri.rsplit("/", 1)[-1]
            docker_registry = "localhost:4566"
            image_tag = "latest"
            docker_base_image = f"{docker_registry}/{repository_name}:{image_tag}"
            ubuntu_image = (
                ecr_repository_uri
                if ":" in ecr_repository_uri.rsplit("/", 1)[-1]
                else f"{ecr_repository_uri}:{image_tag}"
            )
            image_root = context.source_root / "images" / "microvm-ubuntu"
            image_context = image_root / "packer" / "scripts" / "microvm" / "image"
            lifecycle_hook_zip = (
                context.source_root
                / "lambda_output/"
                / "microvm-lifecycle-hooks.zip"
            )

            with context.step("Build base image"):
                context.run(
                    [
                        "bash",
                        "-o",
                        "pipefail",
                        "-c",
                        "aws ecr get-login-password | "
                        f"docker login --username AWS --password-stdin {docker_registry}",
                    ],
                    stream=True,
                )
                context.run(["docker", "pull", "--platform", "linux/arm64", "ubuntu:24.04"], stream=True)
                context.run(["docker", "tag", "ubuntu:24.04", docker_base_image], stream=True)
                context.run(["docker", "push", docker_base_image], stream=True)

            context.environment.update(
                {
                    "MICROVM_ARTIFACT_BUCKET": foundation["artifact_bucket_name"],
                    "MICROVM_BUILD_ROLE_ARN": foundation["build_role_arn"],
                    "MICROVM_EGRESS_NETWORK_CONNECTOR_ARN": foundation["connector_arns"]["ministack"],
                    "MICROVM_IMAGE_NAME": "micro-ubuntu24",
                    "MICROVM_MEMORY_MIB": "8192",
                    "MICROVM_IDEMPOTENCY_NONCE": context.environment.get(
                        "MICROVM_IDEMPOTENCY_NONCE", "ministack-smoke"
                    ),
                    "MICROVM_LOG_GROUP": output.get("log_group", "/aws/lambda/microvms/ubuntu24"),
                    "MICROVM_UBUNTU_IMAGE": ubuntu_image,
                    "MICROVM_LIFECYCLE_HOOK_ZIP": str(lifecycle_hook_zip),
                }
            )

            with context.step("Build MicroVM image"):
                context.run(["packer", "build", "."], cwd=image_root, stream=True)

            with context.step("Build lifecycle-hook image"):
                shutil.copy2(lifecycle_hook_zip, image_context / "microvm-lifecycle-hooks.zip")
                context.run(
                    [
                        "docker",
                        "build",
                        "--platform",
                        "linux/arm64",
                        "-f",
                        str(image_context / "ubuntu24.arm64.Dockerfile"),
                        "--build-arg",
                        f"UBUNTU_IMAGE={docker_base_image}",
                        "--tag",
                        MICROVM_HOOK_CONTAINER,
                        str(image_context),
                    ],
                    stream=True,
                )

            self._start_microvm_hook(context)
        self._runner_image_built = True

    def _start_microvm_hook(self, context: SmokeContext) -> None:
        with context.step("Start lifecycle-hook container"):
            context.run(["docker", "rm", "--force", MICROVM_HOOK_CONTAINER], check=False)
            context.run(
                [
                    "docker",
                    "run",
                    "--detach",
                    "--rm",
                    "--platform",
                    "linux/arm64",
                    "--name",
                    MICROVM_HOOK_CONTAINER,
                    "--add-host=host.docker.internal:host-gateway",
                    "--publish",
                    f"{MICROVM_HOOK_PORT}:8080",
                    "--env",
                    "AWS_ENDPOINT_URL=http://host.docker.internal:4566",
                    "--env",
                    "AWS_REGION=eu-west-1",
                    "--env",
                    "AWS_DEFAULT_REGION=eu-west-1",
                    "--env",
                    "AWS_ACCESS_KEY_ID=000000000000",
                    "--env",
                    "AWS_SECRET_ACCESS_KEY=test",
                    "--env",
                    "MICROVM_ID=ministack-microvm",
                    "--env",
                    f"RUNNER_CONFIG_SSM_PATH={self.runner_config_path}",
                    MICROVM_HOOK_CONTAINER,
                ],
                stream=True,
            )
        with context.step("Wait for lifecycle-hook readiness"):
            context.wait_for(
                lambda: context.run(
                    [
                        "curl",
                        "--fail",
                        "--silent",
                        "--show-error",
                        "--request",
                        "POST",
                        f"http://127.0.0.1:{MICROVM_HOOK_PORT}/aws/lambda-microvms/runtime/v1/ready",
                    ],
                    check=False,
                ).returncode
                == 0,
                "MicroVM lifecycle hook container readiness",
                attempts=30,
            )

    def event(self, context: SmokeContext, job_id: int, dynamic: bool) -> dict[str, Any]:
        value = json.loads((context.fixture_dir / "workflow_job_event.json").read_text())
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

    def start_scale_up_runner(self, context: SmokeContext, resource: RunnerResource) -> bool:
        if self._hook_needs_restart:
            with context.step("Restart lifecycle-hook container"):
                self._start_microvm_hook(context)
            self._hook_needs_restart = False

        details = self._details(context, resource)
        image_arn = details.get("imageArn")
        image_version = details.get("imageVersion")
        if not isinstance(image_arn, str) or not isinstance(image_version, str):
            raise RuntimeError(f"MicroVM {resource.identifier} has incomplete image details: {details}")

        parameter_name = f"{self.runner_token_path.rstrip('/')}/{resource.identifier}"
        context.wait_for(
            lambda: context.aws("ssm", "get-parameter", "--name", parameter_name, check=False),
            f"MicroVM scale-up to create {parameter_name}",
        )

        run_hook_payload = json.dumps(
            {
                "version": 1,
                "imageArn": image_arn,
                "imageVersion": image_version,
                "runnerConfigSsmPath": self.runner_config_path,
                "runnerTokenSsmPath": self.runner_token_path,
            },
            separators=(",", ":"),
        )
        request_body = json.dumps(
            {"microvmId": resource.identifier, "runHookPayload": run_hook_payload},
            separators=(",", ":"),
        )
        context.progress(f"Curling MicroVM runner hook for {resource.identifier}")
        result = context.run(
            [
                "curl",
                "--fail-with-body",
                "--silent",
                "--show-error",
                "--max-time",
                "10",
                "--request",
                "POST",
                f"{self.hook_url}/aws/lambda-microvms/runtime/v1/run",
                "--header",
                "Content-Type: application/json",
                "--data-raw",
                request_body,
            ],
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(
                "MicroVM runner hook curl failed with "
                f"exit code {result.returncode}: {result.stderr.strip() or result.stdout.strip()}"
            )

        context.wait_for(
            lambda: not context.aws("ssm", "get-parameter", "--name", parameter_name, check=False),
            f"MicroVM runner hook to consume {parameter_name}",
        )
        github_runner_id_parameter = f"{self.metadata_path}/{resource.identifier}.github-runner-id"
        context.wait_for(
            lambda: bool(
                context.aws(
                    "ssm",
                    "get-parameter",
                    "--name",
                    github_runner_id_parameter,
                    check=False,
                )
            ),
            f"MicroVM scale-up to persist {github_runner_id_parameter}",
        )
        return True

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

    def _wait_for_listed_microvm(self, context: SmokeContext, resource: RunnerResource) -> None:
        def listed() -> bool:
            result = context.aws("lambda-microvms", "list-microvms", check=False) or {}
            return any(
                item.get("microvmId") == resource.identifier
                and item.get("state") in ("PENDING", "RUNNING", "SUSPENDING", "SUSPENDED")
                for item in result.get("items", [])
            )

        context.wait_for(listed, f"MicroVM {resource.identifier} to appear in ListMicrovms")

    def scale_down(
        self,
        context: SmokeContext,
        resource: RunnerResource,
        runner_id: int,
        marker: str,
        active_runners: list[tuple[int, RunnerResource]],
    ) -> None:
        self._wait_for_listed_microvm(context, resource)
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
        context.scale_down_routes(runner_id, "/aws/lambda/multi-runner-webhook-microvm-scale-down")
        context.configure_runner_removed(runner_id)
        context.assert_runner_removed(runner_id)
        self._wait_for_termination(context, resource)
        self.stop_microvm_hook(context)

    def stop_microvm_hook(self, context: SmokeContext) -> None:
        status, body = context.http(
            "POST",
            f"{self.hook_url}/aws/lambda-microvms/runtime/v1/terminate",
            {},
        )
        if status not in (0, 200, 404):
            raise RuntimeError(f"MicroVM lifecycle hook termination failed with HTTP {status}: {body}")
        self._hook_needs_restart = True


provider = MicrovmProvider()
