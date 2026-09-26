"""Provider-neutral webhook and runner lifecycle scenarios."""

from __future__ import annotations

from uuid import uuid4

from .common import SmokeContext
from .webhook_provider import RunnerResource, SmokeProvider

MOCK_JIT_RUNNER_ID = 987654321


def _log_group(provider: SmokeProvider, stage: str) -> str:
    # The webhook and EventBridge dispatcher are shared by all compute
    # providers. Only the scale-up Lambda is provider-specific.
    if stage in ("webhook", "dispatch-to-runner"):
        return f"/aws/lambda/multi-runner-webhook-{stage}"
    return f"/aws/lambda/multi-runner-webhook-{provider.slug}-{stage}"


def _wait_for_webhook_chain(context: SmokeContext, provider: SmokeProvider, job_id: int) -> None:
    context.wait_for_log(_log_group(provider, "webhook"), str(job_id), f"{provider.display_name} webhook received job {job_id}")
    context.wait_for_log(_log_group(provider, "dispatch-to-runner"), str(job_id), f"{provider.display_name} dispatcher received job {job_id}")
    context.wait_for_log(_log_group(provider, "scale-up"), str(job_id), f"{provider.display_name} scale-up received job {job_id}")


def _scale_up(
    context: SmokeContext,
    provider: SmokeProvider,
    job_id: int,
    dynamic: bool,
    source: str,
) -> RunnerResource:
    label_mode = "with dynamic label" if dynamic else "without dynamic label"
    with context.step(f"Scale-up {label_mode}"):
        with context.step("Prepare scale-up fixtures"):
            context.clear_runner_group_cache(provider.slug)
            context.clear_requests()
        with context.step("Send webhook"):
            context.send_webhook(
                provider.event(context, job_id, dynamic),
                f"multi-runner-webhook-{provider.slug}-{job_id}",
            )
        with context.step("Wait for webhook chain"):
            _wait_for_webhook_chain(context, provider, job_id)
        with context.step("Verify shared scale-up routes"):
            context.scale_up_routes(job_id, provider.display_name)
        with context.step("Verify provider scale-up routes"):
            provider.verify_scale_up_routes(context, job_id)
        with context.step("Wait for compute resource"):
            resource = provider.wait_for_scale_up(context, source)
        with context.step("Validate compute resource"):
            provider.assert_scale_up(context, resource, dynamic)
        with context.step("Start runner"):
            provider.start_scale_up_runner(context, resource)
        return resource


def _pool(context: SmokeContext, provider: SmokeProvider, pool_size: int) -> RunnerResource:
    with context.step("Pool"):
        with context.step("Prepare pool fixtures"):
            context.configure_empty_runner_list()
            context.clear_runner_group_cache(provider.slug)
            context.clear_requests()
        with context.step("Invoke pool Lambda"):
            context.invoke(
                f"multi-runner-webhook-{provider.slug}-pool",
                {"poolSize": pool_size, "type": provider.slug},
                f"{provider.display_name} pool Lambda invoked",
            )
        with context.step("Verify shared pool routes"):
            context.pool_routes(provider.display_name)
        with context.step("Verify provider pool routes"):
            provider.verify_pool_routes(context)
        with context.step("Wait for compute resource"):
            resource = provider.wait_for_pool(context, "pool-lambda")
        with context.step("Validate compute resource"):
            context.progress(f"Pool created resource {resource.identifier}")
            provider.assert_pool(context, resource)
        return resource


def _scale_down(
    context: SmokeContext,
    provider: SmokeProvider,
    resource: RunnerResource,
    runner_id: int,
    marker: str,
) -> None:
    with context.step("Scale-down"):
        context.progress(f"Scaling down resource {resource.identifier}")
        with context.step("Run provider scale-down checks"):
            provider.scale_down(context, resource, runner_id, marker, [(runner_id, resource)])


def run(context: SmokeContext, provider: SmokeProvider) -> None:
    with context.step("Configure"):
        provider.configure(context)

    scale_up = _scale_up(context, provider, 123456, False, "scale-up-lambda")
    _scale_down(
        context,
        provider,
        scale_up,
        MOCK_JIT_RUNNER_ID,
        f"multi-runner-webhook-{provider.slug}-scale-up-scale-down-{uuid4().hex}",
    )

    dynamic_scale_up = _scale_up(context, provider, 123457, True, "scale-up-lambda")
    _scale_down(
        context,
        provider,
        dynamic_scale_up,
        MOCK_JIT_RUNNER_ID,
        f"multi-runner-webhook-{provider.slug}-dynamic-scale-down-{uuid4().hex}",
    )

    pool = _pool(context, provider, pool_size=1)
    _scale_down(
        context,
        provider,
        pool,
        MOCK_JIT_RUNNER_ID,
        f"multi-runner-webhook-{provider.slug}-pool-scale-down-{uuid4().hex}",
    )
