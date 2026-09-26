"""Scale-set controller scenario for the combined MiniStack smoke."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import uuid

from .common import SmokeContext
from .scale_set_provider import ScaleSetProvider


class ScaleSetScenario:
    """Run scale-set assertions through the shared MiniStack smoke context."""

    repository_name = "scale-set-controller"
    runner_id = "321"
    routes = (
        ("POST", "/api/v3/app/installations/456/access_tokens"),
        ("POST", "/api/v3/orgs/example/actions/runners/registration-token"),
        ("POST", "/api/v3/actions/runner-registration"),
        ("GET", "/tenant/123/_apis/runtime/runnergroups/"),
        ("GET", "/tenant/123/_apis/runtime/runnerscalesets"),
        ("GET", "/tenant/123/_apis/runtime/runnerscalesets/223"),
        ("PATCH", "/tenant/123/_apis/runtime/runnerscalesets/223"),
        ("POST", "/tenant/123/_apis/runtime/runnerscalesets/223/generatejitconfig"),
        ("POST", "/tenant/123/_apis/runtime/runnerscalesets/223/sessions"),
        ("GET", "/messages"),
    )

    def __init__(
        self,
        context: SmokeContext,
        provider: ScaleSetProvider,
        *,
        image_reference: str | None = None,
    ) -> None:
        self.context = context
        self.provider = provider
        self.source_root = context.source_root
        self.group_name = provider.group_name
        self.runner_name = provider.runner_name
        self.environment = context.environment
        self.region = context.region
        self.aws_endpoint = context.aws_endpoint
        self.mock_host = context.mock_host
        self.mock_port = context.mock_port
        self.mock_url = context.mock_url.rstrip("/")
        self.controller_mock_url = f"https://{self.mock_host}:{self.mock_port}"
        self.temp_dir = Path(tempfile.mkdtemp(prefix="ministack-scale-set-smoke."))
        self.image_tag = f"smoke-{uuid.uuid4().hex}"
        self.image_reference = image_reference or f"localhost:4566/{self.repository_name}:{self.image_tag}"
        self.task_definition_path = self.temp_dir / "task-definition.json"
        self.log_path = context.log_path
        self.environment_name = "multi-runner-webhook"
        self.config_path = f"/{self.environment_name}/scale-set-controller/{self.group_name}/{self.runner_name}"
        self.cluster_name = f"{self.environment_name}-scale-set"
        safe_group = re.sub(r"[^a-z0-9_-]", "-", self.group_name.lower())[:14]
        suffix = hashlib.sha256(self.group_name.encode()).hexdigest()[:8]
        self.service_name = f"{self.environment_name}-ss-{safe_group}-{suffix}"

    def cleanup(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def progress(self, message: str) -> None:
        self.context.progress(message)

    def _log(self, value: str) -> None:
        self.context._append_log(value)

    def step(self, name: str):
        return self.context.step(name)

    def run(
        self,
        command: list[str],
        *,
        check: bool = True,
        stream: bool = False,
        cwd: Path | None = None,
        input_text: str | None = None,
        log_output: bool = True,
        log_command: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        return self.context.run(
            command, check=check, stream=stream, cwd=cwd,
            input_text=input_text, log_output=log_output, log_command=log_command,
        )

    def require_commands(self) -> None:
        for command in ("aws", "docker", "openssl", "python3", "terraform"):
            self.context.command(command)

    def aws(self, *args: str, check: bool = True):
        return self.context.aws(*args, check=check)

    def terraform(self, *args: str, check: bool = True) -> str:
        return self.context.terraform(*args, check=check)

    def http(self, method: str, url: str, body=None) -> tuple[int, str]:
        return self.context.http(method, url, body)

    def wait_for(self, predicate, description: str, *, attempts: int = 90, interval: int = 2):
        return self.context.wait_for(predicate, description, attempts=attempts, interval=interval)

    def wait_http(self, url: str, method: str = "GET") -> None:
        self.wait_for(lambda: self.http(method, url)[0] in range(200, 300), url, attempts=90, interval=1)

    def prepare_shared_image(self) -> None:
        """Publish the controller image before the shared webhook example is applied."""
        self.require_commands()
        self.wait_http(f"{self.aws_endpoint.rstrip('/')}/_ministack/health")
        policy = {
            "Version": "2012-10-17",
            "Statement": [{
                "Sid": "AllowAccountPull", "Effect": "Allow",
                "Principal": {"AWS": "arn:aws:iam::000000000000:root"},
                "Action": ["ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"],
            }],
        }
        create_repository = self.run([
            "aws", "--endpoint-url", self.aws_endpoint, "--region", self.region,
            "ecr", "create-repository", "--repository-name", self.repository_name,
            "--image-tag-mutability", "IMMUTABLE", "--image-scanning-configuration", "scanOnPush=false",
            "--output", "json",
        ], check=False)
        if create_repository.returncode and "RepositoryAlreadyExistsException" not in create_repository.stderr:
            raise subprocess.CalledProcessError(
                create_repository.returncode, create_repository.args,
                create_repository.stdout, create_repository.stderr,
            )
        if create_repository.returncode:
            self.progress(f"Reusing existing ECR repository {self.repository_name}")
        self.aws("ecr", "set-repository-policy", "--repository-name", self.repository_name,
                 "--policy-text", json.dumps(policy, separators=(",", ":")))
        self.run([
            "docker", "build", "--target", "runtime", "--file",
            str(self.source_root / "lambdas/services/scale-set/Dockerfile"),
            "--tag", self.image_reference, str(self.source_root),
        ], stream=True)
        password = self.run([
            "aws", "--endpoint-url", self.aws_endpoint, "--region", self.region,
            "ecr", "get-login-password",
        ], log_output=False).stdout
        self.run(["docker", "login", "--username", "AWS", "--password-stdin", "localhost:4566"], input_text=password)
        self.run(["docker", "push", self.image_reference], stream=True)
        self.aws("ecr", "describe-images", "--repository-name", self.repository_name,
                 "--image-ids", f"imageTag={self.image_tag}")

    def add_shared_mockserver_expectations(self) -> None:
        """Replace scale-set API fixtures while preserving shared webhook routes."""
        self.wait_http(f"{self.mock_url}/mockserver/status", "PUT")
        fixture_path = Path(__file__).resolve().parent / "fixtures" / "scale-set-initializer.json"
        expectations = json.loads(fixture_path.read_text(encoding="utf-8"))
        for expectation in expectations:
            request = expectation.get("httpRequest", {})
            method = request.get("method")
            path = request.get("path")
            if isinstance(path, str):
                request["path"] = path.replace("/installations/456/", "/installations/123/")
                if path == "/messages" or path.startswith("/tenant/123/"):
                    code, body = self.http(
                        "PUT",
                        f"{self.mock_url}/mockserver/clear",
                        {"httpRequest": {"method": method, "path": path}},
                    )
                    if code >= 300:
                        raise RuntimeError(f"Could not replace scale-set MockServer expectation {method} {path}: HTTP {code}: {body}")
        self._replace_fixture_urls(expectations)
        code, body = self.http("PUT", f"{self.mock_url}/mockserver/expectation", expectations)
        if code not in (200, 201, 202):
            raise RuntimeError(f"Could not initialize scale-set MockServer expectations: HTTP {code}: {body}")

    def run_shared(self) -> None:
        """Run the scale-set lifecycle against the already-applied shared example."""
        with self.step("Scale-up"):
            definition = self.verify_ecs()
            container = self.scale_up(definition)
        with self.step("Scale-down"):
            self.scale_down(definition, container)
        with self.step("Cleanup"):
            self.wait_for(
                lambda: self.http("PUT", f"{self.mock_url}/mockserver/verify", {
                    "httpRequest": {
                        "method": "DELETE",
                        "path": "/tenant/123/_apis/runtime/runnerscalesets/223/sessions/11111111-1111-1111-1111-111111111111",
                    },
                    "times": {"atLeast": 1},
                })[0] in range(200, 300),
                "MockServer controller session DELETE", attempts=45,
            )
        self.context.progress("Scale-set lifecycle completed")

    def _replace_fixture_urls(self, expectations: list[dict]) -> None:
        for expectation in expectations:
            response = expectation.get("httpResponse", {})
            if isinstance(response.get("body"), str):
                response["body"] = response["body"].replace("https://mockserver:1080", self.controller_mock_url)
            template = expectation.get("httpResponseTemplate", {})
            if isinstance(template.get("template"), str):
                template["template"] = template["template"].replace("https://mockserver:1080", self.controller_mock_url)

    def verify_configuration(self) -> None:
        response = self.aws("ssm", "get-parameter", "--name", self.config_path)
        try:
            config = json.loads(response["Parameter"]["Value"])
        except (KeyError, TypeError, json.JSONDecodeError) as error:
            raise RuntimeError("Scale-set SSM reconciler parameter is missing or invalid") from error
        expected = {
            "githubConfigUrl": f"{self.controller_mock_url}/example",
            "forceGhes": True,
            "sslVerify": False,
            "minRunners": 1,
        }
        for key, value in expected.items():
            if config.get(key) != value:
                raise RuntimeError(f"SSM reconciler setting {key}: expected {value!r}, got {config.get(key)!r}")
        app = config.get("githubApp", {})
        for key in ("appIdParameterName", "installationIdParameterName", "privateKeyParameterName"):
            if not app.get(key):
                raise RuntimeError(f"SSM GitHub App configuration is missing {key}")
        self.progress("SSM manifest has the expected MockServer and GitHub App settings")

    def task_definition(self) -> dict:
        definitions = self.aws("ecs", "list-task-definitions", "--family-prefix", self.service_name, "--sort", "DESC")
        arns = definitions.get("taskDefinitionArns", []) if isinstance(definitions, dict) else []
        if not arns:
            # Preserve the raw discovery evidence when MiniStack does not honor the prefix filter.
            definitions = self.aws("ecs", "list-task-definitions", "--sort", "DESC")
            arns = definitions.get("taskDefinitionArns", []) if isinstance(definitions, dict) else []
        for arn in arns:
            result = self.aws("ecs", "describe-task-definition", "--task-definition", arn)
            definition = result.get("taskDefinition", {}) if isinstance(result, dict) else {}
            if definition.get("family") == self.service_name:
                return definition
        raise RuntimeError(f"No ECS task definition found for scale-set service {self.service_name}")

    def verify_ecs(self) -> dict:
        definition = self.task_definition()
        containers = {item.get("name"): item for item in definition.get("containerDefinitions", [])}
        controller = containers.get("scale-set-controller")
        if controller is None:
            raise RuntimeError("ECS task definition has no scale-set-controller container")
        if controller.get("image") != self.image_reference:
            raise RuntimeError(f"Expected ECS image {self.image_reference}, got {controller.get('image')}")
        if controller.get("logConfiguration", {}).get("logDriver") != "awslogs":
            raise RuntimeError("ECS scale-set controller task does not request the awslogs driver")
        logs = self.aws("logs", "describe-log-groups", "--log-group-name-prefix", f"/aws/ecs/{self.service_name}")
        if not logs.get("logGroups"):
            raise RuntimeError("No CloudWatch log group was created for the ECS controller")
        self.progress("ECS task definition uses the published image and awslogs driver")
        return definition

    def _temporary_task_definition(self, definition: dict, *, minimum: int) -> str:
        definition = json.loads(json.dumps(definition))
        for key in ("taskDefinitionArn", "revision", "status", "requiresAttributes", "compatibilities", "registeredAt", "registeredBy"):
            definition.pop(key, None)
        controller = next((item for item in definition.get("containerDefinitions", []) if item.get("name") == "scale-set-controller"), None)
        if controller is None:
            raise RuntimeError("Scale-set controller container is missing")
        environment = controller.setdefault("environment", [])
        values = {item.get("name"): item for item in environment}
        values["AWS_ACCESS_KEY_ID"] = {"name": "AWS_ACCESS_KEY_ID", "value": "000000000000"}
        values["AWS_SECRET_ACCESS_KEY"] = {"name": "AWS_SECRET_ACCESS_KEY", "value": "test-only"}
        controller["environment"] = list(values.values())
        for item in controller["environment"]:
            if item.get("name") == "SCALE_SET_CONTROLLER_MANIFEST":
                manifest = json.loads(item["value"])
                reconcilers = manifest.get("reconcilers", [])
                if len(reconcilers) != 1:
                    raise RuntimeError("Expected exactly one reconciler in the controller manifest")
                reconcilers[0]["minRunners"] = minimum
                item["value"] = json.dumps(manifest, separators=(",", ":"))
                break
        else:
            raise RuntimeError("Scale-set controller task definition has no inline manifest")
        self.task_definition_path.write_text(json.dumps(definition), encoding="utf-8")
        registered = self.aws("ecs", "register-task-definition", "--cli-input-json", f"file://{self.task_definition_path}")
        arn = registered.get("taskDefinition", {}).get("taskDefinitionArn")
        if not arn:
            raise RuntimeError("MiniStack did not return an ARN for the temporary controller task revision")
        return arn

    def _deploy_task_revision(self, arn: str, *, old_container: str | None = None) -> tuple[str, str]:
        self.aws("ecs", "update-service", "--cluster", self.cluster_name, "--service", self.service_name,
                 "--task-definition", arn, "--force-new-deployment")
        described = self.aws("ecs", "describe-task-definition", "--task-definition", arn)["taskDefinition"]
        revision = str(described["revision"])

        def container_ids(*filters: str) -> list[str]:
            result = self.run(
                ["docker", "ps", "-a", *filters, "--format", "{{.ID}}"],
                check=False,
                log_output=False,
                log_command=False,
            )
            return [line.strip() for line in result.stdout.splitlines() if line.strip()]

        def find_container():
            family_filter = f"label=com.amazonaws.ecs.task-definition-family={self.service_name}"
            name_filter = "name=scale-set-controller"
            exact = container_ids(
                "--filter", family_filter,
                "--filter", f"label=com.amazonaws.ecs.task-definition-version={revision}",
                "--filter", name_filter,
            )
            exact_fresh = next((item for item in exact if item != old_container), None)
            if exact_fresh:
                return exact_fresh

            # Some MiniStack ECS versions omit or lag the revision label. Keep
            # the family/name constraints, then verify any reported revision.
            family_matches = container_ids(
                "--filter", family_filter,
                "--filter", name_filter,
            )
            for candidate in family_matches:
                if candidate == old_container:
                    continue
                inspect = self.run([
                    "docker", "inspect", "--format",
                    '{{index .Config.Labels "com.amazonaws.ecs.task-definition-version"}}',
                    candidate,
                ], check=False, log_output=False, log_command=False)
                if inspect.returncode:
                    continue
                candidate_revision = inspect.stdout.strip()
                if not candidate_revision or candidate_revision == revision:
                    return candidate
            return None

        try:
            container = self.wait_for(find_container, "a fresh MiniStack ECS controller container")
        except RuntimeError as error:
            self._log_controller_startup_diagnostics(revision)
            raise RuntimeError(
                f"Timed out waiting for controller container for task revision {revision}; "
                f"ECS and Docker diagnostics were written to {self.log_path}"
            ) from error
        return container, revision

    def _log_controller_startup_diagnostics(self, revision: str) -> None:
        service = self.aws(
            "ecs", "describe-services", "--cluster", self.cluster_name,
            "--services", self.service_name, check=False,
        )
        tasks = self.aws(
            "ecs", "list-tasks", "--cluster", self.cluster_name,
            "--service-name", self.service_name, check=False,
        )
        task_arns = tasks.get("taskArns", []) if isinstance(tasks, dict) else []
        task_details = self.aws(
            "ecs", "describe-tasks", "--cluster", self.cluster_name,
            "--tasks", *task_arns, check=False,
        ) if task_arns else {}
        task_summaries = [
            {
                "taskArn": task.get("taskArn"),
                "taskDefinitionArn": task.get("taskDefinitionArn"),
                "desiredStatus": task.get("desiredStatus"),
                "lastStatus": task.get("lastStatus"),
                "stoppedReason": task.get("stoppedReason"),
                "containers": [
                    {
                        key: container.get(key)
                        for key in ("name", "image", "runtimeId", "lastStatus", "exitCode", "reason")
                    }
                    for container in task.get("containers", [])
                ],
            }
            for task in task_details.get("tasks", [])
        ] if isinstance(task_details, dict) else task_details
        containers = self.run([
            "docker", "ps", "-a", "--filter", "name=scale-set-controller",
            "--format", "{{.ID}} {{.Image}} {{.Status}} {{.Names}}",
        ], check=False)
        self._log(f"\nController task revision expected: {revision}\n")
        self._log("ECS service state:\n" + json.dumps(service, indent=2, default=str) + "\n")
        self._log("ECS service tasks:\n" + json.dumps(tasks, indent=2, default=str) + "\n")
        self._log("ECS task details:\n" + json.dumps(task_summaries, indent=2, default=str) + "\n")
        self._log("Scale-set Docker containers:\n" + (containers.stdout or "<none>\n"))
        if task_arns and not containers.stdout.strip():
            self._log(
                "No controller Docker container was visible. Verify MiniStack has the Docker engine socket "
                "mounted at /var/run/docker.sock.\n"
            )
        self.progress(f"Controller startup diagnostics written to {self.log_path}")

    def wait_controller_event(self, container: str, marker: str, required: str = "") -> list[str]:
        last_lines: list[str] = []

        def contains_event() -> bool:
            nonlocal last_lines
            result = self.run(
                ["docker", "logs", container], check=False,
                log_output=False, log_command=False,
            )
            last_lines = (result.stdout + (result.stderr or "")).splitlines()
            return any(marker in line and (not required or required in line) for line in last_lines)

        try:
            self.wait_for(contains_event, f"controller log marker {marker}")
        except RuntimeError as error:
            code, request_body = self.http("PUT", f"{self.mock_url}/mockserver/retrieve?type=REQUESTS", {})
            if code in range(200, 300):
                try:
                    requests = json.loads(request_body)
                except json.JSONDecodeError:
                    requests = []
                if isinstance(requests, list):
                    self.progress("MockServer request paths at timeout:")
                    for request in requests[-40:]:
                        if isinstance(request, dict):
                            method = request.get("method", "?")
                            path = request.get("path", "?")
                            self.progress(f"{method} {path}")
            logs = self.run(
                ["docker", "logs", container], check=False,
                log_output=False, log_command=False,
            )
            self.progress("Controller logs at timeout:")
            for line in (logs.stdout + (logs.stderr or "")).splitlines():
                self.progress(line)
            inspect = self.run(["docker", "inspect", "--format", "{{json .NetworkSettings.Networks}}", container], check=False)
            self.progress(f"Controller network attachments: {inspect.stdout.strip()}")
            raise error
        self._log(f"\n$ docker logs {container}\n" + "\n".join(last_lines) + "\n")
        self.progress(f"Controller logs contain {marker}")
        return last_lines

    def verify_routes(self) -> None:
        for method, path in self.routes:
            path = path.replace("/installations/456/", "/installations/123/")
            body = {"httpRequest": {"method": method, "path": path}, "times": {"atLeast": 1}}
            self.wait_for(
                lambda: self.http("PUT", f"{self.mock_url}/mockserver/verify", body)[0] in range(200, 300),
                f"MockServer request {method} {path}", attempts=45,
            )
            self.progress(f"MockServer received {method} {path}")

    def scale_up(self, task_definition: dict) -> str:
        self.verify_configuration()
        self.verify_ecs()
        arn = self._temporary_task_definition(task_definition, minimum=1)
        container, _revision = self._deploy_task_revision(arn)
        self.progress(f"MiniStack started ECS controller container {container}")
        self.progress("MiniStack does not emit ECS awslogs streams; checking controller runtime logs instead")
        self.wait_controller_event(container, "scale_set_controller_started")
        self.wait_controller_event(container, "scale_set_session_created")
        self.wait_controller_event(container, "scale_set_reconciled", '"desiredRunners":1')
        self.wait_controller_event(container, "scale_set_reconciled", '"status":"converged"')
        runner = self.provider.wait_for_runner(self)
        self.provider.verify_runner(self, runner)
        self.verify_routes()
        return container

    def scale_down(self, task_definition: dict, old_container: str) -> None:
        response = self.aws("ssm", "get-parameter", "--name", self.config_path)
        reconciler = json.loads(response["Parameter"]["Value"])
        if reconciler.get("minRunners") != 1:
            raise RuntimeError("Expected the SSM minimum to be one before scale-down")
        reconciler["minRunners"] = 0
        self.aws("ssm", "put-parameter", "--name", self.config_path, "--type", "String",
                 "--value", json.dumps(reconciler, separators=(",", ":")), "--overwrite")
        self.progress("SSM manifest minimum changed from one runner to zero")
        arn = self._temporary_task_definition(task_definition, minimum=0)
        container, _revision = self._deploy_task_revision(arn, old_container=old_container)
        self.progress(f"ECS service deployed a fresh controller container {container} for scale-down")
        self.wait_controller_event(container, "scale_set_controller_started")
        self.wait_controller_event(container, "scale_set_session_created")
        self.wait_controller_event(container, "scale_set_reconciled", '"desiredRunners":0')
        self.wait_controller_event(container, "scale_set_reconciled", '"status":"converged"')
        self.provider.wait_for_scale_down(self)


def prepare(context: SmokeContext, provider: ScaleSetProvider) -> str:
    """Prepare shared scale-set fixtures and return the controller image reference."""
    scenario = ScaleSetScenario(context, provider)
    try:
        scenario.prepare_shared_image()
        scenario.add_shared_mockserver_expectations()
        return scenario.image_reference
    finally:
        scenario.cleanup()


def run(context: SmokeContext, provider: ScaleSetProvider, image_reference: str) -> None:
    """Run the scale-set lifecycle with the selected compute provider."""
    scenario = ScaleSetScenario(context, provider, image_reference=image_reference)
    try:
        scenario.run_shared()
    finally:
        scenario.cleanup()
