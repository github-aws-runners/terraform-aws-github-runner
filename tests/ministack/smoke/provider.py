"""Interface implemented by each compute provider smoke test."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from .common import SmokeContext


@dataclass(frozen=True)
class RunnerResource:
    """Provider resource created by one smoke scenario."""

    identifier: str


class SmokeProvider(Protocol):
    slug: str
    display_name: str

    def configure(self, context: SmokeContext) -> None:
        """Add provider-specific MockServer expectations."""

    def event(self, context: SmokeContext, job_id: int, dynamic: bool) -> dict[str, Any]:
        """Build a workflow_job event that selects this provider."""

    def verify_scale_up_routes(self, context: SmokeContext, job_id: int) -> None:
        """Verify provider-specific GitHub API calls made during scale-up."""

    def verify_pool_routes(self, context: SmokeContext) -> None:
        """Verify provider-specific GitHub API calls made during pool scale-up."""

    def wait_for_scale_up(self, context: SmokeContext, source: str) -> RunnerResource:
        """Find the resource created by a scale-up Lambda."""

    def assert_scale_up(self, context: SmokeContext, resource: RunnerResource, dynamic: bool) -> None:
        """Check provider-specific scale-up state and ownership."""

    def wait_for_pool(self, context: SmokeContext, source: str) -> RunnerResource:
        """Find the resource created by a pool Lambda."""

    def assert_pool(self, context: SmokeContext, resource: RunnerResource) -> None:
        """Check provider-specific pool state and ownership."""

    def scale_down(
        self,
        context: SmokeContext,
        resource: RunnerResource,
        runner_id: int,
        marker: str,
        active_runners: list[tuple[int, RunnerResource]],
    ) -> None:
        """Run provider-specific scale-down checks for one resource."""
