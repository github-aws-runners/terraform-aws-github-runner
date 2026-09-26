"""EC2 adapter for scale-set runner lifecycle assertions."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from .scale_set_provider import ScaleSetRunner

if TYPE_CHECKING:
    from .scale_set_scenario import ScaleSetScenario


class Ec2ScaleSetProvider:
    slug = "ec2"
    display_name = "EC2"
    group_name = "ec2_scalet_set"
    runner_name = "ec2_scalet_set"

    def _instances(self, smoke: ScaleSetScenario, *, runner_only: bool) -> list[dict[str, Any]]:
        response = smoke.aws("ec2", "describe-instances") or {}
        expected = {
            "ghr:Application": "github-action-runner",
            "ghr:created_by": "scale-set-service",
            "ghr:environment": f"{smoke.environment_name}-{smoke.group_name}",
            "ghr:Type": "Org",
            "ghr:Owner": "example",
        }
        if runner_only:
            expected.update({"ghr:scale_set_state": "config-published", "ghr:github_runner_id": smoke.runner_id})
        active_states = {"pending", "running", "stopping", "stopped", "shutting-down"}
        matches = []
        for reservation in response.get("Reservations", []):
            for instance in reservation.get("Instances", []):
                if instance.get("State", {}).get("Name") not in active_states:
                    continue
                tags = {tag.get("Key"): tag.get("Value") for tag in instance.get("Tags", [])}
                if all(tags.get(key) == value for key, value in expected.items()):
                    runner_prefix = "ec2_scalet_set-"
                    if not runner_only or tags.get("ghr:runner_name", "").startswith(runner_prefix):
                        matches.append(instance)
        return matches

    def wait_for_runner(self, smoke: ScaleSetScenario) -> ScaleSetRunner:
        def find_runner() -> ScaleSetRunner | None:
            matches = self._instances(smoke, runner_only=True)
            if len(matches) == 1 and matches[0].get("InstanceId"):
                return ScaleSetRunner(matches[0]["InstanceId"])
            return None

        runner = smoke.wait_for(find_runner, "one config-published scale-set EC2 runner")
        smoke.progress(f"MiniStack created and registered scale-set EC2 runner {runner.identifier}")
        return runner

    def verify_runner(self, smoke: ScaleSetScenario, runner: ScaleSetRunner) -> None:
        response = smoke.aws("ec2", "describe-instances", "--instance-ids", runner.identifier) or {}
        try:
            instance = response["Reservations"][0]["Instances"][0]
        except (IndexError, KeyError, TypeError) as error:
            raise RuntimeError(f"Could not inspect scale-set EC2 runner {runner.identifier}") from error
        tags = {tag.get("Key"): tag.get("Value") for tag in instance.get("Tags", [])}
        expected = {
            "ghr:Application": "github-action-runner",
            "ghr:created_by": "scale-set-service",
            "ghr:environment": f"{smoke.environment_name}-{smoke.group_name}",
            "ghr:Type": "Org",
            "ghr:Owner": "example",
            "ghr:scale_set_state": "config-published",
            "ghr:github_runner_id": smoke.runner_id,
        }
        for key, value in expected.items():
            if tags.get(key) != value:
                raise RuntimeError(f"Unexpected EC2 runner tag {key}: expected {value}, got {tags.get(key)}")

    def wait_for_scale_down(self, smoke: ScaleSetScenario) -> None:
        smoke.wait_for(lambda: not self._instances(smoke, runner_only=False),
                       "all scale-set EC2 runners to terminate")
        smoke.progress("Scale-set EC2 runner was terminated after the minimum changed to zero")


provider = Ec2ScaleSetProvider()
