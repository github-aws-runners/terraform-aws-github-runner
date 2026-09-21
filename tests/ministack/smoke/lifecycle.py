"""Provider-neutral webhook and runner lifecycle scenarios."""

from __future__ import annotations

from .common import SmokeContext
from .provider import RunnerResource, SmokeProvider


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


def run(context: SmokeContext, provider: SmokeProvider) -> None:
    print(f"Running {provider.display_name} webhook lifecycle scenarios", flush=True)
    provider.configure(context)

    scale_up = _scale_up(context, provider, 123456, False, "scale-up-lambda")
    dynamic_scale_up = _scale_up(context, provider, 123457, True, "scale-up-lambda")
    # The two webhook scale-ups above already create two managed runners. Ask
    # the pool to reach three so it has to create the third runner and exercise
    # its runner-group/JIT path as well.
    pool = _pool(context, provider, pool_size=3)

    scale_down_runners = [
        (987654321, scale_up),
        (987654323, dynamic_scale_up),
        (987654322, pool),
    ]
    for resource, runner_id, marker, check in (
        (scale_up, 987654321, f"multi-runner-webhook-{provider.slug}-scale-up-scale-down", "scale_down_standard"),
        (dynamic_scale_up, 987654323, f"multi-runner-webhook-{provider.slug}-dynamic-scale-down", "scale_down_dynamic"),
        (pool, 987654322, f"multi-runner-webhook-{provider.slug}-pool-scale-down", "scale_down_pool"),
    ):
        print(f"  {provider.display_name}: scale-down resource {resource.identifier}", flush=True)
        provider.scale_down(context, resource, runner_id, marker, scale_down_runners)
        context.mark_check(provider.slug, check)
        scale_down_runners = [
            (active_runner_id, active_resource)
            for active_runner_id, active_resource in scale_down_runners
            if active_runner_id != runner_id
        ]
