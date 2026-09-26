"""Provider contract for scale-set lifecycle assertions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from .scale_set_scenario import ScaleSetScenario


@dataclass(frozen=True)
class ScaleSetRunner:
    """A runner resource discovered by a compute-provider adapter."""

    identifier: str


class ScaleSetProvider(Protocol):
    """Provider-specific configuration and runner lifecycle assertions."""

    slug: str
    display_name: str
    group_name: str
    runner_name: str

    def wait_for_runner(self, smoke: ScaleSetScenario) -> ScaleSetRunner:
        """Wait until the controller has created one provider runner."""

    def verify_runner(self, smoke: ScaleSetScenario, runner: ScaleSetRunner) -> None:
        """Check provider-specific runner metadata after scale-up."""

    def wait_for_scale_down(self, smoke: ScaleSetScenario) -> None:
        """Wait until no active runners owned by this scale set remain."""
