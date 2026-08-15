module "runner_stacks" {
  source   = "../runner-stack"
  for_each = local.use_multi_runner_config_v2 ? local.translated_experimental.multi_runner_config : {}

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
  queue = merge(each.value.queue, {
    build = {
      arn = aws_sqs_queue.queued_builds[each.key].arn
      url = aws_sqs_queue.queued_builds[each.key].url
    }
  })
  lambda           = each.value.lambda
  scale_up         = each.value.lambda.scale_up
  scale_down       = each.value.lambda.scale_down
  pool             = each.value.lambda.pool
  job_retry        = each.value.job_retry
  ssm              = each.value.ssm
  observability    = each.value.observability
  compute_provider = each.value.compute_provider
}
