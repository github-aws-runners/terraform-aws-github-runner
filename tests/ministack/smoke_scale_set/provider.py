"""Compute-provider contract for the scale-set controller smoke test."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from .scale_set import ScaleSetSmokeContext


@dataclass(frozen=True)
class ScaleSetRunner:
    """A runner resource discovered by a compute-provider adapter."""

    identifier: str


class ScaleSetProvider(Protocol):
    """Provider-specific configuration and runner lifecycle assertions."""

    slug: str
    display_name: str

    def configure_tfvars(self, smoke: ScaleSetSmokeContext, source: str) -> str:
        """Return provider-specific test configuration based on the fixture."""

    def wait_for_runner(self, smoke: ScaleSetSmokeContext) -> ScaleSetRunner:
        """Wait until the controller has created one provider runner."""

    def verify_runner(self, smoke: ScaleSetSmokeContext, runner: ScaleSetRunner) -> None:
        """Check provider-specific runner metadata after scale-up."""

    def wait_for_scale_down(self, smoke: ScaleSetSmokeContext) -> None:
        """Wait until no active runners owned by this scale set remain."""
