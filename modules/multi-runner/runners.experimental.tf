moved {
  from = module.runner_stacks
  to   = module.runner_configs
}

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
  orchestration = {
    webhook = each.value.orchestration.webhook == null ? null : {
      runner = each.value.orchestration.webhook.runner
      github = each.value.orchestration.webhook.github
      queue = merge(each.value.orchestration.webhook.queue, {
        build = {
          arn = aws_sqs_queue.queued_builds[each.key].arn
          url = aws_sqs_queue.queued_builds[each.key].url
        }
      })
      lambda    = each.value.orchestration.webhook.lambda
      job_retry = each.value.orchestration.webhook.job_retry
    }
  }
  ssm              = each.value.ssm
  observability    = each.value.observability
  compute_provider = each.value.compute_provider
}
