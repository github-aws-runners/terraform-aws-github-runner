"""Compute-provider contract for the scale-set controller smoke test."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from .scale_set import ScaleSetSmoke


@dataclass(frozen=True)
class ScaleSetRunner:
    """A runner resource discovered by a compute-provider adapter."""

    identifier: str


class ScaleSetProvider(Protocol):
    """Provider-specific configuration and runner lifecycle assertions."""

    slug: str
    display_name: str

    def configure_tfvars(self, smoke: ScaleSetSmoke, source: str) -> str:
        """Return provider-specific test configuration based on the fixture."""

    def wait_for_runner(self, smoke: ScaleSetSmoke) -> ScaleSetRunner:
        """Wait until the controller has created one provider runner."""

    def verify_runner(self, smoke: ScaleSetSmoke, runner: ScaleSetRunner) -> None:
        """Check provider-specific runner metadata after scale-up."""

    def wait_for_scale_down(self, smoke: ScaleSetSmoke) -> None:
        """Wait until no active runners owned by this scale set remain."""
