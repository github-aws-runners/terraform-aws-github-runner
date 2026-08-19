module "runner_configs" {
  source = "../runner-config"
  for_each = {
    for runner_key, runner_config in local.translated_experimental.multi_runner_config :
    runner_key => runner_config if local.use_multi_runner_config_v2
  }

  aws_region    = var.aws_region
  aws_partition = var.aws_partition
  prefix        = "${var.prefix}-${each.key}"

  tags = merge(
    each.value.tags,
    { "ghr:environment" = var.prefix },
  )
  runner = each.value.runner
  github = merge(each.value.github, {
    app_parameters = local.github_app_parameters
  })
  lambda = each.value.lambda
  storage_provider = {
    type       = local.storage_provider_type
    scale_up   = local.storage_provider_capabilities.entries[each.key].scale_up
    scale_down = local.storage_provider_capabilities.entries[each.key].scale_down
    pool       = local.storage_provider_capabilities.entries[each.key].pool
    job_retry  = local.storage_provider_capabilities.entries[each.key].job_retry
    runner     = local.storage_provider_capabilities.entries[each.key].runner
  }
  orchestration_provider = {
    webhook = each.value.orchestration_provider.webhook == null ? null : {
      runner = each.value.orchestration_provider.webhook.runner
      github = each.value.orchestration_provider.webhook.github
      queue = merge(each.value.orchestration_provider.webhook.queue, {
        build = {
          arn = aws_sqs_queue.queued_builds[each.key].arn
          url = aws_sqs_queue.queued_builds[each.key].url
        }
      })
      lambda    = each.value.orchestration_provider.webhook.lambda
      job_retry = each.value.orchestration_provider.webhook.job_retry
    }
  }
  ssm                  = each.value.ssm
  observability        = each.value.observability
  compute_provider     = each.value.compute_provider
  compute_provider_key = try(local.compute_provider_keys[each.key], null)
}
