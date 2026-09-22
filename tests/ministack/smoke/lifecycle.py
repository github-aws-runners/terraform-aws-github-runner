"""Provider-neutral webhook and runner lifecycle scenarios."""

from __future__ import annotations

from .common import SmokeContext
from .provider import RunnerResource, SmokeProvider

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
    print(f"  {provider.display_name}: scale-up {label_mode} (job {job_id})", flush=True)
    context.clear_runner_group_cache(provider.slug)
    context.clear_requests()
    context.send_webhook(provider.event(context, job_id, dynamic), f"multi-runner-webhook-{provider.slug}-{job_id}")
    context.mark_check(provider.slug, "webhook")
    _wait_for_webhook_chain(context, provider, job_id)
    context.mark_check(provider.slug, "chain")
    context.scale_up_routes(job_id, provider.display_name)
    provider.verify_scale_up_routes(context, job_id)
    context.mark_check(provider.slug, "scale_up_dynamic_routes" if dynamic else "scale_up_standard_routes")
    resource = provider.wait_for_scale_up(context, source)
    provider.assert_scale_up(context, resource, dynamic)
    context.mark_check(provider.slug, "scale_up_dynamic_resource" if dynamic else "scale_up_standard_resource")
    return resource


def _pool(context: SmokeContext, provider: SmokeProvider, pool_size: int) -> RunnerResource:
    print(f"  {provider.display_name}: pool scale-up (target size {pool_size})", flush=True)
    context.configure_empty_runner_list()
    context.clear_runner_group_cache(provider.slug)
    context.clear_requests()
    context.invoke(
        f"multi-runner-webhook-{provider.slug}-pool",
        {"poolSize": pool_size, "type": provider.slug},
        f"{provider.display_name} pool Lambda invoked",
    )
    context.pool_routes(provider.display_name)
    provider.verify_pool_routes(context)
    context.mark_check(provider.slug, "pool_routes")
    resource = provider.wait_for_pool(context, "pool-lambda")
    print(f"  {provider.display_name}: pool created resource {resource.identifier}", flush=True)
    provider.assert_pool(context, resource)
    context.mark_check(provider.slug, "pool_resource")
    return resource


def _scale_down(
    context: SmokeContext,
    provider: SmokeProvider,
    resource: RunnerResource,
    runner_id: int,
    marker: str,
    check: str,
) -> None:
    print(f"  {provider.display_name}: scale-down resource {resource.identifier}", flush=True)
    provider.scale_down(context, resource, runner_id, marker, [(runner_id, resource)])
    context.mark_check(provider.slug, check)


def run(context: SmokeContext, provider: SmokeProvider) -> None:
    print(f"Running {provider.display_name} webhook lifecycle scenarios", flush=True)
    provider.configure(context)

    scale_up = _scale_up(context, provider, 123456, False, "scale-up-lambda")
    _scale_down(
        context,
        provider,
        scale_up,
        MOCK_JIT_RUNNER_ID,
        f"multi-runner-webhook-{provider.slug}-scale-up-scale-down",
        "scale_down_standard",
    )

    dynamic_scale_up = _scale_up(context, provider, 123457, True, "scale-up-lambda")
    _scale_down(
        context,
        provider,
        dynamic_scale_up,
        MOCK_JIT_RUNNER_ID,
        f"multi-runner-webhook-{provider.slug}-dynamic-scale-down",
        "scale_down_dynamic",
    )

    pool = _pool(context, provider, pool_size=1)
    _scale_down(
        context,
        provider,
        pool,
        MOCK_JIT_RUNNER_ID,
        f"multi-runner-webhook-{provider.slug}-pool-scale-down",
        "scale_down_pool",
    )
