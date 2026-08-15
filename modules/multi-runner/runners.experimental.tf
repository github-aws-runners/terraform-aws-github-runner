module "runner_stacks" {
  source = "../runner-stack"
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
      github = each.value.orchestration.webhook.github
      queue = merge(each.value.orchestration.webhook.queue, {
        build = {
          arn = aws_sqs_queue.queued_builds[each.key].arn
          url = aws_sqs_queue.queued_builds[each.key].url
        }
      })
      scale_up   = each.value.orchestration.webhook.lambda.scale_up
      scale_down = each.value.orchestration.webhook.lambda.scale_down
      pool       = each.value.orchestration.webhook.lambda.pool
      job_retry  = each.value.orchestration.webhook.job_retry
    }
    scale_set = each.value.orchestration.scale_set == null ? null : merge(each.value.orchestration.scale_set, {
      ecs = merge(each.value.orchestration.scale_set.ecs, {
        vpc_id = coalesce(
          each.value.orchestration.scale_set.ecs.vpc_id,
          each.value.compute_provider.ec2.vpc_id,
        )
        subnet_ids = coalesce(
          each.value.orchestration.scale_set.ecs.subnet_ids,
          length(each.value.lambda.subnet_ids) > 0 ? each.value.lambda.subnet_ids : each.value.compute_provider.ec2.subnet_ids,
        )
      })
    })
  }
  ssm              = each.value.ssm
  observability    = each.value.observability
  compute_provider = each.value.compute_provider
}
