module "cache" {
  count = var.create_cache_bucket ? 1 : 0

  source = "./cache"

  config = {
    prefix = var.prefix
    tags   = local.tags
    arn_runner_instance_role = aws_iam_role.runner.arn
  }
}
