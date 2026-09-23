"""Shared MiniStack smoke-test plumbing."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

class SmokeContext:
    def __init__(self, script_dir: Path, *, keep_deployment: bool = False) -> None:
        self.script_dir = script_dir
        self.fixture_dir = Path(__file__).parent / "fixtures"
        self.source_root = script_dir.parent.parent
        self.example_root = self.source_root / "examples" / "multi-runner-webhook"
        self.aws_endpoint = os.environ.get("AWS_ENDPOINT_URL", "http://localhost:4566")
        self.region = os.environ.get("AWS_DEFAULT_REGION", "eu-west-1")
        self.environment = os.environ.copy()
        self.environment.setdefault("AWS_ACCESS_KEY_ID", "000000000000")
        self.environment.setdefault("AWS_SECRET_ACCESS_KEY", "test-only")
        self.environment.setdefault("AWS_DEFAULT_REGION", self.region)
        self.environment.setdefault("AWS_REGION", self.region)
        self.environment.setdefault("AWS_ENDPOINT_URL", self.aws_endpoint)
        self.environment.setdefault("AWS_EC2_METADATA_DISABLED", "true")
        self.mock_host = os.environ.get("MINISTACK_GITHUB_MOCK_HOST", "host.docker.internal")
        self.mock_url = os.environ.get("MINISTACK_GITHUB_MOCK_URL")
        self.mock_port = int(os.environ.get("MINISTACK_GITHUB_MOCK_PORT", "0") or 0)
        self.tfvars_path: Path | None = None
        self.webhook_endpoint = ""
        self.webhook_secret = ""
        self.discovered_instance_ids: list[str] = []
        self.discovered_microvm_ids: list[str] = []
        self.before_microvm_ids: set[str] = set()
        self.response_path = Path(tempfile.mkstemp(prefix="ministack-smoke-response.")[1])
        self.checklist_path = Path(os.environ.get("MINISTACK_SMOKE_CHECKLIST_FILE", "ministack-smoke-checklist.txt"))
        self.checklist: dict[str, list[dict[str, str | bool]]] = {}
        self.checklist_failure = ""
        self.keep_deployment = keep_deployment or os.environ.get("MINISTACK_SMOKE_KEEP_DEPLOYMENT") == "1"

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
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            command,
            check=check,
            text=True,
            capture_output=not stream,
            env=self.environment,
            cwd=cwd,
        )

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

    def terraform(self, *args: str, check: bool = True) -> str:
        result = self.run(["terraform", f"-chdir={self.example_root}", *args], check=check)
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

    def wait_for(self, predicate, description: str, attempts: int = 60) -> Any:
        for attempt in range(1, attempts + 1):
            result = predicate()
            if result:
                return result
            if attempt == 1 or attempt % 10 == 0:
                print(f"    Still waiting for {description} ({attempt}/{attempts})", flush=True)
            time.sleep(2)
        raise RuntimeError(f"Timed out waiting for {description}")

    def initialize_checklist(self, providers: list[str]) -> None:
        checks = (
            ("webhook", "API Gateway accepted the signed workflow_job webhook (HTTP 201)"),
            ("chain", "Webhook, EventBridge, dispatcher, SQS, and scale-up logs contain the workflow job"),
            ("scale_up_standard_routes", "Standard scale-up called every expected GitHub API route"),
            ("scale_up_standard_resource", "Standard scale-up created the expected compute resource"),
            ("scale_up_dynamic_routes", "Dynamic-label scale-up called every expected GitHub API route"),
            ("scale_up_dynamic_resource", "Dynamic-label scale-up created the expected compute resource"),
            ("pool_routes", "Pool called every expected GitHub API route"),
            ("pool_resource", "Pool created the expected compute resource"),
            ("scale_down_standard", "Scale-down removed the standard runner and compute resource"),
            ("scale_down_dynamic", "Scale-down removed the dynamic-label runner and compute resource"),
            ("scale_down_pool", "Scale-down removed the pool runner and compute resource"),
        )
        if "microvm" in providers:
            checks += (("microvm_hook", "MicroVM lifecycle hook consumed SSM and handed off the JIT runner"),)
        self.checklist = {
            provider: [{"key": key, "label": label, "passed": False} for key, label in checks]
            for provider in providers
        }
        self._write_checklist("running")
        print(f"Writing smoke checklist to {self.checklist_path}", flush=True)

    def mark_check(self, provider: str, key: str) -> None:
        for check in self.checklist.get(provider, []):
            if check["key"] == key:
                check["passed"] = True
                break
        self._write_checklist("running")

    def record_checklist_failure(self, error: BaseException) -> None:
        self.checklist_failure = f"{type(error).__name__}: {error}"

    def finish_checklist(self, passed: bool) -> None:
        self._write_checklist("passed" if passed else "failed")

    def update_checklist_status(self, status: str) -> None:
        self._write_checklist(status)

    def _write_checklist(self, status: str) -> None:
        lines = [f"MiniStack multi-runner-webhook smoke checklist", f"Status: {status}"]
        if self.checklist_failure:
            lines.append(f"Failure: {self.checklist_failure}")
        for provider, checks in self.checklist.items():
            lines.append("")
            lines.append(f"[{provider}]")
            lines.extend(f"  [{'x' if check['passed'] else ' '}] {check['label']}" for check in checks)
        self.checklist_path.parent.mkdir(parents=True, exist_ok=True)
        self.checklist_path.write_text("\n".join(lines) + "\n")

    def configure_mockserver(self) -> None:
        if not self.mock_url:
            raise RuntimeError("MINISTACK_GITHUB_MOCK_URL must point to an already-running MockServer")
        print(f"Using external MockServer at {self.mock_url}", flush=True)
        if not self.mock_port:
            self.mock_port = urlsplit(self.mock_url).port or 1080
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
        print(f"    Clearing {provider} runner-group cache", flush=True)
        self.aws("ssm", "delete-parameter", "--name", parameter_name, check=False)

    def clear_requests(self) -> None:
        print("    Clearing MockServer request history", flush=True)
        code, _ = self.http("PUT", f"{self.mock_url}/mockserver/clear?type=log")
        if code >= 300:
            raise RuntimeError("Failed to clear MockServer request history")
        print("    MockServer request history cleared", flush=True)

    def verify_route(self, method: str, path: str, description: str) -> None:
        def verify() -> bool:
            code, _ = self.http(
                "PUT",
                f"{self.mock_url}/mockserver/verify",
                {"httpRequest": {"method": method, "path": path}, "times": {"atLeast": 1}},
            )
            return code < 300

        self.wait_for(verify, description)

    def send_webhook(self, event: dict[str, Any], delivery_id: str) -> None:
        payload = json.dumps(event).encode()
        signature = hmac.new(self.webhook_secret.encode(), payload, hashlib.sha256).hexdigest()
        parsed_endpoint = urlsplit(self.webhook_endpoint)
        endpoint = urlunsplit((parsed_endpoint.scheme, f"localhost:{parsed_endpoint.port or 4566}", parsed_endpoint.path, parsed_endpoint.query, parsed_endpoint.fragment))
        print(f"    Sending webhook {delivery_id} to {endpoint} (Host: {parsed_endpoint.netloc})", flush=True)
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
        if status != 201:
            raise RuntimeError(f"Webhook smoke request failed with HTTP {status}")
        print(f"    Webhook {delivery_id} accepted with HTTP 201", flush=True)

    def wait_for_log(self, group: str, marker: str, description: str) -> None:
        print(f"    Waiting for {description} ({group})", flush=True)
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
        print(f"    Found {description}", flush=True)

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

    def scale_down_routes(self, runner_id: int) -> None:
        self.verify_route("POST", "/api/v3/app/installations/123/access_tokens", "Scale-down requested a GitHub App token")
        self.verify_route("GET", "/api/v3/orgs/test-owner/actions/runners", "Scale-down listed organization runners")
        self.verify_route("GET", f"/api/v3/orgs/test-owner/actions/runners/{runner_id}", "Scale-down checked runner state")
        self.verify_route("DELETE", f"/api/v3/orgs/test-owner/actions/runners/{runner_id}", "Scale-down deleted the GitHub runner")

    def scale_up_routes(self, job_id: int, provider: str) -> None:
        self.verify_route("POST", "/api/v3/app/installations/123/access_tokens", f"{provider} scale-up requested a GitHub token for {job_id}")
        self.verify_route("GET", f"/api/v3/repos/test-owner/test-repo/actions/jobs/{job_id}", f"{provider} scale-up checked queued job {job_id}")

    def pool_routes(self, provider: str) -> None:
        self.verify_route("GET", "/api/v3/orgs/test-owner/installation", f"{provider} pool looked up the GitHub App installation")
        self.verify_route("POST", "/api/v3/app/installations/123/access_tokens", f"{provider} pool requested a GitHub token")
        self.verify_route("GET", "/api/v3/orgs/test-owner/actions/runners", f"{provider} pool listed organization runners")

    def prepare(self) -> None:
        print("Preparing multi-runner-webhook smoke deployment", flush=True)
        commands = ("aws", "openssl", "terraform")
        for command in commands:
            self.command(command)
        self.configure_mockserver()
        key_path = Path(tempfile.mkstemp(prefix="ministack-smoke-key.")[1])
        try:
            self.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(key_path)], check=True)
            key = base64.b64encode(key_path.read_bytes()).decode()
        finally:
            key_path.unlink(missing_ok=True)
        source = self.script_dir / "multi-runner-webhook.tfvars"
        text = source.read_text().replace('key_base64     = "ministack-invalid-key"', f'key_base64     = "{key}"')
        self.tfvars_path = Path(tempfile.mkstemp(prefix="terraform-aws-github-runner-smoke.")[1])
        additions = [
            "github_enterprise_server = {",
            f'  url        = "http://{self.mock_host}:{self.mock_port}"',
            "  ssl_verify = false",
            "}",
        ]
        if "runners_lambda_zip" not in text:
            additions.append(f'runners_lambda_zip = "{self.source_root / "lambdas/functions/control-plane/runners.zip"}"')
        if "webhook_lambda_zip" not in text:
            additions.append(f'webhook_lambda_zip = "{self.source_root / "lambdas/functions/webhook/webhook.zip"}"')
        self.tfvars_path.write_text(text + "\n" + "\n".join(additions) + "\n")
        print("Applying multi-runner-webhook Terraform example", flush=True)
        self.run(
            [str(self.source_root / "tests/ministack/run-example.sh"), "apply", "multi-runner-webhook", str(self.tfvars_path)],
            stream=True,
        )
        self.webhook_endpoint = self.terraform("output", "-raw", "webhook_endpoint")
        self.webhook_secret = self.terraform("output", "-raw", "webhook_secret")
        self.wait_for_webhook_route()
        print("Deployment ready; starting provider lifecycle checks", flush=True)

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
        self.update_checklist_status("cleanup")
        if "microvm" in self.checklist:
            print("MicroVM lifecycle hook container logs (last 200 lines):", flush=True)
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
            print(f"Terraform deployment retained; tfvars file: {self.tfvars_path}", flush=True)
        elif self.tfvars_path:
            print("Destroying multi-runner-webhook Terraform deployment", flush=True)
            self.run(
                [
                    str(self.source_root / "tests/ministack/run-example.sh"),
                    "destroy",
                    "multi-runner-webhook",
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
