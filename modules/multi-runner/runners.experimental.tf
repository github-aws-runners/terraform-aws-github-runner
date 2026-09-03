module "runner_configs" {
  source = "../runner-config"
  for_each = {
    for runner_key, runner_config in local.effective_config.multi_runner_config :
    runner_key => runner_config if local.use_v2_config
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
    scale_set = each.value.orchestration_provider.scale_set == null ? null : {}
  }
  ssm              = each.value.ssm
  observability    = each.value.observability
  compute_provider = each.value.compute_provider
}
