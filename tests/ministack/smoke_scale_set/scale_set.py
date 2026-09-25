"""MiniStack integration smoke for the ECS scale-set controller."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid

from .ec2 import Ec2ScaleSetProvider
from .provider import ScaleSetProvider


class ScaleSetSmokeContext:
    """Hold scale-set smoke configuration, runtime state, and shared helpers."""

    example = "multi-runner-scale-set"
    group_name = "linux-scale-set"
    runner_name = "linux-scale-set"
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
        script_dir: Path,
        *,
        provider: ScaleSetProvider | None = None,
        keep_deployment: bool = False,
    ) -> None:
        self.script_dir = script_dir
        self.provider = provider or Ec2ScaleSetProvider()
        self.source_root = script_dir.parent.parent
        self.example_root = self.source_root / "examples" / self.example
        self.environment = os.environ.copy()
        self.region = self.environment.setdefault("AWS_DEFAULT_REGION", "eu-west-1")
        self.environment.setdefault("AWS_ACCESS_KEY_ID", "000000000000")
        self.environment.setdefault("AWS_SECRET_ACCESS_KEY", "test-only")
        self.environment.setdefault("AWS_REGION", self.region)
        self.environment.setdefault("AWS_ENDPOINT_URL", "http://127.0.0.1:4566")
        self.environment.setdefault("AWS_EC2_METADATA_DISABLED", "true")
        self.aws_endpoint = self.environment["AWS_ENDPOINT_URL"]
        self.mock_host = self.environment.get("MINISTACK_GITHUB_MOCK_HOST", "host.docker.internal")
        try:
            self.mock_port = int(self.environment.get("MINISTACK_GITHUB_MOCK_PORT", "1080"))
        except ValueError as error:
            raise RuntimeError("MINISTACK_GITHUB_MOCK_PORT must be an integer") from error
        if not 1 <= self.mock_port <= 65535:
            raise RuntimeError("MINISTACK_GITHUB_MOCK_PORT must be between 1 and 65535")
        if not re.fullmatch(r"(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])", self.mock_host):
            raise RuntimeError("MINISTACK_GITHUB_MOCK_HOST must be a hostname or IP literal")
        self.mock_url = self.environment.get(
            "MINISTACK_GITHUB_MOCK_URL", f"http://127.0.0.1:{self.mock_port}"
        ).rstrip("/")
        self.controller_mock_url = f"https://{self.mock_host}:{self.mock_port}"
        self.keep_deployment = keep_deployment or self.environment.get("MINISTACK_SMOKE_KEEP_DEPLOYMENT") == "1"
        self.temp_dir = Path(tempfile.mkdtemp(prefix="ministack-scale-set-smoke."))
        self.image_tag = f"smoke-{uuid.uuid4().hex}"
        self.image_reference = f"localhost:4566/{self.repository_name}:{self.image_tag}"
        self.tfvars_path = self.temp_dir / "terraform.tfvars"
        self.app_key_path = self.temp_dir / "app-key.pem"
        self.task_definition_path = self.temp_dir / "task-definition.json"
        self.log_path = Path(self.environment.get("MINISTACK_SMOKE_LOG_FILE", "ministack-smoke.log"))
        self.checklist_path = Path(
            self.environment.get("MINISTACK_SMOKE_CHECKLIST_FILE", "ministack-smoke-checklist.txt")
        )
        self.checklist = [
            ("ministack", "MiniStack and MockServer are ready"),
            ("image", "Scale-set controller image is available in MiniStack ECR"),
            ("terraform", "Scale-set example is deployed"),
            ("config", "SSM reconciler configuration matches the smoke inputs"),
            ("ecs", "ECS controller task definition has expected image and logging"),
            ("controller", "Controller session reconciles one runner and calls MockServer routes"),
            ("scale_down", "Controller reconciles zero runners and EC2 runner terminates"),
            ("cleanup", "Terraform deployment is destroyed or retained by request"),
        ]
        self.passed: set[str] = set()
        self.failure = ""
        self.terraform_applied = False
        self.step_depth = 0
        self.environment_name = self._read_environment_name()
        self.config_path = f"/{self.environment_name}/scale-set-controller/{self.group_name}/{self.runner_name}"
        self.cluster_name = f"{self.environment_name}-scale-set"
        safe_group = re.sub(r"[^a-z0-9_-]", "-", self.group_name.lower())[:14]
        suffix = hashlib.sha256(self.group_name.encode()).hexdigest()[:8]
        self.service_name = f"{self.environment_name}-ss-{safe_group}-{suffix}"

    def _read_environment_name(self) -> str:
        tfvars = (self.script_dir / f"{self.example}.tfvars").read_text(encoding="utf-8")
        match = re.search(r'(?m)^\s*environment\s*=\s*"([^"]+)"', tfvars)
        if not match:
            raise RuntimeError(f"Could not read environment from {self.example}.tfvars")
        return match.group(1)

    def _log(self, value: str) -> None:
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        value = value.replace(self.environment.get("AWS_SECRET_ACCESS_KEY", ""), "[REDACTED]")
        with self.log_path.open("a", encoding="utf-8") as log_file:
            log_file.write(value)

    def progress(self, message: str) -> None:
        line = f"{'  ' * self.step_depth}{message}"
        print(line, flush=True)
        self._log(line + "\n")

    def mark(self, key: str) -> None:
        self.passed.add(key)
        self._write_checklist("running")

    def initialize_checklist(self) -> None:
        self._write_checklist("running")
        self.progress(f"Writing scale-set checklist to {self.checklist_path}")
        self.progress(f"Writing command output to {self.log_path}")

    def record_checklist_failure(self, error: BaseException) -> None:
        self.failure = f"{type(error).__name__}: {error}"

    def finish_checklist(self, passed: bool) -> None:
        self._write_checklist("passed" if passed else "failed")

    def _write_checklist(self, status: str) -> None:
        lines = ["MiniStack scale-set integration smoke checklist", f"Status: {status}"]
        if self.failure:
            lines.append(f"Failure: {self.failure}")
        lines.extend(f"[{ 'PASS' if key in self.passed else '    ' }] {label}" for key, label in self.checklist)
        self.checklist_path.parent.mkdir(parents=True, exist_ok=True)
        self.checklist_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def step(self, name: str):
        smoke = self

        class Step:
            def __enter__(self):
                smoke.progress(name)
                smoke.step_depth += 1

            def __exit__(self, *_exc):
                smoke.step_depth -= 1

        return Step()

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
        if log_command:
            self._log(f"\n$ {shlex.join(command)}\n")
        try:
            if stream:
                process = subprocess.Popen(
                    command, cwd=cwd, env=self.environment, text=True,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                )
                output: list[str] = []
                assert process.stdout is not None
                for line in process.stdout:
                    output.append(line)
                    if log_output:
                        self._log(line)
                result = subprocess.CompletedProcess(command, process.wait(), "".join(output), "")
            else:
                result = subprocess.run(
                    command, cwd=cwd, env=self.environment, input=input_text,
                    text=True, capture_output=True, check=False,
                )
                if log_output:
                    self._log(result.stdout or "")
                    self._log(result.stderr or "")
        except OSError as error:
            raise RuntimeError(f"Could not run {command[0]}: {error}") from error
        if check and result.returncode:
            self.progress(f"Command failed: {shlex.join(command)}")
            sys.stdout.write(result.stdout or "")
            sys.stderr.write(result.stderr or "")
            sys.stdout.flush()
            sys.stderr.flush()
            raise subprocess.CalledProcessError(result.returncode, command, result.stdout, result.stderr)
        return result

    def require_commands(self) -> None:
        for command in ("aws", "docker", "openssl", "python3", "terraform"):
            if shutil.which(command) is None:
                raise RuntimeError(f"{command} is required to run the scale-set MiniStack smoke test")

    def aws(self, *args: str, check: bool = True):
        result = self.run(
            ["aws", "--endpoint-url", self.aws_endpoint, "--region", self.region, *args, "--output", "json"],
            check=check,
        )
        if not result.stdout.strip():
            return None
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return result.stdout.strip()

    def terraform(self, *args: str, check: bool = True) -> str:
        result = self.run(["terraform", f"-chdir={self.example_root}", *args], check=check)
        return result.stdout.strip()

    def http(self, method: str, url: str, body=None) -> tuple[int, str]:
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json"} if data is not None else {},
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode("utf-8", errors="replace")
        except (TimeoutError, urllib.error.URLError, OSError) as error:
            return 0, str(error)

    def wait_for(self, predicate, description: str, *, attempts: int = 90, interval: int = 2):
        for attempt in range(1, attempts + 1):
            result = predicate()
            if result:
                return result
            if attempt == 1 or attempt % 10 == 0:
                self.progress(f"Still waiting for {description} ({attempt}/{attempts})")
            time.sleep(interval)
        raise RuntimeError(f"Timed out waiting for {description}")

    def wait_http(self, url: str, method: str = "GET") -> None:
        self.wait_for(lambda: self.http(method, url)[0] in range(200, 300), url, attempts=90, interval=1)

    def prepare(self) -> None:
        self.require_commands()
        with self.step("Wait for MiniStack and MockServer"):
            self.wait_http(f"{self.aws_endpoint.rstrip('/')}/_ministack/health")
            self.wait_http(f"{self.mock_url}/mockserver/status", "PUT")
            code, body = self.http("PUT", f"{self.mock_url}/mockserver/reset")
            if code not in (200, 202):
                raise RuntimeError(f"MockServer reset failed: HTTP {code}: {body}")
            fixture_path = Path(__file__).resolve().parent / "fixtures" / "initializer-json.json"
            expectations = json.loads(fixture_path.read_text(encoding="utf-8"))
            self._replace_fixture_urls(expectations)
            code, body = self.http("PUT", f"{self.mock_url}/mockserver/expectation", expectations)
            if code not in (200, 201, 202):
                raise RuntimeError(f"Could not initialize MockServer expectations: HTTP {code}: {body}")
        self.mark("ministack")

        with self.step("Build and publish the scale-set controller image"):
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
            if create_repository.returncode:
                if "RepositoryAlreadyExistsException" not in create_repository.stderr:
                    self.progress("Command failed: aws ecr create-repository")
                    sys.stdout.write(create_repository.stdout or "")
                    sys.stderr.write(create_repository.stderr or "")
                    sys.stdout.flush()
                    sys.stderr.flush()
                    raise subprocess.CalledProcessError(
                        create_repository.returncode,
                        create_repository.args,
                        create_repository.stdout,
                        create_repository.stderr,
                    )
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
        self.mark("image")

        self._prepare_tfvars()
        with self.step("Apply multi-runner-scale-set Terraform example"):
            self.terraform_applied = True
            self.run([
                str(self.source_root / "tests/ministack/run-example.sh"), "apply", self.example, str(self.tfvars_path),
            ], stream=True)
        self.mark("terraform")

    def _replace_fixture_urls(self, expectations: list[dict]) -> None:
        for expectation in expectations:
            response = expectation.get("httpResponse", {})
            if isinstance(response.get("body"), str):
                response["body"] = response["body"].replace("https://mockserver:1080", self.controller_mock_url)
            template = expectation.get("httpResponseTemplate", {})
            if isinstance(template.get("template"), str):
                template["template"] = template["template"].replace("https://mockserver:1080", self.controller_mock_url)

    def _prepare_tfvars(self) -> None:
        source = (self.script_dir / f"{self.example}.tfvars").read_text(encoding="utf-8")
        source = self.provider.configure_tfvars(self, source)
        key_result = self.run([
            "openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048",
            "-out", str(self.app_key_path),
        ])
        if key_result.returncode:
            raise RuntimeError("OpenSSL could not generate the temporary GitHub App key")
        key_base64 = base64.b64encode(self.app_key_path.read_bytes()).decode("ascii")
        source, key_count = re.subn(
            r"(?m)^(\s*key_base64\s*=\s*)[^\n]+",
            lambda match: f'{match.group(1)}"{key_base64}"', source, count=1,
        )
        if key_count != 1:
            raise RuntimeError("Could not replace the GitHub App key in the scale-set tfvars")
        source, url_count = re.subn(
            r'(?m)^(\s*url\s*=\s*)"https://mockserver:1080"',
            lambda match: f'{match.group(1)}"{self.controller_mock_url}"', source, count=1,
        )
        if url_count != 1:
            raise RuntimeError("Could not point the scale-set example at the MockServer fixture")
        source, image_count = re.subn(
            r'(?m)^(\s*image\s*=\s*)"localhost:4566/scale-set-controller:smoke"$',
            lambda match: f'{match.group(1)}"{self.image_reference}"',
            source,
            count=1,
        )
        if image_count != 1:
            raise RuntimeError("Could not replace the scale-set controller image in the smoke tfvars")
        self.tfvars_path.write_text(source, encoding="utf-8")

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
        self.progress("[PASS] SSM manifest has the expected MockServer and GitHub App settings")
        self.mark("config")

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
        self.progress("[PASS] ECS task definition uses the published image and awslogs driver")
        self.mark("ecs")
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
            logs = self.run(["docker", "logs", container], check=False)
            self.progress("Controller logs at timeout:")
            sys.stderr.write(logs.stdout + (logs.stderr or ""))
            inspect = self.run(["docker", "inspect", "--format", "{{json .NetworkSettings.Networks}}", container], check=False)
            self.progress(f"Controller network attachments: {inspect.stdout.strip()}")
            raise error
        self._log(f"\n$ docker logs {container}\n" + "\n".join(last_lines) + "\n")
        self.progress(f"[PASS] Controller logs contain {marker}")
        return last_lines

    def verify_routes(self) -> None:
        for method, path in self.routes:
            body = {"httpRequest": {"method": method, "path": path}, "times": {"atLeast": 1}}
            self.wait_for(
                lambda: self.http("PUT", f"{self.mock_url}/mockserver/verify", body)[0] in range(200, 300),
                f"MockServer request {method} {path}", attempts=45,
            )
            self.progress(f"[PASS] MockServer received {method} {path}")

    def scale_up(self, task_definition: dict) -> str:
        self.verify_configuration()
        self.verify_ecs()
        arn = self._temporary_task_definition(task_definition, minimum=1)
        container, _revision = self._deploy_task_revision(arn)
        self.progress(f"[PASS] MiniStack started ECS controller container {container}")
        self.progress("MiniStack does not emit ECS awslogs streams; checking controller runtime logs instead")
        self.wait_controller_event(container, "scale_set_controller_started")
        self.wait_controller_event(container, "scale_set_session_created")
        self.wait_controller_event(container, "scale_set_reconciled", '"desiredRunners":1')
        self.wait_controller_event(container, "scale_set_reconciled", '"status":"converged"')
        runner = self.provider.wait_for_runner(self)
        self.provider.verify_runner(self, runner)
        self.verify_routes()
        self.mark("controller")
        return container

    def scale_down(self, task_definition: dict, old_container: str) -> None:
        response = self.aws("ssm", "get-parameter", "--name", self.config_path)
        reconciler = json.loads(response["Parameter"]["Value"])
        if reconciler.get("minRunners") != 1:
            raise RuntimeError("Expected the SSM minimum to be one before scale-down")
        reconciler["minRunners"] = 0
        self.aws("ssm", "put-parameter", "--name", self.config_path, "--type", "String",
                 "--value", json.dumps(reconciler, separators=(",", ":")), "--overwrite")
        self.progress("[PASS] SSM manifest minimum changed from one runner to zero")
        arn = self._temporary_task_definition(task_definition, minimum=0)
        container, _revision = self._deploy_task_revision(arn, old_container=old_container)
        self.progress(f"[PASS] ECS service deployed a fresh controller container {container} for scale-down")
        self.wait_controller_event(container, "scale_set_controller_started")
        self.wait_controller_event(container, "scale_set_session_created")
        self.wait_controller_event(container, "scale_set_reconciled", '"desiredRunners":0')
        self.wait_controller_event(container, "scale_set_reconciled", '"status":"converged"')
        self.provider.wait_for_scale_down(self)
        self.mark("scale_down")

    def cleanup(self, success: bool) -> None:
        # The temporary App private key is never needed to retain a failed deployment.
        self.app_key_path.unlink(missing_ok=True)
        if self.terraform_applied and self.keep_deployment:
            self.progress(f"Terraform deployment retained; tfvars file: {self.tfvars_path}")
            self.progress(f"Temporary files retained at: {self.temp_dir}")
        elif self.terraform_applied:
            self.progress("Destroying multi-runner-scale-set Terraform deployment")
            self.run([
                str(self.source_root / "tests/ministack/run-example.sh"), "destroy", self.example, str(self.tfvars_path),
            ], check=False, stream=True)
            self.terraform_applied = False
            try:
                self.temp_dir.rmdir()
            except OSError:
                shutil.rmtree(self.temp_dir, ignore_errors=True)
        else:
            shutil.rmtree(self.temp_dir, ignore_errors=True)
        if success:
            self.mark("cleanup")

def run(context: ScaleSetSmokeContext) -> None:
    """Run the controller lifecycle using an initialized smoke context."""

    with context.step("Scale-set MiniStack integration smoke"):
        with context.step("Prepare controller image and deployment"):
            context.prepare()
        with context.step("Verify ECS controller scale-up"):
            definition = context.verify_ecs()
            container = context.scale_up(definition)
        with context.step("Verify ECS controller scale-down"):
            context.scale_down(definition, container)
        with context.step("Destroy deployment"):
            if context.keep_deployment:
                context.progress("Keeping the scale-set Terraform deployment for debugging")
            else:
                context.run([
                    str(context.source_root / "tests/ministack/run-example.sh"), "destroy", context.example,
                    str(context.tfvars_path),
                ], stream=True)
                context.terraform_applied = False
            context.mark("cleanup")
        if not context.keep_deployment:
            with context.step("Verify controller session cleanup"):
                context.wait_for(
                    lambda: context.http("PUT", f"{context.mock_url}/mockserver/verify", {
                        "httpRequest": {"method": "DELETE", "path": "/tenant/123/_apis/runtime/runnerscalesets/223/sessions/11111111-1111-1111-1111-111111111111"},
                        "times": {"atLeast": 1},
                    })[0] in range(200, 300),
                    "MockServer controller session DELETE", attempts=45,
                )
    context.progress(
        f"Scale-set MiniStack ECS/MockServer smoke test passed for {context.provider.display_name}."
    )


def main(argv: list[str] | None = None) -> int:
    providers: dict[str, ScaleSetProvider] = {"ec2": Ec2ScaleSetProvider()}
    parser = argparse.ArgumentParser(description="Run the MiniStack ECS scale-set integration smoke test.")
    parser.add_argument("--provider", choices=tuple(providers), default="ec2")
    parser.add_argument("--keep-deployment", action="store_true", help="Keep Terraform resources and temporary inputs for debugging")
    args = parser.parse_args(argv)
    context = ScaleSetSmokeContext(
        Path(__file__).resolve().parent.parent,
        provider=providers[args.provider],
        keep_deployment=args.keep_deployment,
    )
    context.initialize_checklist()
    succeeded = False
    try:
        run(context)
        succeeded = True
        return 0
    except BaseException as error:
        context.record_checklist_failure(error)
        raise
    finally:
        try:
            context.cleanup(succeeded)
        finally:
            context.finish_checklist(succeeded)


if __name__ == "__main__":
    raise SystemExit(main())
