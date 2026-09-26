"""Shared MiniStack smoke-test plumbing."""

from __future__ import annotations

import base64
from contextlib import contextmanager
import hashlib
import hmac
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlsplit, urlunsplit

class SmokeContext:
    def __init__(self, script_dir: Path, *, microvm_enabled: bool, keep_deployment: bool = False) -> None:
        self.script_dir = script_dir
        self.fixture_dir = Path(__file__).parent / "fixtures"
        self.source_root = script_dir.parent.parent
        self.example_root = self.source_root / "examples" / "multi-runner-orchestration"
        self.aws_endpoint = os.environ.get("AWS_ENDPOINT_URL", "http://localhost:4566")
        self.region = os.environ.get("AWS_DEFAULT_REGION", "eu-west-1")
        self.environment = os.environ.copy()
        self.environment.setdefault("AWS_ACCESS_KEY_ID", "000000000000")
        self.environment.setdefault("AWS_SECRET_ACCESS_KEY", "test-only")
        self.environment.setdefault("AWS_DEFAULT_REGION", self.region)
        self.environment.setdefault("AWS_REGION", self.region)
        self.environment.setdefault("AWS_ENDPOINT_URL", self.aws_endpoint)
        self.environment.setdefault("AWS_EC2_METADATA_DISABLED", "true")
        self.mock_host = "host.docker.internal"
        self.mock_port = 1080
        self.mock_url = "http://localhost:1080"
        self.tfvars_path: Path | None = None
        self.webhook_endpoint = ""
        self.webhook_secret = ""
        self.discovered_instance_ids: list[str] = []
        self.discovered_microvm_ids: list[str] = []
        self.before_microvm_ids: set[str] = set()
        self.response_path = Path(tempfile.mkstemp(prefix="ministack-smoke-response.")[1])
        self.microvm_enabled = microvm_enabled
        self.log_path = Path(os.environ.get("MINISTACK_SMOKE_LOG_FILE", "ministack-smoke.log"))
        self.keep_deployment = keep_deployment or os.environ.get("MINISTACK_SMOKE_KEEP_DEPLOYMENT") == "1"
        self.step_depth = 0
        self.progress(f"Writing smoke command output to {self.log_path}")

    def _append_log(self, value: str) -> None:
        if not value:
            return
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.log_path.open("a", encoding="utf-8") as log_file:
            log_file.write(value)

    def progress(self, message: str) -> None:
        line = f"{'  ' * self.step_depth}{message}"
        print(line, flush=True)
        self._append_log(f"{line}\n")

    @contextmanager
    def step(self, name: str) -> Iterator[None]:
        self.progress(name)
        self.step_depth += 1
        try:
            yield
        finally:
            self.step_depth -= 1

    def _log_command_output(
        self,
        command: list[str],
        stdout: str | None,
        stderr: str | None,
        *,
        include_command: bool = True,
    ) -> None:
        output = ""
        if include_command:
            output += f"\n$ {shlex.join(command)}\n"
        if stdout:
            output += stdout
        if stderr:
            output += stderr
        self._append_log(output)

    def command(self, name: str) -> None:
        if not shutil_which(name):
            raise RuntimeError(f"{name} is required to run the MiniStack smoke test")

    def run(
        self,
        command: list[str],
        *,
        check: bool = True,
        stream: bool = False,
        cwd: Path | None = None,
        log_output: bool = True,
        input_text: str | None = None,
        log_command: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        if not stream:
            try:
                result = subprocess.run(
                    command,
                    check=check,
                    input=input_text,
                    text=True,
                    capture_output=True,
                    env=self.environment,
                    cwd=cwd,
                )
            except subprocess.CalledProcessError as error:
                if log_output:
                    self._log_command_output(command, error.stdout, error.stderr, include_command=log_command)
                raise
            if log_output:
                self._log_command_output(command, result.stdout, result.stderr, include_command=log_command)
            return result

        log_file = self.log_path.open("a", encoding="utf-8") if log_output else None
        try:
            process = subprocess.Popen(
                command,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                bufsize=1,
                env=self.environment,
                cwd=cwd,
            )
        except BaseException:
            if log_file is not None:
                log_file.close()
            raise

        output: list[str] = []
        try:
            if log_file is not None and log_command:
                log_file.write(f"\n$ {shlex.join(command)}\n")
            assert process.stdout is not None
            for line in process.stdout:
                output.append(line)
                if log_file is not None:
                    log_file.write(line)
                    log_file.flush()
            return_code = process.wait()
        finally:
            if log_file is not None:
                log_file.close()

        result = subprocess.CompletedProcess(command, return_code, "".join(output), None)
        if check and return_code != 0:
            self.progress(f"Command failed: {shlex.join(command)}")
            sys.stdout.write(result.stdout)
            sys.stdout.flush()
            raise subprocess.CalledProcessError(return_code, command, output=result.stdout)
        return result

    def aws(self, *args: str, check: bool = True) -> Any:
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

    def terraform(self, *args: str, check: bool = True, log_output: bool = True) -> str:
        result = self.run(
            ["terraform", f"-chdir={self.example_root}", *args],
            check=check,
            log_output=log_output,
        )
        return result.stdout.strip()

    def http(self, method: str, url: str, body: Any = None) -> tuple[int, str]:
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"} if data else {},
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, response.read().decode()
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode()
        except (TimeoutError, urllib.error.URLError) as error:
            return 0, str(error)

    def wait_for(self, predicate, description: str, attempts: int = 60, interval: int = 2) -> Any:
        for attempt in range(1, attempts + 1):
            result = predicate()
            if result:
                return result
            if attempt == 1 or attempt % 10 == 0:
                self.progress(f"Still waiting for {description} ({attempt}/{attempts})")
            time.sleep(interval)
        raise RuntimeError(f"Timed out waiting for {description}")

    def configure_mockserver(self) -> None:
        self.progress(f"Using MockServer at {self.mock_url}")
        self.wait_for(lambda: self.http("PUT", f"{self.mock_url}/mockserver/status")[0] < 300, "MockServer")
        expectations = json.loads((self.fixture_dir / "github-api-expectations.json").read_text())
        for expectation in expectations:
            status, body = self.http("PUT", f"{self.mock_url}/mockserver/expectation", expectation)
            if status >= 300:
                raise RuntimeError(f"MockServer rejected an expectation: {status} {body}")

    def add_expectation(self, method: str, path: str, status: int, body: Any = None) -> None:
        response: dict[str, Any] = {"statusCode": status}
        if body is not None:
            response.update(headers={"Content-Type": ["application/json"]}, body=json.dumps(body))
        code, text = self.http(
            "PUT",
            f"{self.mock_url}/mockserver/expectation",
            {"httpRequest": {"method": method, "path": path}, "httpResponse": response},
        )
        if code >= 300:
            raise RuntimeError(f"MockServer expectation failed: {code} {text}")

    def clear_expectation(self, method: str, path: str) -> None:
        code, text = self.http(
            "PUT",
            f"{self.mock_url}/mockserver/clear",
            {"httpRequest": {"method": method, "path": path}},
        )
        if code >= 300:
            raise RuntimeError(f"MockServer expectation clear failed: {code} {text}")

    def clear_runner_group_cache(self, provider: str) -> None:
        parameter_name = (
            f"/github-action-runners/multi-runner-webhook/{provider}/runners/config/runner-group/Default"
        )
        self.progress(f"Clearing {provider} runner-group cache")
        self.aws("ssm", "delete-parameter", "--name", parameter_name, check=False)

    def clear_requests(self) -> None:
        self.progress("Clearing MockServer request history")
        code, _ = self.http("PUT", f"{self.mock_url}/mockserver/clear?type=log")
        if code >= 300:
            raise RuntimeError("Failed to clear MockServer request history")
        self.progress("MockServer request history cleared")

    def verify_route(self, method: str, path: str, description: str) -> None:
        def verify() -> bool:
            code, _ = self.http(
                "PUT",
                f"{self.mock_url}/mockserver/verify",
                {"httpRequest": {"method": method, "path": path}, "times": {"atLeast": 1}},
            )
            return code < 300

        try:
            self.wait_for(verify, description)
        except RuntimeError as error:
            raise RuntimeError(
                f"{error}. Recent messages in the provider Lambda logs may be available in {self.log_path}"
            ) from error

    def send_webhook(self, event: dict[str, Any], delivery_id: str) -> None:
        payload = json.dumps(event).encode()
        signature = hmac.new(self.webhook_secret.encode(), payload, hashlib.sha256).hexdigest()
        parsed_endpoint = urlsplit(self.webhook_endpoint)
        endpoint = urlunsplit((parsed_endpoint.scheme, f"localhost:{parsed_endpoint.port or 4566}", parsed_endpoint.path, parsed_endpoint.query, parsed_endpoint.fragment))
        self.progress(f"Sending webhook {delivery_id} to {endpoint} (Host: {parsed_endpoint.netloc})")
        request = urllib.request.Request(
            endpoint,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Host": parsed_endpoint.netloc,
                "X-GitHub-Event": "workflow_job",
                "X-GitHub-Delivery": delivery_id,
                "X-GitHub-Hook-Installation-Target-ID": "123",
                "X-Hub-Signature-256": f"sha256={signature}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                status = response.status
        except urllib.error.HTTPError as error:
            status = error.code
            body = error.read().decode()
            raise RuntimeError(
                f"Webhook smoke request failed with HTTP {status} at {endpoint} "
                f"(Host: {parsed_endpoint.netloc}): {body}"
            ) from error
        if status not in (200, 201):
            raise RuntimeError(f"Webhook smoke request failed with HTTP {status}")
        self.progress(f"Webhook {delivery_id} accepted with HTTP {status}")

    def wait_for_log(self, group: str, marker: str, description: str) -> None:
        self.progress(f"Waiting for {description} ({group})")
        def found() -> bool:
            events = self.aws("logs", "filter-log-events", "--log-group-name", group, "--filter-pattern", marker, "--limit", "1", check=False)
            return bool(events and events.get("events"))

        try:
            self.wait_for(found, description)
        except RuntimeError as error:
            groups = self.aws(
                "logs", "describe-log-groups",
                "--log-group-name-prefix", "/aws/lambda/multi-runner-webhook",
                check=False,
            ) or {}
            available = [item.get("logGroupName") for item in groups.get("logGroups", [])]
            recent = self.aws(
                "logs", "filter-log-events", "--log-group-name", group, "--limit", "10", check=False,
            ) or {}
            messages = [item.get("message", "") for item in recent.get("events", [])]
            raise RuntimeError(
                f"{error}. Available smoke log groups: {available}. "
                f"Recent messages in {group}: {messages}"
            ) from error
        self.progress(f"Found {description}")

    def recent_log_messages(self, group: str, limit: int = 50) -> list[str]:
        events = self.aws(
            "logs",
            "filter-log-events",
            "--log-group-name",
            group,
            "--limit",
            str(limit),
            check=False,
        ) or {}
        return [item.get("message", "") for item in events.get("events", [])]

    def invoke(self, function_name: str, payload: dict[str, Any], description: str) -> None:
        payload_path = Path(tempfile.mkstemp(prefix="ministack-smoke-payload.")[1])
        output_path = Path(tempfile.mkstemp(prefix="ministack-smoke-lambda.")[1])
        try:
            payload_path.write_text(json.dumps(payload))
            result = self.run([
                "aws", "--endpoint-url", self.aws_endpoint, "--region", self.region,
                "lambda", "invoke", "--function-name", function_name,
                "--payload", f"fileb://{payload_path}", str(output_path), "--output", "json",
            ], check=False)
            if result.returncode != 0:
                raise RuntimeError(
                    f"{description} failed with exit code {result.returncode}: "
                    f"stdout={result.stdout.strip()} stderr={result.stderr.strip()}"
                )
            metadata = json.loads(result.stdout)
            if metadata.get("FunctionError"):
                raise RuntimeError(output_path.read_text())
        finally:
            payload_path.unlink(missing_ok=True)
            output_path.unlink(missing_ok=True)

    def configure_runner_fixtures(
        self,
        provider: str,
        runners: list[tuple[int, str]],
        target_runner_id: int,
    ) -> None:
        """Expose all active GitHub runners while selecting one for removal.

        The scale-down Lambda evaluates every active provider resource. If the
        GitHub list only contains the target runner, the remaining provider
        resources are incorrectly marked as orphans and later invocations skip
        the normal list-runners path. Keep the other runners visible and busy
        so the fixture models a real multi-runner environment and only the
        selected runner is eligible for termination.
        """
        base = "/api/v3/orgs/test-owner/actions/runners"
        if not any(runner_id == target_runner_id for runner_id, _ in runners):
            raise RuntimeError(f"Target GitHub runner {target_runner_id} is not in the active runner fixtures")

        github_runners = [
            {
                "id": runner_id,
                "name": f"{provider}-{resource_id}",
                "os": "linux",
                "status": "offline",
                "busy": runner_id != target_runner_id,
                "labels": [],
            }
            for runner_id, resource_id in runners
        ]
        paths = [("GET", base)]
        paths.extend(("GET", f"{base}/{runner_id}") for runner_id, _ in runners)
        paths.append(("DELETE", f"{base}/{target_runner_id}"))
        for method, path in paths:
            self.http("PUT", f"{self.mock_url}/mockserver/clear", {"httpRequest": {"method": method, "path": path}})
        self.add_expectation("GET", base, 200, {"total_count": len(github_runners), "runners": github_runners})
        for runner in github_runners:
            self.add_expectation("GET", f"{base}/{runner['id']}", 200, runner)
        self.add_expectation("DELETE", f"{base}/{target_runner_id}", 204)

    def configure_runner_removed(self, runner_id: int) -> None:
        path = f"/api/v3/orgs/test-owner/actions/runners/{runner_id}"
        self.http("PUT", f"{self.mock_url}/mockserver/clear", {"httpRequest": {"method": "GET", "path": path}})
        self.add_expectation("GET", path, 404, {"message": "Not Found"})

    def configure_empty_runner_list(self) -> None:
        path = "/api/v3/orgs/test-owner/actions/runners"
        self.http("PUT", f"{self.mock_url}/mockserver/clear", {"httpRequest": {"method": "GET", "path": path}})
        self.add_expectation("GET", path, 200, {"total_count": 0, "runners": []})

    def assert_runner_removed(self, runner_id: int) -> None:
        code, _ = self.http("GET", f"{self.mock_url}/api/v3/orgs/test-owner/actions/runners/{runner_id}")
        if code != 404:
            raise RuntimeError(f"Expected runner {runner_id} to be removed, got HTTP {code}")

    def scale_down_routes(self, runner_id: int, log_group: str | None = None) -> None:
        try:
            self.verify_route("POST", "/api/v3/app/installations/123/access_tokens", "Scale-down requested a GitHub App token")
            self.verify_route("GET", "/api/v3/orgs/test-owner/actions/runners", "Scale-down listed organization runners")
            self.verify_route("GET", f"/api/v3/orgs/test-owner/actions/runners/{runner_id}", "Scale-down checked runner state")
            self.verify_route("DELETE", f"/api/v3/orgs/test-owner/actions/runners/{runner_id}", "Scale-down deleted the GitHub runner")
        except RuntimeError as error:
            if log_group is None:
                raise
            messages = self.recent_log_messages(log_group)
            raise RuntimeError(f"{error}. Recent messages in {log_group}: {messages}") from error

    def scale_up_routes(self, job_id: int, provider: str) -> None:
        self.verify_route("POST", "/api/v3/app/installations/123/access_tokens", f"{provider} scale-up requested a GitHub token for {job_id}")
        self.verify_route("GET", f"/api/v3/repos/test-owner/test-repo/actions/jobs/{job_id}", f"{provider} scale-up checked queued job {job_id}")

    def pool_routes(self, provider: str) -> None:
        self.verify_route("GET", "/api/v3/orgs/test-owner/installation", f"{provider} pool looked up the GitHub App installation")
        self.verify_route("POST", "/api/v3/app/installations/123/access_tokens", f"{provider} pool requested a GitHub token")
        self.verify_route("GET", "/api/v3/orgs/test-owner/actions/runners", f"{provider} pool listed organization runners")

    def prepare(self, *, scale_set_image: str) -> None:
        self.progress("Preparing multi-runner-orchestration smoke deployment")
        commands = ("aws", "openssl", "terraform")
        for command in commands:
            self.command(command)
        key_path = Path(tempfile.mkstemp(prefix="ministack-smoke-key.")[1])
        try:
            self.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(key_path)], check=True)
            key = base64.b64encode(key_path.read_bytes()).decode()
        finally:
            key_path.unlink(missing_ok=True)
        source = self.script_dir / "multi-runner-orchestration.tfvars"
        text = source.read_text()
        text, replacements = re.subn(
            r'(?m)^([ \t]*key_base64[ \t]*=[ \t]*)"[^"]*"',
            lambda match: f'{match.group(1)}"{key}"',
            text,
            count=1,
        )
        if replacements != 1:
            raise RuntimeError("Could not find github_app.key_base64 in the MiniStack tfvars fixture")
        if "MINISTACK_SCALE_SET_IMAGE" not in text:
            raise RuntimeError("Scale-set image placeholder is missing from the MiniStack tfvars fixture")
        text = text.replace("MINISTACK_SCALE_SET_IMAGE", scale_set_image)
        lambda_archives = (
            ("runners_lambda_zip", "runners.zip", "lambdas/functions/control-plane/runners.zip"),
            ("webhook_lambda_zip", "webhook.zip", "lambdas/functions/webhook/webhook.zip"),
        )
        for variable, filename, function_path in lambda_archives:
            candidates = (
                self.source_root / "lambda_output" / filename,
                self.source_root / function_path,
            )
            archive = next((candidate for candidate in candidates if candidate.is_file()), None)
            if archive is None:
                raise RuntimeError(
                    f"Missing {filename}; run .ci/build.sh before the MiniStack smoke test"
                )
            if not zipfile.is_zipfile(archive):
                raise RuntimeError(
                    f"Invalid or empty {filename} at {archive}; run .ci/build.sh before the MiniStack smoke test"
                )
            with zipfile.ZipFile(archive) as archive_file:
                if not archive_file.namelist():
                    raise RuntimeError(
                        f"Empty {filename} at {archive}; run .ci/build.sh before the MiniStack smoke test"
                    )
            assignment = f'{variable} = "{archive}"'
            text, replacements = re.subn(
                rf"(?m)^{re.escape(variable)}\s*=.*$",
                lambda _: assignment,
                text,
                count=1,
            )
            if not replacements:
                text += f"\n{assignment}\n"
        self.tfvars_path = Path(tempfile.mkstemp(prefix="terraform-aws-github-runner-smoke.")[1])
        self.tfvars_path.write_text(text + "\n")
        self.progress("Applying multi-runner-orchestration Terraform example")
        self.run(
            [str(self.source_root / "tests/ministack/run-example.sh"), "apply", "multi-runner-orchestration", str(self.tfvars_path)],
            stream=True,
        )
        self.webhook_endpoint = self.terraform("output", "-raw", "webhook_endpoint")
        self.webhook_secret = self.terraform("output", "-raw", "webhook_secret", log_output=False)
        self.wait_for_webhook_route()
        self.progress("Deployment ready")

    def wait_for_webhook_route(self) -> None:
        hostname = urlsplit(self.webhook_endpoint).hostname
        if not hostname:
            raise RuntimeError(f"Invalid webhook endpoint: {self.webhook_endpoint}")
        api_id = hostname.split(".", 1)[0]

        def route_ready() -> bool:
            routes = self.aws(
                "apigatewayv2",
                "get-routes",
                "--api-id",
                api_id,
                check=False,
            ) or {}
            return any(route.get("RouteKey") == "POST /webhook" for route in routes.get("Items", []))

        self.wait_for(route_ready, "API Gateway POST /webhook route", attempts=30)

    def cleanup(self) -> None:
        if self.microvm_enabled:
            self.progress("MicroVM lifecycle hook container logs (last 200 lines):")
            self.run(
                ["docker", "logs", "--timestamps", "--tail", "200", "microvm-lifecycle-hook"],
                check=False,
                stream=True,
            )
            self.run(["docker", "rm", "--force", "microvm-lifecycle-hook"], check=False)
        for instance_id in self.discovered_instance_ids:
            self.aws("ec2", "terminate-instances", "--instance-ids", instance_id, check=False)
        for microvm_id in self.discovered_microvm_ids:
            self.aws(
                "lambda-microvms",
                "terminate-microvm",
                "--microvm-identifier",
                microvm_id,
                check=False,
            )
        if self.tfvars_path and self.keep_deployment:
            self.progress(f"Terraform deployment retained; tfvars file: {self.tfvars_path}")
        elif self.tfvars_path:
            self.progress("Destroying multi-runner-orchestration Terraform deployment")
            self.run(
                [
                    str(self.source_root / "tests/ministack/run-example.sh"),
                    "destroy",
                    "multi-runner-orchestration",
                    str(self.tfvars_path),
                ],
                stream=True,
            )
            self.tfvars_path.unlink(missing_ok=True)
        self.response_path.unlink(missing_ok=True)


def shutil_which(name: str) -> str | None:
    for directory in os.environ.get("PATH", "").split(os.pathsep):
        candidate = Path(directory) / name
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None
